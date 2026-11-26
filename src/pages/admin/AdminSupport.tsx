import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '../../api/db'
import { fetchSupportChats, fetchSupportMessages, resolveSupportChat, type SupportChat } from '../../api/support'
import { STORE_NAME } from '../../config'
import { whatsappDigits } from '../../lib/support'
import { ListSkeleton } from '../../components/Skeleton'
import { queryKeys } from '../../api/queryKeys'

type Chat = SupportChat

type Filter = 'escalated' | 'resolved'

const when = (iso: string) => new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })

// Admin, then Support: chats the AI handed over. Read the summary, reply on WhatsApp, mark resolved.
export default function AdminSupport() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('escalated')
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const { data: chats, isLoading, error } = useQuery({
    queryKey: queryKeys.admin.support(filter),
    queryFn: () => fetchSupportChats(filter),
    refetchInterval: 30_000,
  })

  async function resolve(chat: Chat) {
    setBusyId(chat.id)
    try {
      await resolveSupportChat(chat.id)
    } catch (err) {
      setBusyId(null)
      return toast.error(errorMessage(err))
    }
    setBusyId(null)
    toast.success('Marked as resolved')
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportRoot() })
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.counts.support() })
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Support</h1>
      <p className="mb-4 text-sm text-gray-500">
        Customers the AI assistant handed over to you. Reply on WhatsApp, then mark the chat resolved.
      </p>

      <div className="mb-4 flex gap-2">
        {(['escalated', 'resolved'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              filter === f ? 'bg-brand text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100'
            }`}
          >
            {f === 'escalated' ? 'Needs you' : 'Resolved'}
          </button>
        ))}
      </div>

      {isLoading && <ListSkeleton />}
      {error && <p className="text-sm text-red-600">Couldn't load chats: {(error as Error).message}</p>}
      {!isLoading && !error && chats?.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          {filter === 'escalated' ? 'No customers waiting. 🎉' : 'Nothing resolved yet.'}
        </p>
      )}

      <ul className="space-y-3">
        {chats?.map((chat) => {
          const name = chat.profiles?.full_name || 'Customer'
          const phone = chat.profiles?.phone?.trim()
          const orderNo = chat.orders?.order_number
          const text = `Hi ${name}, this is ${STORE_NAME} replying to your message${orderNo ? ` about order #${orderNo}` : ''}. `
          const expanded = openId === chat.id
          return (
            <li key={chat.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {name}
                    {orderNo && <span className="ml-2 text-sm font-normal text-gray-500">order #{orderNo}</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(chat.escalation_reason ?? 'other').replace(/_/g, ' ')} · last message {when(chat.last_message_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {phone ? (
                    <a
                      href={`https://wa.me/${whatsappDigits(phone)}?text=${encodeURIComponent(text)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700"
                    >
                      <MessageCircle size={16} /> WhatsApp {phone}
                    </a>
                  ) : (
                    <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-500">No phone on file</span>
                  )}
                  {chat.status === 'escalated' && (
                    <button
                      onClick={() => resolve(chat)}
                      disabled={busyId === chat.id}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:border-brand hover:text-brand disabled:opacity-40"
                    >
                      <CheckCircle2 size={16} /> Resolved
                    </button>
                  )}
                </div>
              </div>

              {chat.summary && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{chat.summary}</p>}

              <button
                onClick={() => setOpenId(expanded ? null : chat.id)}
                className="mt-3 flex items-center gap-1 text-xs font-medium text-brand"
              >
                <ChevronDown size={14} className={expanded ? 'rotate-180' : ''} /> {expanded ? 'Hide' : 'Show'} full chat
              </button>
              {expanded && <Transcript chatId={chat.id} name={name} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Transcript({ chatId, name }: { chatId: string; name: string }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.supportMessages(chatId),
    queryFn: () => fetchSupportMessages(chatId),
  })
  if (isLoading) return <p className="mt-2 text-xs text-gray-400">Loading…</p>
  return (
    <ul className="mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
      {data?.map((m) => (
        <li key={m.id} className="text-sm">
          <span className="font-semibold">{m.role === 'user' ? name : 'AI'}</span>{' '}
          <span className="text-xs text-gray-400">{when(m.created_at)}</span>
          <p className="whitespace-pre-wrap text-gray-700">{m.content}</p>
        </li>
      ))}
    </ul>
  )
}

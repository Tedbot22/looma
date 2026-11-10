import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HeartHandshake, MessageCircle, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { STORE_NAME } from '../config'
import LoomaLogo from './LoomaLogo'
import {
  MAX_SUPPORT_MESSAGE,
  escalateSupportChat,
  openSupportChat,
  sendSupportMessage,
  type SupportMessage,
  type SupportSnapshot,
} from '../lib/support'

const GREETING = `Hi! I'm ${STORE_NAME}'s virtual assistant. I can check an order for you or answer questions about delivery and the store. For anything else I'll bring in an Agent.`

// A floating "Chat with us" button for logged-in customers. The AI answers; "Talk to the owner"
// (or the AI itself, when it can't help) hands the chat to the owner, who replies on WhatsApp.
export default function SupportChat() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  // Shown instantly while the server is still thinking.
  const [pending, setPending] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const key = ['support-chat', user?.id]

  // Loaded only once the panel is opened, so browsing the store costs nothing.
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: openSupportChat,
    enabled: !!user && open,
    staleTime: 0,
  })

  const send = useMutation({
    mutationFn: sendSupportMessage,
    onSettled: () => setPending(null),
    onSuccess: (snap) => queryClient.setQueryData<SupportSnapshot>(key, snap),
    onError: (e: Error) => toast.error(e.message),
  })

  const escalate = useMutation({
    mutationFn: escalateSupportChat,
    onSuccess: (snap) => queryClient.setQueryData<SupportSnapshot>(key, snap),
    onError: (e: Error) => toast.error(e.message),
  })

  const messages: SupportMessage[] = data?.messages ?? []
  const escalated = data?.conversation.status === 'escalated'
  const busy = send.isPending || escalate.isPending

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, pending, open, busy])

  if (!user) return null

  function submit() {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setPending(text)
    send.mutate(text)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Chat with customer care"
        className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-light sm:left-6"
      >
        <MessageCircle size={20} /> Help
      </button>
    )
  }

  return (
    <div
      role="dialog"
      aria-label="Customer care chat"
      className="fixed inset-x-0 bottom-0 z-50 flex h-[75vh] flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-6 sm:left-6 sm:h-[34rem] sm:w-96 sm:rounded-2xl"
    >
      <div className="flex items-center justify-between bg-brand px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <LoomaLogo size={36} />
          <div>
            <p className="text-sm font-semibold">{STORE_NAME} customer care</p>
            <p className="text-xs text-white/70">{escalated ? 'With the owner' : 'Virtual assistant'}</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-full p-1 hover:bg-white/10">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4">
        <Bubble role="assistant" text={GREETING} />
        {isLoading && <p className="text-center text-xs text-gray-400">Loading…</p>}
        {error && <p className="text-center text-xs text-red-600">Couldn't load the chat. Please try again.</p>}
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} text={m.content} />
        ))}
        {pending && <Bubble role="user" text={pending} />}
        {send.isPending && <TypingDots />}
        <div ref={bottomRef} />
      </div>

      {escalated && (
        <p className="flex items-start gap-2 border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <HeartHandshake size={16} className="mt-0.5 shrink-0" />
          An agent has been notified and will contact you on WhatsApp.
        </p>
      )}

      <div className="border-t border-gray-100 bg-white p-3">
        {!escalated && (
          <button
            onClick={() => escalate.mutate()}
            disabled={busy}
            className="mb-2 text-xs font-medium text-brand underline disabled:opacity-40"
          >
            Talk to an agent.
          </button>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            maxLength={MAX_SUPPORT_MESSAGE}
            rows={1}
            placeholder="Type your message…"
            className="max-h-28 min-h-10 flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            onClick={submit}
            disabled={busy || !draft.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand text-white hover:bg-brand-light disabled:opacity-40"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

function Bubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const mine = role === 'user'
  return (
    <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && <LoomaLogo size={24} />}
      <p
        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
          mine ? 'rounded-br-sm bg-brand text-white' : 'rounded-bl-sm border border-gray-200 bg-white text-gray-800'
        }`}
      >
        {text}
      </p>
    </div>
  )
}

// Three bouncing dots while the assistant is replying.
function TypingDots() {
  return (
    <div className="flex items-end gap-2" role="status" aria-label="The assistant is typing">
      <LoomaLogo size={24} />
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-3">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

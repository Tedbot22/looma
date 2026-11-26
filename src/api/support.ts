// Customer care chat. The customer talks to the `support-chat` server function, which knows who they are from
// their login, saves each message, gets the AI's answer, and hands over to the owner when needed.
// The owner reads and closes conversations here too.

import { supabase } from '../lib/supabase'
import type { SupportMessage, SupportSnapshot } from '../lib/support'
import { run, unwrap } from './db'
import { callFunction } from './functions'

const unavailable = (status: number) => `Customer care is unavailable right now (${status}).`
const call = (body: object) => callFunction<SupportSnapshot>('support-chat', body, unavailable)

export const openSupportChat = () => call({ action: 'open' })
export const sendSupportMessage = (message: string) => call({ action: 'send', message })
export const escalateSupportChat = () => call({ action: 'escalate' })

/* ---------------------------- the owner's inbox ---------------------------- */

export interface SupportChat {
  id: string
  status: 'ai' | 'escalated' | 'resolved'
  summary: string | null
  escalation_reason: string | null
  escalated_at: string | null
  last_message_at: string
  orders: { order_number: number } | null
  profiles: { full_name: string | null; phone: string | null } | null
}

// The 100 most recent conversations in one state, most recently active first.
export const fetchSupportChats = (status: SupportChat['status']): Promise<SupportChat[]> =>
  unwrap(
    supabase
      .from('support_conversations')
      .select('id, status, summary, escalation_reason, escalated_at, last_message_at, orders(order_number), profiles(full_name, phone)')
      .eq('status', status)
      .order('last_message_at', { ascending: false })
      .limit(100)
  ) as unknown as Promise<SupportChat[]>

export const resolveSupportChat = (id: string) =>
  run(supabase.from('support_conversations').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id))

// One conversation's messages, oldest first (up to 300).
export const fetchSupportMessages = (chatId: string): Promise<SupportMessage[]> =>
  unwrap(
    supabase
      .from('support_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', chatId)
      .order('created_at', { ascending: true })
      .limit(300)
  )

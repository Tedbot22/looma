import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface SupportMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface SupportConversation {
  id: string
  status: 'ai' | 'escalated' | 'resolved'
  summary: string | null
  escalated_at: string | null
}

export interface SupportSnapshot {
  conversation: SupportConversation
  messages: SupportMessage[]
}

export const MAX_SUPPORT_MESSAGE = 1000

// One door to the server: the `support-chat` function decides who you are from your login,
// saves the message, gets the AI's answer, and hands over to the owner when needed.
async function call(body: object): Promise<SupportSnapshot> {
  const { data, error } = await supabase.functions.invoke('support-chat', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error ?? `Customer care is unavailable right now (${error.context.status}).`)
    }
    throw error
  }
  return data as SupportSnapshot
}

export const openSupportChat = () => call({ action: 'open' })
export const sendSupportMessage = (message: string) => call({ action: 'send', message })
export const escalateSupportChat = () => call({ action: 'escalate' })

// "08012345678" -> "2348012345678" for wa.me links (the owner replying to a customer).
export function whatsappDigits(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.startsWith('0') ? `234${d.slice(1)}` : d
}

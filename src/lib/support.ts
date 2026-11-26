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

// "08012345678" -> "2348012345678" for wa.me links (the owner replying to a customer).
export function whatsappDigits(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.startsWith('0') ? `234${d.slice(1)}` : d
}

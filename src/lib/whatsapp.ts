import { WHATSAPP_NUMBER } from '../config'

// Opens a WhatsApp chat with the owner and a message already typed in.
// The customer still has to tap "send", so this is for contacting the seller,
// NOT for order alerts (those come from the server).
export function whatsappLink(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

// Link to a chat with a specific customer. Nigerian numbers are often saved as
// 08012345678, but wa.me needs the country code: 2348012345678.
export function whatsappLinkTo(phone: string, message: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `234${digits.slice(1)}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

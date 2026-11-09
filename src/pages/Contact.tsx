import type { ReactNode } from 'react'
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { STORE_NAME } from '../config'
import { whatsappLink } from '../lib/whatsapp'
import { useAppSettings } from '../hooks/useAppSettings'
import { FacebookIcon, InstagramIcon, TikTokIcon } from '../components/SocialIcons'

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-gray-200 p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <div className="mt-1 text-sm text-gray-600">{children}</div>
      </div>
    </div>
  )
}

// How to reach the store. The details come from Admin > Store, and anything left empty is simply not shown.
export default function Contact() {
  const { data: settings } = useAppSettings()
  const s = settings ?? {}

  const socials = [
    { url: s.social_facebook, label: 'Facebook', Icon: FacebookIcon },
    { url: s.social_instagram, label: 'Instagram', Icon: InstagramIcon },
    { url: s.social_tiktok, label: 'TikTok', Icon: TikTokIcon },
  ].filter((x) => x.url?.trim())

  return (
    <div className="mx-auto max-w-3xl py-4">
      <h1 className="text-3xl font-bold">Contact us</h1>
      <p className="mb-8 mt-2 text-gray-600">
        Questions about an order, an item or delivery? Reach {STORE_NAME} any of these ways and we'll get back to you.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card icon={<MessageCircle size={20} />} title="WhatsApp (fastest)">
          <a
            href={whatsappLink(`Hi ${STORE_NAME}, I have a question.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand underline"
          >
            Chat with us on WhatsApp
          </a>
        </Card>

        {s.store_email?.trim() && (
          <Card icon={<Mail size={20} />} title="Email">
            <a href={`mailto:${s.store_email}`} className="font-medium text-brand underline">
              {s.store_email}
            </a>
          </Card>
        )}

        {s.store_phone?.trim() && (
          <Card icon={<Phone size={20} />} title="Phone">
            <a href={`tel:${s.store_phone.replace(/\s/g, '')}`} className="font-medium text-brand underline">
              {s.store_phone}
            </a>
          </Card>
        )}

        {s.store_address?.trim() && (
          <Card icon={<MapPin size={20} />} title="Address">
            {s.store_address}
          </Card>
        )}

        {s.store_hours?.trim() && (
          <Card icon={<Clock size={20} />} title="Opening hours">
            {s.store_hours}
          </Card>
        )}
      </div>

      {socials.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Follow us</h2>
          <div className="flex gap-3">
            {socials.map(({ url, label, Icon }) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full border border-gray-300 px-5 py-2.5 text-sm font-medium hover:border-brand hover:text-brand"
              >
                <Icon size={18} /> {label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

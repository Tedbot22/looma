import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { STORE_NAME } from '../config'
import { PAGE_WIDTH } from '../lib/layout'
import { whatsappLink } from '../lib/whatsapp'
import { useAppSettings } from '../hooks/useAppSettings'
import { FacebookIcon, InstagramIcon, TikTokIcon } from './SocialIcons'
import type { Category } from '../lib/types'

const linkClass = 'text-sm text-gray-600 hover:text-brand hover:underline'

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <nav aria-label={title}>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-900">{title}</h3>
      <ul className="space-y-2.5">{children}</ul>
    </nav>
  )
}

export default function Footer() {
  const { data: settings } = useAppSettings()
  const s = settings ?? {}

  // Same query as the shop's category chips, so this costs no extra request.
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order')
      if (error) throw error
      return data
    },
  })

  // Only show a social link once the owner has filled it in (Admin, then Store).
  const socials = [
    { url: s.social_facebook, label: 'Facebook', Icon: FacebookIcon },
    { url: s.social_instagram, label: 'Instagram', Icon: InstagramIcon },
    { url: s.social_tiktok, label: 'TikTok', Icon: TikTokIcon },
  ].filter((x) => x.url?.trim())

  const contactLines = [
    { value: s.store_email, Icon: Mail, href: s.store_email ? `mailto:${s.store_email}` : '' },
    { value: s.store_phone, Icon: Phone, href: s.store_phone ? `tel:${s.store_phone.replace(/\s/g, '')}` : '' },
    { value: s.store_address, Icon: MapPin, href: '' },
    { value: s.store_hours, Icon: Clock, href: '' },
  ].filter((x) => x.value?.trim())

  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50">
      <div className={`${PAGE_WIDTH} grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5`}>
        {/* Brand and contact */}
        <div className="sm:col-span-2">
          <Link to="/" className="text-xl font-bold tracking-tight text-brand">
            {STORE_NAME}
          </Link>
          <p className="mt-3 max-w-sm text-sm text-gray-600">
            Affordable, pre-loved fashion picked for campus life. Delivered to your campus or your door.
          </p>

          {contactLines.length > 0 && (
            <ul className="mt-5 space-y-2 text-sm text-gray-600">
              {contactLines.map(({ value, Icon, href }) => (
                <li key={value} className="flex items-start gap-2.5">
                  <Icon size={16} className="mt-0.5 shrink-0 text-gray-400" />
                  {href ? (
                    <a href={href} className="hover:text-brand hover:underline">
                      {value}
                    </a>
                  ) : (
                    <span>{value}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <a
            href={whatsappLink(`Hi ${STORE_NAME}, I have a question.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
          >
            <MessageCircle size={16} /> Chat with us on WhatsApp
          </a>

          {socials.length > 0 && (
            <div className="mt-5 flex gap-3">
              {socials.map(({ url, label, Icon }) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${STORE_NAME} on ${label}`}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 text-gray-600 transition-colors hover:border-brand hover:bg-brand hover:text-white"
                >
                  <Icon />
                </a>
              ))}
            </div>
          )}
        </div>

        <Column title="Shop">
          <li>
            <Link to="/shop" className={linkClass}>
              All items
            </Link>
          </li>
          {categories?.map((c) => (
            <li key={c.id}>
              <Link to={`/shop/${c.id}`} className={linkClass}>
                {c.name}
              </Link>
            </li>
          ))}
        </Column>

        <Column title="Help">
          <li>
            <Link to="/faq" className={linkClass}>
              FAQ
            </Link>
          </li>
          <li>
            <Link to="/contact" className={linkClass}>
              Contact us
            </Link>
          </li>
          <li>
            <Link to="/account/orders" className={linkClass}>
              Track my order
            </Link>
          </li>
          <li>
            <Link to="/account/invite" className={linkClass}>
              Invite friends
            </Link>
          </li>
        </Column>

        <Column title="Company">
          <li>
            <Link to="/about" className={linkClass}>
              About us
            </Link>
          </li>
          <li>
            <Link to="/reviews" className={linkClass}>
              Customer reviews
            </Link>
          </li>
          <li>
            <Link to="/privacy" className={linkClass}>
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link to="/terms" className={linkClass}>
              Terms and Conditions
            </Link>
          </li>
        </Column>
      </div>

      <div className="border-t border-gray-200">
        <div className={`${PAGE_WIDTH} flex flex-col items-center justify-between gap-2 py-5 text-xs text-gray-500 sm:flex-row`}>
          <p>
            © {new Date().getFullYear()} {STORE_NAME}. All rights reserved.
          </p>
          <p>Secure online payments by Paystack · Pay on delivery available</p>
        </div>
      </div>
    </footer>
  )
}

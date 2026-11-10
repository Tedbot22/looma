import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { STORE_NAME } from '../config'
import { PAGE_WIDTH } from '../lib/layout'
import { whatsappLink } from '../lib/whatsapp'
import { useAppSettings } from '../hooks/useAppSettings'
import { FacebookIcon, InstagramIcon, TikTokIcon } from './SocialIcons'
import Logo from '../components/Logo'
import type { Category } from '../lib/types'

const linkClass = 'text-sm text-gray-300 hover:text-white hover:underline'

// On a phone only the heading shows; tapping it slides the links open. From the "sm" breakpoint up
// the heading is a plain title and the links are always visible.
function Column({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <nav aria-label={title} className="border-t border-white/10 last:border-b sm:border-0 sm:last:border-0">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between py-4 text-left uppercase tracking-wide sm:pointer-events-none sm:cursor-default sm:py-0 sm:pb-4"
        >
          {title}
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`text-gray-300 transition-transform duration-300 motion-reduce:transition-none sm:hidden ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
      </h3>
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none sm:grid-rows-[1fr] ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        {/* "invisible" keeps links out of the tab order while collapsed on a phone */}
        <div
          className={`overflow-hidden transition-[visibility] duration-300 motion-reduce:transition-none sm:visible ${
            open ? 'visible' : 'invisible'
          }`}
        >
          <ul className="space-y-2.5 pb-4 sm:pb-0">{children}</ul>
        </div>
      </div>
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
    <footer className="mt-16 bg-brand text-gray-300">
      <div className={`${PAGE_WIDTH} grid gap-y-0 py-10 sm:grid-cols-2 sm:gap-10 sm:py-12 lg:grid-cols-5`}>
        {/* Brand and contact */}
        <div className="pb-8 sm:col-span-2 sm:pb-0">
          <Link to="/" aria-label="Home" className="inline-block">
            <Logo />
          </Link>
          <p className="mt-3 max-w-sm text-sm text-gray-300">
            Affordable, pre-loved fashion picked for campus life. Delivered to your campus or your door.
          </p>

          {contactLines.length > 0 && (
            <ul className="mt-5 space-y-2 text-sm text-gray-300">
              {contactLines.map(({ value, Icon, href }) => (
                <li key={value} className="flex items-start gap-2.5">
                  <Icon size={16} className="mt-0.5 shrink-0 text-gray-400" />
                  {href ? (
                    <a href={href} className="hover:text-white hover:underline">
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
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 text-gray-300 transition-colors hover:border-white hover:bg-white hover:text-brand"
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

      <div className="border-t border-white/10">
        <div className={`${PAGE_WIDTH} flex flex-col items-center justify-between gap-2 py-5 text-xs text-gray-400 sm:flex-row`}>
          <p>
            © {new Date().getFullYear()} {STORE_NAME}. All rights reserved.
          </p>
          <p>Secure online payments by Paystack · Pay on delivery available</p>
        </div>
      </div>
    </footer>
  )
}

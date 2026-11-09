import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { useAppSettings } from '../../hooks/useAppSettings'
import { ListSkeleton } from '../../components/Skeleton'

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand'
const labelClass = 'mb-1 block text-xs font-medium text-gray-500'

const FIELDS = [
  { key: 'store_email', label: 'Email', placeholder: 'hello@yourstore.com' },
  { key: 'store_phone', label: 'Phone number', placeholder: '+234 801 234 5678' },
  { key: 'store_address', label: 'Address', placeholder: 'Shop 4, Example Plaza, Abuja' },
  { key: 'store_hours', label: 'Opening hours', placeholder: 'Mon to Sat, 9am to 6pm' },
  { key: 'social_facebook', label: 'Facebook page address', placeholder: 'https://facebook.com/yourpage' },
  { key: 'social_instagram', label: 'Instagram address', placeholder: 'https://instagram.com/yourpage' },
  { key: 'social_tiktok', label: 'TikTok address', placeholder: 'https://tiktok.com/@yourpage' },
] as const

// ---------------------------------------------------------------------------
// Contact details and social links (shown in the footer and on the Contact page)
// ---------------------------------------------------------------------------
function StoreInfoForm() {
  const { data: settings } = useAppSettings()
  const queryClient = useQueryClient()
  // Only the fields the owner has edited are held here, so the saved values show until then.
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const value = (key: string) => draft[key] ?? settings?.[key] ?? ''
  const changed = Object.keys(draft).length > 0

  async function save() {
    for (const f of FIELDS) {
      const v = (draft[f.key] ?? '').trim()
      if (f.key === 'store_email' && v && !/^\S+@\S+\.\S+$/.test(v)) return toast.error('That email address does not look right.')
      if (f.key.startsWith('social_') && v && !/^https?:\/\/\S+$/.test(v)) {
        return toast.error(`${f.label} must start with https://`)
      }
    }

    setSaving(true)
    const rows = Object.entries(draft).map(([key, v]) => ({ key, value: v.trim() }))
    const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' })
    setSaving(false)
    if (error) return toast.error(error.message)

    toast.success('Store details saved')
    setDraft({})
    queryClient.invalidateQueries({ queryKey: ['app-settings'] })
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="font-semibold">Contact details and social links</h2>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        Shown in the footer and on the Contact page. Leave a box empty to hide it. (The WhatsApp number is set in the
        website's settings file.)
      </p>

      <div className="space-y-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className={labelClass}>{f.label}</label>
            <input
              className={inputClass}
              value={value(f.key)}
              placeholder={f.placeholder}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving || !changed}
        className="mt-4 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save details'}
      </button>
    </section>
  )
}

// ---------------------------------------------------------------------------
// The text of About, FAQ, Privacy Policy and Terms
// ---------------------------------------------------------------------------
interface SitePage {
  slug: string
  title: string
  content: string
}

const PAGE_ORDER = ['about', 'faq', 'privacy', 'terms']

function PageEditor({ page }: { page: SitePage }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(page.title)
  const [content, setContent] = useState(page.content)
  const [saving, setSaving] = useState(false)

  const changed = title !== page.title || content !== page.content
  const legal = page.slug === 'privacy' || page.slug === 'terms'

  async function save() {
    if (!title.trim() || !content.trim()) return toast.error('A page needs a title and some text.')
    setSaving(true)
    const { error } = await supabase
      .from('site_pages')
      .update({ title: title.trim(), content, updated_at: new Date().toISOString() })
      .eq('slug', page.slug)
    setSaving(false)
    if (error) return toast.error(error.message)

    toast.success('Page saved')
    queryClient.invalidateQueries({ queryKey: ['admin-site-pages'] })
    queryClient.invalidateQueries({ queryKey: ['site-page', page.slug] })
  }

  return (
    <details className="rounded-xl border border-gray-200 bg-white">
      <summary className="cursor-pointer list-none px-5 py-4 font-medium">
        {page.title}
        <span className="ml-2 text-sm font-normal text-gray-400">/{page.slug}</span>
      </summary>

      <div className="space-y-3 border-t border-gray-100 p-5">
        {legal && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This is starter text, not legal advice. Read it, change anything that does not match how your store really
            works, and have it checked by a legal professional before you launch.
          </p>
        )}

        <div>
          <label className={labelClass}>Page title</label>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Text</label>
          <textarea className={`${inputClass} font-mono text-[13px] leading-relaxed`} rows={18} value={content} onChange={(e) => setContent(e.target.value)} />
          <p className="mt-1 text-xs text-gray-500">
            Start a line with ## for a heading (on the FAQ, each heading is a question), or with - for a bullet point.
            Leave a blank line between paragraphs. Use **bold** for bold text and [label](/contact) for links.
          </p>
        </div>

        <button
          onClick={save}
          disabled={saving || !changed}
          className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save page'}
        </button>
      </div>
    </details>
  )
}

export default function AdminStore() {
  const { data: pages, isLoading, error } = useQuery({
    queryKey: ['admin-site-pages'],
    queryFn: async (): Promise<SitePage[]> => {
      const { data, error } = await supabase.from('site_pages').select('slug, title, content')
      if (error) throw error
      return (data as SitePage[]).sort((a, b) => PAGE_ORDER.indexOf(a.slug) - PAGE_ORDER.indexOf(b.slug))
    },
  })

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold">Store</h1>
        <p className="mt-1 text-sm text-gray-500">The details and pages that appear in the footer and across the site.</p>
      </div>

      <StoreInfoForm />

      <section>
        <h2 className="mb-3 font-semibold">Pages</h2>
        {isLoading && <ListSkeleton rows={4} />}
        {error && <p className="text-red-600">Couldn't load pages: {(error as Error).message}</p>}
        <div className="space-y-3">
          {pages?.map((p) => (
            <PageEditor key={p.slug} page={p} />
          ))}
        </div>
      </section>
    </div>
  )
}

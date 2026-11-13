import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDialog } from '../../context/DialogContext'
import { supabase } from '../../lib/supabase'
import { uploadProductImage } from '../../lib/images'
import { BANNER_SIZE_HINT } from '../../lib/layout'
import { ListSkeleton } from '../../components/Skeleton'

interface BannerRow {
  id: string
  image_url: string
  title: string | null
  subtitle: string | null
  button_label: string | null
  link_url: string | null
  sort_order: number
  is_active: boolean
}

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand'
const labelClass = 'mb-1 block text-xs font-medium text-gray-500'

// A button needs somewhere to go: a page on the site (/shop) or a full https:// address.
const validLink = (v: string) => /^(\/(?!\/)|https?:\/\/)\S+$/.test(v)

function BannerCard({
  banner,
  isFirst,
  isLast,
  onChanged,
  onMove,
}: {
  banner: BannerRow
  isFirst: boolean
  isLast: boolean
  onChanged: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const [title, setTitle] = useState(banner.title ?? '')
  const [subtitle, setSubtitle] = useState(banner.subtitle ?? '')
  const [buttonLabel, setButtonLabel] = useState(banner.button_label ?? '')
  const [linkUrl, setLinkUrl] = useState(banner.link_url ?? '')
  const [busy, setBusy] = useState(false)
  const dialog = useDialog()

  const changed =
    title.trim() !== (banner.title ?? '') ||
    subtitle.trim() !== (banner.subtitle ?? '') ||
    buttonLabel.trim() !== (banner.button_label ?? '') ||
    linkUrl.trim() !== (banner.link_url ?? '')

  async function save() {
    if (buttonLabel.trim() && !linkUrl.trim()) return toast.error('A button needs a link. Add one, or clear the button text.')
    if (linkUrl.trim() && !validLink(linkUrl.trim())) {
      return toast.error('The link must be a page on the site, like /shop, or a full address starting with https://')
    }

    setBusy(true)
    const { error } = await supabase
      .from('hero_banners')
      .update({
        title: title.trim() || null,
        subtitle: subtitle.trim() || null,
        button_label: buttonLabel.trim() || null,
        link_url: linkUrl.trim() || null,
      })
      .eq('id', banner.id)
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Banner saved')
    onChanged()
  }

  async function toggleActive() {
    setBusy(true)
    const { error } = await supabase.from('hero_banners').update({ is_active: !banner.is_active }).eq('id', banner.id)
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success(banner.is_active ? 'Banner hidden from the home page' : 'Banner is now showing')
    onChanged()
  }

  async function remove() {
    const ok = await dialog.confirm({
      title: 'Delete this banner?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.from('hero_banners').delete().eq('id', banner.id)
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Banner deleted')
    onChanged()
  }

  return (
    <li className={`overflow-hidden rounded-xl border bg-white ${banner.is_active ? 'border-gray-200' : 'border-dashed border-gray-300'}`}>
      <div className="relative aspect-[21/9] bg-gray-100">
        <img src={banner.image_url} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover ${banner.is_active ? '' : 'opacity-50 grayscale'}`} />
        {!banner.is_active && (
          <span className="absolute left-3 top-3 rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">Hidden</span>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Headline (optional)</label>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fresh fits. Student prices." />
          </div>
          <div>
            <label className={labelClass}>Line of text (optional)</label>
            <input className={inputClass} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="New thrift finds every week" />
          </div>
          <div>
            <label className={labelClass}>Button text (optional)</label>
            <input className={inputClass} value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} placeholder="Shop now" />
          </div>
          <div>
            <label className={labelClass}>Button goes to</label>
            <input className={inputClass} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="/shop" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button aria-label="Move earlier" disabled={isFirst || busy} onClick={() => onMove(-1)} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:border-brand hover:text-brand disabled:opacity-30">
              <ArrowUp size={16} />
            </button>
            <button aria-label="Move later" disabled={isLast || busy} onClick={() => onMove(1)} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:border-brand hover:text-brand disabled:opacity-30">
              <ArrowDown size={16} />
            </button>
            <button onClick={toggleActive} disabled={busy} className="ml-2 flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand disabled:opacity-60">
              {banner.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
              {banner.is_active ? 'Showing' : 'Hidden'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button aria-label="Delete banner" onClick={remove} disabled={busy} className="rounded-lg p-2 text-gray-400 hover:text-sale disabled:opacity-60">
              <Trash2 size={16} />
            </button>
            <button onClick={save} disabled={busy || !changed} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-40">
              Save
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}

export default function AdminBanners() {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const { data: banners, isLoading, error } = useQuery({
    queryKey: ['admin-banners'],
    queryFn: async (): Promise<BannerRow[]> => {
      // The admin's access rules let the owner see hidden banners too.
      const { data, error } = await supabase.from('hero_banners').select('*').order('sort_order')
      if (error) throw error
      return data as BannerRow[]
    },
  })

  // The home page caches its banners, so refresh them after any change.
  const refresh = () =>
    Promise.all(['admin-banners', 'banners'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })))

  async function handleFiles(files: FileList | null) {
    const images = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return

    setUploading(true)
    try {
      let order = Math.max(-1, ...(banners ?? []).map((b) => b.sort_order))
      for (const file of images) {
        const url = await uploadProductImage(file, 2400) // wide banners keep more detail than product photos
        const { error } = await supabase.from('hero_banners').insert({ image_url: url, sort_order: ++order })
        if (error) throw error
      }
      toast.success(images.length === 1 ? 'Banner added' : `${images.length} banners added`)
      await refresh()
    } catch (err) {
      toast.error(`Upload failed: ${(err as Error).message}`)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  // Swap with the neighbour, then rewrite every banner's position so the order is always clean.
  async function move(index: number, direction: -1 | 1) {
    if (!banners) return
    const target = index + direction
    if (target < 0 || target >= banners.length) return

    const reordered = [...banners]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]

    const { error } = await supabase
      .from('hero_banners')
      .upsert(reordered.map((b, i) => ({ id: b.id, image_url: b.image_url, sort_order: i })), { onConflict: 'id' })
    if (error) return toast.error(error.message)
    refresh()
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold">Home page banners</h1>
      <p className="mb-5 mt-1 text-sm text-gray-500">
        These images slide across the top of the home page, in the order shown here. Wide landscape photos work best
        (best size: {BANNER_SIZE_HINT}). Keep the main subject and any words in the middle half of the picture, because phones show a narrower slice. If you add none, a simple welcome message is shown instead.
      </p>

      <button
        onClick={() => fileInput.current?.click()}
        disabled={uploading}
        className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-6 text-sm font-medium text-gray-600 hover:border-brand hover:text-brand disabled:opacity-60"
      >
        <ImagePlus size={20} />
        {uploading ? 'Uploading…' : 'Add banner images'}
      </button>
      <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

      {isLoading && <ListSkeleton rows={2} withImage />}
      {error && <p className="text-red-600">Couldn't load banners: {(error as Error).message}</p>}
      {banners && banners.length === 0 && <p className="py-10 text-center text-gray-400">No banners yet. Add your first image above.</p>}

      <ul className="space-y-5">
        {banners?.map((b, i) => (
          <BannerCard
            key={b.id}
            banner={b}
            isFirst={i === 0}
            isLast={i === banners.length - 1}
            onChanged={refresh}
            onMove={(direction) => move(i, direction)}
          />
        ))}
      </ul>
    </div>
  )
}

import { useRef, useState, type ChangeEvent } from 'react'
import { ImagePlus, Star, X } from 'lucide-react'
import { toast } from 'sonner'
import { uploadProductImage } from '../../lib/images'

interface Props {
  images: string[]
  onChange: (images: string[]) => void
  max?: number
  onBusyChange?: (busy: boolean) => void // lets the form block "Save" while an upload is running
}

// Upload, remove and reorder photos. The first photo is the cover.
export default function PhotoManager({ images, onChange, max = 6, onBusyChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    e.target.value = ''
    if (files.length === 0) return

    const room = Math.max(max - images.length, 0)
    if (files.length > room) toast.message(`Only ${max} photos allowed. Extra photos were skipped.`)

    setUploading(true)
    onBusyChange?.(true)
    try {
      const urls: string[] = []
      for (const file of files.slice(0, room)) urls.push(await uploadProductImage(file))
      onChange([...images, ...urls])
    } catch (err) {
      toast.error(`Upload failed: ${(err as Error).message}`)
    } finally {
      setUploading(false)
      onBusyChange?.(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((url, i) => (
          <div key={url} className="relative h-28 w-24 overflow-hidden rounded-lg bg-gray-100">
            <img src={url} alt="" className="h-full w-full object-cover" />
            {i === 0 ? (
              <span className="absolute bottom-1 left-1 rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Cover
              </span>
            ) : (
              <button
                type="button"
                aria-label="Make cover photo"
                onClick={() => onChange([url, ...images.filter((u) => u !== url)])}
                className="absolute bottom-1 left-1 rounded bg-white/90 p-1 text-gray-700 hover:text-brand"
              >
                <Star size={12} />
              </button>
            )}
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => onChange(images.filter((u) => u !== url))}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black"
            >
              <X size={12} />
            </button>
          </div>
        ))}

        {images.length < max && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            className="flex h-28 w-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-brand hover:text-brand disabled:opacity-60"
          >
            <ImagePlus size={20} />
            {uploading ? 'Uploading…' : 'Add photo'}
          </button>
        )}
      </div>
      <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
    </div>
  )
}

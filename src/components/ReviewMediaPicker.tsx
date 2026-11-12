import { useRef } from 'react'
import { Camera, Film, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  MAX_REVIEW_PHOTOS,
  MAX_REVIEW_VIDEOS,
  MAX_VIDEO_MB,
  MAX_VIDEO_SECONDS,
  PHOTO_ACCEPT,
  VIDEO_ACCEPT,
  checkVideo,
  type PendingMedia,
} from '../lib/reviewMedia'

// "Add photos or a video" on the review form. Previews appear straight away; the files are only
// uploaded when the review is sent.
export default function ReviewMediaPicker({
  items,
  onChange,
  disabled,
}: {
  items: PendingMedia[]
  onChange: (next: PendingMedia[]) => void
  disabled?: boolean
}) {
  const photoInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)

  const photos = items.filter((i) => i.kind === 'image')
  const videos = items.filter((i) => i.kind === 'video')

  function addPhotos(files: FileList | null) {
    if (!files) return
    const room = MAX_REVIEW_PHOTOS - photos.length
    const picked = [...files].filter((f) => f.type.startsWith('image/'))
    if (picked.length > room) toast.info(`You can add up to ${MAX_REVIEW_PHOTOS} photos.`)
    const added: PendingMedia[] = picked.slice(0, room).map((file) => ({
      key: crypto.randomUUID(),
      kind: 'image',
      file,
      preview: URL.createObjectURL(file),
    }))
    onChange([...items, ...added])
  }

  async function addVideo(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    const problem = await checkVideo(file, preview)
    if (problem) {
      URL.revokeObjectURL(preview)
      toast.error(problem)
      return
    }
    onChange([...items, { key: crypto.randomUUID(), kind: 'video', file, preview }])
  }

  function remove(key: string) {
    const gone = items.find((i) => i.key === key)
    if (gone) URL.revokeObjectURL(gone.preview)
    onChange(items.filter((i) => i.key !== key))
  }

  return (
    <section>
      <h2 className="font-semibold">Add photos or a video</h2>
      <p className="text-xs text-gray-500">
       Up to {MAX_REVIEW_PHOTOS} photos and {MAX_REVIEW_VIDEOS} video ({MAX_VIDEO_SECONDS} seconds, {MAX_VIDEO_MB} MB).
      </p>

      {items.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {items.map((item) => (
            <li key={item.key} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
              {item.kind === 'image' ? (
                <img src={item.preview} alt="Selected photo" className="h-full w-full object-cover" />
              ) : (
                <video src={`${item.preview}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              )}
              {item.kind === 'video' && (
                <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  <Film size={10} /> Video
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(item.key)}
                disabled={disabled}
                aria-label="Remove"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 disabled:opacity-50"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || photos.length >= MAX_REVIEW_PHOTOS}
          onClick={() => photoInput.current?.click()}
          className="flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium hover:border-brand disabled:opacity-50"
        >
          <Camera size={16} /> Add photos {photos.length > 0 && `(${photos.length}/${MAX_REVIEW_PHOTOS})`}
        </button>
        <button
          type="button"
          disabled={disabled || videos.length >= MAX_REVIEW_VIDEOS}
          onClick={() => videoInput.current?.click()}
          className="flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium hover:border-brand disabled:opacity-50"
        >
          <Film size={16} /> Add a video
        </button>
      </div>

      <input
        ref={photoInput}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          addPhotos(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept={VIDEO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void addVideo(e.target.files)
          e.target.value = ''
        }}
      />
    </section>
  )
}

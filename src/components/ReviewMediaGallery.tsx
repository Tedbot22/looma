import { useEffect, useRef, useState } from 'react'
import { Play, X } from 'lucide-react'
import type { ReviewMedia } from '../lib/reviewMedia'

// The photos and video a customer added to their review: small thumbnails that open full size.
export default function ReviewMediaGallery({ media }: { media: Pick<ReviewMedia, 'id' | 'kind' | 'url'>[] }) {
  const [open, setOpen] = useState<number | null>(null)

  // Opening the viewer adds a history entry, so the phone's Back button (or the browser's) closes the viewer
  // instead of leaving the page. Closing it any other way (X, tapping outside, Escape) steps that entry back,
  // so the history never fills up with leftovers. Every close goes through the popstate handler below.
  const pushed = useRef(false)

  function openAt(i: number) {
    if (!pushed.current) {
      window.history.pushState({ ...window.history.state, reviewMedia: true }, '')
      pushed.current = true
    }
    setOpen(i)
  }

  function close() {
    if (pushed.current) window.history.back()
    else setOpen(null)
  }

  useEffect(() => {
    const onPop = () => {
      if (!pushed.current) return
      pushed.current = false
      setOpen(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + 1) % media.length))
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i - 1 + media.length) % media.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, media.length])

  if (media.length === 0) return null
  const current = open === null ? null : media[open]

  return (
    <>
      <ul className="mt-3 flex flex-wrap gap-2">
        {media.map((m, i) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => openAt(i)}
              aria-label={m.kind === 'video' ? 'Play review video' : 'View review photo'}
              className="relative block h-20 w-20 overflow-hidden rounded-lg bg-gray-100 sm:h-24 sm:w-24"
            >
              {m.kind === 'image' ? (
                <img src={m.url} alt="Customer photo" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <>
                  <video src={`${m.url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                    <Play size={22} fill="currentColor" />
                  </span>
                </>
              )}
            </button>
          </li>
        ))}
      </ul>

      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Review media"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/100 p-4"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X size={22} />
          </button>
          <div className="max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            {current.kind === 'image' ? (
              <img src={current.url} alt="Customer photo" className="max-h-[85vh] rounded-lg object-contain" />
            ) : (
              <video src={current.url} controls autoPlay playsInline className="max-h-[85vh] rounded-lg" />
            )}
            {media.length > 1 && (
              <p className="mt-2 text-center text-xs text-white/70">
                {open! + 1} of {media.length} · use the arrow keys to move
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

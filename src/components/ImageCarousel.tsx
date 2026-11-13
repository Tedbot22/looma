import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'

// The photo frame. On phones it is a little shorter than the card shape (4:5), never taller than 70% of the
// screen, and on small tablets it stops growing at a sensible width and centres. From md up it sits in its
// half of the page at the same 3:4 shape as the product cards.
const FRAME =
  'relative mx-auto aspect-[4/5] max-h-[70vh] w-full max-w-md overflow-hidden rounded-2xl bg-gray-100 md:aspect-[3/4] md:max-h-none md:max-w-none'

interface Props {
  images: string[]
  alt: string
  children?: ReactNode // badges drawn on top of the photo, e.g. "-25%"
}

// A swipeable photo carousel. On phones you just swipe (the browser does the work through
// CSS scroll-snap). On desktop there are arrow buttons. Dots show where you are.
export default function ImageCarousel({ images, alt, children }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  function handleScroll() {
    const el = scroller.current
    if (el && el.clientWidth > 0) setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  function goTo(i: number) {
    const el = scroller.current
    if (!el) return
    const target = Math.max(0, Math.min(images.length - 1, i))
    el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' })
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') goTo(index - 1)
    if (e.key === 'ArrowRight') goTo(index + 1)
  }

  if (images.length === 0) {
    return (
      <div className={`${FRAME} flex items-center justify-center text-gray-300`}>
        <ImageOff size={40} />
        {children}
      </div>
    )
  }

  const multiple = images.length > 1

  return (
    <div className={FRAME}>
      <div
        ref={scroller}
        onScroll={handleScroll}
        onKeyDown={handleKey}
        tabIndex={0}
        aria-label={`${alt} photos`}
        className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          <img
            key={src}
            src={src}
            alt={`${alt}, photo ${i + 1} of ${images.length}`}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            className="h-full w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>

      {children}

      {multiple && (
        <>
          {index > 0 && (
            <button
              aria-label="Previous photo"
              onClick={() => goTo(index - 1)}
              className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white sm:block"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {index < images.length - 1 && (
            <button
              aria-label="Next photo"
              onClick={() => goTo(index + 1)}
              className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white sm:block"
            >
              <ChevronRight size={18} />
            </button>
          )}

          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {images.map((src, i) => (
              <button
                key={src}
                aria-label={`Go to photo ${i + 1}`}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/60'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

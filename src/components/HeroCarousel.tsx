import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface Banner {
  id: string
  image_url: string
  title: string | null
  subtitle: string | null
  button_label: string | null
  link_url: string | null
}

// The big banner at the top of the home page: images the owner uploads in the admin. It slides on its own
// every few seconds, and also by swiping (phones), the arrows (desktop) or the dots. It runs edge to edge.
export default function HeroCarousel({ banners }: { banners: Banner[] }) {
  const scroller = useRef<HTMLDivElement>(null)
  const indexRef = useRef(0) // always the current slide, so the timer never reads a stale value
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = banners.length

  function goTo(i: number) {
    const el = scroller.current
    if (!el) return
    const target = ((i % count) + count) % count // wraps around at both ends
    el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' })
  }

  function handleScroll() {
    const el = scroller.current
    if (!el || el.clientWidth === 0) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    indexRef.current = i
    setIndex(i)
  }

  // Slide automatically, unless the person is pointing at it, or has asked their device for less motion.
  useEffect(() => {
    if (count < 2 || paused) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => goTo(indexRef.current + 1), 5500)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, paused])

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="relative mb-10 overflow-hidden rounded-2xl bg-gray-100"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={scroller}
        onScroll={handleScroll}
        className="flex aspect-[16/9] max-h-[620px] w-full snap-x snap-mandatory overflow-x-auto sm:aspect-[21/9] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((b, i) => {
          const hasText = !!(b.title || b.subtitle || b.button_label)
          const internal = b.link_url?.startsWith('/')
          const buttonClass =
            'mt-4 inline-block rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-brand hover:bg-gray-100'

          return (
            <div key={b.id} className="relative h-full w-full shrink-0 snap-center">
              <img
                src={b.image_url}
                alt={b.title ?? `${i + 1} of ${count}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                className="h-full w-full object-cover"
              />

              {hasText && (
                <>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 px-6 pb-8 text-white sm:px-12 sm:pb-12 lg:px-16">
                    {b.title && <h2 className="max-w-2xl text-2xl font-bold sm:text-4xl lg:text-5xl">{b.title}</h2>}
                    {b.subtitle && <p className="mt-2 max-w-xl text-sm text-white/90 sm:text-lg">{b.subtitle}</p>}
                    {b.button_label &&
                      b.link_url &&
                      (internal ? (
                        <Link to={b.link_url} className={buttonClass}>
                          {b.button_label}
                        </Link>
                      ) : (
                        <a href={b.link_url} className={buttonClass} target="_blank" rel="noopener noreferrer">
                          {b.button_label}
                        </a>
                      ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {count > 1 && (
        <>
          <button
            aria-label="Previous slide"
            onClick={() => goTo(index - 1)}
            className="absolute left-4 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/85 p-2.5 shadow hover:bg-white md:block"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            aria-label="Next slide"
            onClick={() => goTo(index + 1)}
            className="absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/85 p-2.5 shadow hover:bg-white md:block"
          >
            <ChevronRight size={22} />
          </button>

          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {banners.map((b, i) => (
              <button
                key={b.id}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                onClick={() => goTo(i)}
                className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-2 bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

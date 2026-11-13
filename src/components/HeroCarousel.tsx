import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'

export interface Banner {
  id: string
  image_url: string
  title: string | null
  subtitle: string | null
  button_label: string | null
  link_url: string | null
}

const SLIDE_MS = 5500 // keep in step with .hero-progress in index.css

// The big banner at the top of the home page: images the owner uploads in the admin. It slides on its own
// every few seconds, and also by swiping (phones), the arrows (desktop) or the progress bars underneath.
// The text on a slide rises into place when the slide arrives, and the photo settles in with a slow zoom.
export default function HeroCarousel({ banners }: { banners: Banner[] }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = banners.length
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function goTo(i: number) {
    const el = scroller.current
    if (!el) return
    const target = ((i % count) + count) % count // wraps around at both ends
    el.scrollTo({ left: target * el.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  function handleScroll() {
    const el = scroller.current
    if (!el || el.clientWidth === 0) return
    setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  // Slide automatically, unless the person is pointing at it, or has asked their device for less motion.
  // The timer restarts whenever the slide changes, so swiping or tapping never causes a double jump.
  useEffect(() => {
    if (count < 2 || paused || reduceMotion) return
    const timer = setTimeout(() => goTo(index + 1), SLIDE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, count])

  const arrow =
    'absolute top-1/2 hidden -translate-y-1/2 rounded-full bg-white/20 p-3 text-white ring-1 ring-white/30 backdrop-blur-md transition hover:bg-white/35 focus-visible:opacity-100 md:block md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="group relative mb-10 overflow-hidden rounded-2xl bg-gray-100 shadow-sm ring-1 ring-black/5 sm:rounded-3xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={scroller}
        onScroll={handleScroll}
        className="flex aspect-[16/9] min-h-[200px] max-h-[380px] w-full snap-x snap-mandatory overflow-x-auto sm:aspect-[3/1] sm:min-h-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((b, i) => {
          const active = i === index
          const hasText = !!(b.title || b.subtitle || b.button_label)
          const internal = b.link_url?.startsWith('/')
          const buttonClass =
            'group/cta mt-2 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm sm:mt-5 sm:px-6 sm:py-3 font-semibold text-brand shadow-lg shadow-black/20 transition hover:bg-gray-100 active:scale-95'
          const buttonInner = (
            <>
              {b.button_label}
              <ArrowRight size={16} className="transition-transform group-hover/cta:translate-x-1" />
            </>
          )
          // Each piece of text rises in a little after the one before it.
          const rise = (delay: string) =>
            `transition duration-700 ease-out motion-reduce:transition-none ${delay} ${
              active ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100'
            }`

          return (
            <div key={b.id} className="relative h-full w-full shrink-0 snap-center overflow-hidden" aria-hidden={!active}>
              <img
                src={b.image_url}
                alt={b.title ?? `${i + 1} of ${count}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                className={`h-full w-full object-cover transition-transform duration-[6000ms] ease-out motion-reduce:transition-none ${
                  active ? 'scale-100' : 'scale-110 motion-reduce:scale-100'
                }`}
              />

              {/* Shading: from the left on wide screens (where the text sits), from the bottom on phones */}
              <div
                className={`absolute inset-0 ${
                  hasText
                    ? 'bg-gradient-to-t from-black/70 via-black/15 to-transparent sm:bg-gradient-to-r sm:from-black/65 sm:via-black/25 sm:to-transparent'
                    : 'bg-gradient-to-t from-black/25 via-transparent to-transparent'
                }`}
              />

              {hasText && (
                <div className="absolute inset-0 flex items-end px-5 pb-11 sm:items-center sm:px-12 sm:pb-0 lg:px-20">
                  <div className="max-w-xl text-white">
                    {b.title && (
                      <h2 className={`text-xl font-extrabold leading-tight tracking-tight drop-shadow-sm min-[400px]:text-2xl sm:text-4xl lg:text-5xl ${rise('delay-100')}`}>
                        {b.title}
                      </h2>
                    )}
                    {b.subtitle && (
                      <p className={`mt-1 line-clamp-1 max-w-md text-sm text-white/90 sm:mt-3 sm:line-clamp-none sm:text-lg ${rise('delay-200')}`}>{b.subtitle}</p>
                    )}
                    {b.button_label && b.link_url && (
                      <div className={rise('delay-300')}>
                        {internal ? (
                          <Link to={b.link_url} tabIndex={active ? 0 : -1} className={buttonClass}>
                            {buttonInner}
                          </Link>
                        ) : (
                          <a href={b.link_url} tabIndex={active ? 0 : -1} className={buttonClass} target="_blank" rel="noopener noreferrer">
                            {buttonInner}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {count > 1 && (
        <>
          <button aria-label="Previous slide" onClick={() => goTo(index - 1)} className={`${arrow} left-4`}>
            <ChevronLeft size={22} />
          </button>
          <button aria-label="Next slide" onClick={() => goTo(index + 1)} className={`${arrow} right-4`}>
            <ChevronRight size={22} />
          </button>

          {/* Progress bars: the current one fills up as the slide's time runs out. */}
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2 px-6 sm:bottom-5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                onClick={() => goTo(i)}
                className={`relative h-1.5 overflow-hidden rounded-full bg-white/40 transition-all duration-300 ${
                  i === index ? 'w-10 sm:w-14' : 'w-4 sm:w-6'
                }`}
              >
                {i === index &&
                  (paused || reduceMotion ? (
                    <span className="absolute inset-0 rounded-full bg-white" />
                  ) : (
                    <span key={`${index}-${paused}`} className="hero-progress absolute inset-y-0 left-0 rounded-full bg-white" />
                  ))}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

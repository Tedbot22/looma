import { useQuery } from '@tanstack/react-query'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useRecentlyViewedProducts } from '../hooks/useRecentlyViewedProducts'
import { useProductPool, useRecommendations } from '../hooks/useRecommendations'
import HeroCarousel, { type Banner } from '../components/HeroCarousel'
import ProductCard from '../components/ProductCard'
import { CategoryRowSkeleton, HeroSkeleton, ProductCardSkeleton } from '../components/Skeleton'
import type { Category, ProductWithVariants } from '../lib/types'
import { todaysDealsList } from '../lib/todaysDeals'
import { STORE_NAME } from '../config'
import { FULL_BLEED } from '../lib/layout'

// A titled row of products, with an optional button to see the full list.
function Section({ title, subtitle, to, children }: { title: string; subtitle?: string; to?: string; children: ReactNode }) {
  return (
    <section className="mt-14">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {to && (
          <Link
            to={to}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium hover:border-brand hover:text-brand"
          >
            View all <ArrowRight size={15} />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

const ROW_MAX = 6

// A single row that scrolls sideways (scrollbar hidden). It stays inside the page margins, so cards
// never run up against the edge of the screen.
function ProductRow({ children }: { children: ReactNode }) {
  return (
    <ul className="no-scrollbar flex snap-x gap-4 overflow-x-auto pb-2 sm:gap-6">
      {children}
    </ul>
  )
}

const Cell = ({ children }: { children: ReactNode }) => <li className="w-40 shrink-0 snap-start sm:w-52">{children}</li>

function RowSkeleton() {
  return (
    <ProductRow>
      {Array.from({ length: ROW_MAX }, (_, i) => (
        <Cell key={i}>
          <ProductCardSkeleton />
        </Cell>
      ))}
    </ProductRow>
  )
}

function Products({ items }: { items: ProductWithVariants[] }) {
  return (
    <ProductRow>
      {items.map((p) => (
        <Cell key={p.id}>
          <ProductCard product={p} />
        </Cell>
      ))}
    </ProductRow>
  )
}

export default function Home() {
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order')
      if (error) throw error
      return data
    },
  })

  // The banner images the owner uploaded (Admin, then Banners), in the order they chose.
  const { data: banners, isLoading: bannersLoading } = useQuery({
    queryKey: ['banners'],
    queryFn: async (): Promise<Banner[]> => {
      const { data, error } = await supabase
        .from('hero_banners')
        .select('id, image_url, title, subtitle, button_label, link_url')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as Banner[]
    },
    staleTime: 5 * 60_000,
  })

  const pool = useProductPool()
  const recent = useRecentlyViewedProducts(ROW_MAX)
  const recommended = useRecommendations(ROW_MAX * 2)

  // Today's deals: a mix of fresh arrivals, big markdowns and random picks. Always the top row.
  const deals = useMemo(() => (pool.data ? todaysDealsList(pool.data).slice(0, ROW_MAX) : []), [pool.data])
  const dealIds = new Set(deals.map((p) => p.id))

  // Recommended for you: personal picks once the customer has interacted with items, random items before
  // that (the algorithm fills with random items when it has nothing to go on). No repeats of the deals above.
  const picks = recommended.items.filter((p) => !dealIds.has(p.id)).slice(0, ROW_MAX)

  return (
    <div>
      {/* The page's main heading for search engines. Screen readers get it too. */}
      <h1 className="sr-only">{STORE_NAME}: thrift fashion and clothing in Nigeria</h1>
      {/* Category chips: one compact row above the banner. Swipe sideways; the scrollbar is hidden. */}
      {categoriesLoading ? (
        <CategoryRowSkeleton />
      ) : (
        categories &&
        categories.length > 0 && (
          <nav aria-label="Categories" className={`no-scrollbar -mt-2 mb-4 flex gap-2 overflow-x-auto px-4 sm:px-6 lg:px-10 ${FULL_BLEED}`}>
            {categories.map((c) => (
              <Link
                key={c.id}
                to={`/shop/${c.id}`}
                className="shrink-0 whitespace-nowrap rounded-full border border-gray-200 px-3.5 py-1.5 text-xs font-medium hover:border-brand hover:text-brand sm:text-sm"
              >
                {c.name}
              </Link>
            ))}
          </nav>
        )
      )}

      {bannersLoading ? <HeroSkeleton /> : banners && banners.length > 0 ? <HeroCarousel banners={banners} /> : null}

      {/* Today's deals always sit above Recently viewed and Recommended. */}
      {(pool.isLoading || deals.length > 0) && (
        <Section title="Today's deals" subtitle=" " to="/todays-deals">
          {pool.isLoading ? <RowSkeleton /> : <Products items={deals} />}
        </Section>
      )}

      {/* Only when the customer has actually viewed something. */}
      {recent.hasAny && (recent.isLoading || recent.products.length > 0) && (
        <Section title="Recently viewed" to="/recently-viewed">
          {recent.isLoading ? <RowSkeleton /> : <Products items={recent.products.slice(0, ROW_MAX)} />}
        </Section>
      )}

      {/* Hidden when there is nothing to recommend (and while it is still loading, so it never flashes in and out). */}
      {!recommended.isLoading && picks.length > 0 && (
        <Section title="Recommended for you" to="/recommended">
          <Products items={picks} />
        </Section>
      )}
    </div>
  )
}

import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useRecentlyViewedProducts } from '../hooks/useRecentlyViewedProducts'
import { useRecommendations } from '../hooks/useRecommendations'
import HeroCarousel, { type Banner } from '../components/HeroCarousel'
import ProductCard from '../components/ProductCard'
import { CategoryRowSkeleton, HeroSkeleton, ProductGridSkeleton } from '../components/Skeleton'
import type { Category } from '../lib/types'
import { STORE_NAME } from '../config'
import { FULL_BLEED } from '../lib/layout'

// A titled row of products, with a button to see the full list.
function Section({ title, subtitle, to, children }: { title: string; subtitle?: string; to: string; children: ReactNode }) {
  return (
    <section className="mt-14">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        <Link
          to={to}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium hover:border-brand hover:text-brand"
        >
          View all <ArrowRight size={15} />
        </Link>
      </div>
      {children}
    </section>
  )
}

const rowGrid = 'grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 md:grid-cols-4'

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

  const hasCategories = categoriesLoading || (categories?.length ?? 0) > 0
  const recent = useRecentlyViewedProducts(8)
  const recommended = useRecommendations(8)

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

      {/* With no category row above it, the banner sits flush under the header as before. */}
      <div className={hasCategories ? '' : '-mt-6'}>
        {bannersLoading ? (
          <HeroSkeleton />
        ) : banners && banners.length > 0 ? (
          <HeroCarousel banners={banners} />
        ) : null}
      </div>

      {recent.hasAny && (recent.isLoading || recent.products.length > 0) && (
        <Section title="Recently viewed" subtitle="" to="/recently-viewed">
          {recent.isLoading ? (
            <ProductGridSkeleton count={4} />
          ) : (
            <div className={rowGrid}>
              {recent.products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Only shown once the customer's activity has produced at least one genuine pick. */}
      {!recommended.isLoading && recommended.personalised > 0 && recommended.items.length > 0 && (
        <Section title="Recommended for you" subtitle="" to="/recommended">
          <div className={rowGrid}>
            {recommended.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useRecentlyViewedProducts } from '../hooks/useRecentlyViewedProducts'
import { useRecommendations } from '../hooks/useRecommendations'
import HeroCarousel, { type Banner } from '../components/HeroCarousel'
import ProductCard from '../components/ProductCard'
import { ChipsSkeleton, HeroSkeleton, ProductGridSkeleton } from '../components/Skeleton'
import { FULL_BLEED } from '../lib/layout'
import type { Category } from '../lib/types'

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

  const recent = useRecentlyViewedProducts(8)
  const recommended = useRecommendations(8)

  return (
    <div>
      {bannersLoading ? (
        <HeroSkeleton />
      ) : banners && banners.length > 0 ? (
        <HeroCarousel banners={banners} />
      ) : (
        // Until the owner uploads banners, show a simple welcome so the page is never empty.
        <section className={`-mt-6 mb-10 bg-brand px-6 py-16 text-center text-white sm:py-24 ${FULL_BLEED}`}>
          <h1 className="text-3xl font-bold sm:text-5xl">Fresh fits. Student prices.</h1>
          <p className="mx-auto mt-3 max-w-md text-gray-300">Thrift finds and styled outfits, picked for campus life.</p>
          <Link to="/shop" className="mt-6 inline-block rounded-full bg-white px-7 py-3 text-sm font-semibold text-brand">
            Shop now
          </Link>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">Shop by category</h2>
        {categoriesLoading && <ChipsSkeleton />}
        <div className="flex flex-wrap gap-3">
          {categories?.map((c) => (
            <Link
              key={c.id}
              to={`/shop/${c.id}`}
              className="rounded-full border border-gray-200 px-5 py-2 text-sm font-medium hover:border-brand hover:text-brand"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </section>

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

      <Section title="Recommended for you" subtitle="" to="/recommended">
        {recommended.isLoading ? (
          <ProductGridSkeleton count={4} />
        ) : recommended.items.length === 0 ? (
          <p className="text-gray-500">Nothing to recommend right now. Check back soon!</p>
        ) : (
          <div className={rowGrid}>
            {recommended.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

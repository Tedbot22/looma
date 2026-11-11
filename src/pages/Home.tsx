import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProductPool } from '../hooks/useRecommendations'
import HeroCarousel, { type Banner } from '../components/HeroCarousel'
import ProductCard from '../components/ProductCard'
import { CategoryRowSkeleton, HeroSkeleton, ProductGridSkeleton } from '../components/Skeleton'
import type { Category } from '../lib/types'
import { STORE_NAME } from '../config'
import { FULL_BLEED } from '../lib/layout'

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
  const pool = useProductPool()
  // The shop shows the store's whole inventory, newest first.
  const shopItems = pool.data ?? []

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

      {/* The shop: the store's whole inventory, newest first. */}
      <section className="mt-10">
        {pool.isLoading ? (
          <ProductGridSkeleton count={8} />
        ) : shopItems.length === 0 ? (
          <p className="text-gray-500">Nothing in the shop right now. Check back soon!</p>
        ) : (
          <div className={rowGrid}>
            {shopItems.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

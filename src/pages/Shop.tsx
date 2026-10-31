import { useQuery } from '@tanstack/react-query'
import { NavLink, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ProductCard from '../components/ProductCard'
import type { Category, ProductWithVariants } from '../lib/types'

const chipClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? 'border-brand bg-brand text-white'
      : 'border-gray-200 text-gray-600 hover:border-brand'
  }`

export default function Shop() {
  // The category comes from the URL: /shop (all) or /shop/<categoryId>
  const { categoryId } = useParams()

  const { data: categories } = useQuery({
    queryKey: ['categories'], // same key as Home, so it's cached and not refetched
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order')
      if (error) throw error
      return data
    },
  })

  const {
    data: products,
    isLoading,
    error,
  } = useQuery({
    // The key includes categoryId, so each category is cached separately.
    queryKey: ['products', categoryId ?? 'all'],
    queryFn: async (): Promise<ProductWithVariants[]> => {
      let query = supabase
        .from('products')
        .select('*, product_variants(*)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (categoryId) query = query.eq('category_id', categoryId)

      const { data, error } = await query
      if (error) throw error
      return data as ProductWithVariants[]
    },
  })

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Shop</h1>

      {/* Category filter chips (scrollable on small screens) */}
      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1">
        <NavLink to="/shop" end className={chipClass}>
          All
        </NavLink>
        {categories?.map((c) => (
          <NavLink key={c.id} to={`/shop/${c.id}`} className={chipClass}>
            {c.name}
          </NavLink>
        ))}
      </div>

      {isLoading && <p className="text-gray-400">Loading products…</p>}
      {error && <p className="text-red-600">Couldn't load products: {(error as Error).message}</p>}

      {products && products.length === 0 && (
        <p className="py-16 text-center text-gray-400">Nothing here yet. Check back soon!</p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products?.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  )
}

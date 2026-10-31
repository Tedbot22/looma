import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import ProductForm from './ProductForm'
import type { ProductWithVariants } from '../../lib/types'

export default function AdminProductEdit() {
  const { productId } = useParams()

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-product', productId],
    queryFn: async (): Promise<ProductWithVariants | null> => {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_variants(*)')
        .eq('id', productId!)
        .maybeSingle()
      if (error) throw error
      return data as ProductWithVariants | null
    },
    enabled: !!productId,
    staleTime: 0, // always edit fresh data, never a cached copy
    gcTime: 0,
  })

  if (isLoading) return <p className="py-20 text-center text-gray-400">Loading…</p>
  if (error || !data) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">Product not found.</p>
        <Link to="/admin/products" className="mt-3 inline-block font-medium text-brand underline">
          Back to products
        </Link>
      </div>
    )
  }

  // key={data.id} makes React build a fresh form for each product.
  const { product_variants, ...product } = data
  return <ProductForm key={data.id} initial={{ product, variants: product_variants }} />
}

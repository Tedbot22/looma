import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, ImageOff, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import type { Product } from '../../lib/types'

type AdminProduct = Product & {
  categories: { name: string } | null
  product_variants: { stock: number; is_active: boolean }[]
}

export default function AdminProducts() {
  const queryClient = useQueryClient()

  const { data: products, isLoading, error } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async (): Promise<AdminProduct[]> => {
      // The admin RLS policy lets the owner see hidden products too.
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name), product_variants(stock, is_active)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as AdminProduct[]
    },
  })

  const toggleVisibility = useMutation({
    mutationFn: async (p: AdminProduct) => {
      const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
      if (error) throw error
      return !p.is_active
    },
    onSuccess: (nowActive) => {
      toast.success(nowActive ? 'Product is now visible in the store' : 'Product hidden from the store')
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err) => toast.error((err as Error).message),
  })

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold">Products</h1>
        <Link
          to="/admin/products/new"
          className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light"
        >
          <Plus size={16} /> Add product
        </Link>
      </div>

      {isLoading && <p className="text-gray-400">Loading products…</p>}
      {error && <p className="text-red-600">Couldn't load products: {(error as Error).message}</p>}
      {products && products.length === 0 && (
        <p className="py-16 text-center text-gray-400">No products yet. Add your first one!</p>
      )}

      <ul className="space-y-3">
        {products?.map((p) => {
          const stock = p.product_variants.filter((v) => v.is_active).reduce((n, v) => n + v.stock, 0)

          return (
            <li key={p.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-3">
              <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {p.images[0] ? (
                  <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-300">
                    <ImageOff size={18} />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-xs text-gray-500">{p.categories?.name ?? 'No category'}</p>
                <p className="text-sm">
                  <span className="font-semibold">{formatNaira(p.price)}</span>
                  {p.compare_at_price && (
                    <span className="ml-2 text-gray-400 line-through">{formatNaira(p.compare_at_price)}</span>
                  )}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      stock === 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {stock === 0 ? 'Sold out' : `${stock} in stock`}
                  </span>
                  {!p.is_active && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">Hidden</span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  aria-label={p.is_active ? 'Hide from store' : 'Show in store'}
                  title={p.is_active ? 'Hide from store' : 'Show in store'}
                  disabled={toggleVisibility.isPending}
                  onClick={() => toggleVisibility.mutate(p)}
                  className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:border-brand hover:text-brand"
                >
                  {p.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <Link
                  to={`/admin/products/${p.id}`}
                  aria-label={`Edit ${p.name}`}
                  className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:border-brand hover:text-brand"
                >
                  <Pencil size={16} />
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

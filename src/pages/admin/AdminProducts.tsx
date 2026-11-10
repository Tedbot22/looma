import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListSkeleton } from '../../components/Skeleton'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, FolderCog, ImageOff, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import { deleteProduct } from '../../lib/products'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import type { Category, Product } from '../../lib/types'

type AdminProduct = Product & {
  categories: { name: string } | null
  product_variants: { stock: number; is_active: boolean }[]
}

const chip = (active: boolean) =>
  `shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-sm ${
    active ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-brand'
  }`

export default function AdminProducts() {
  const queryClient = useQueryClient()
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [term, setTerm] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [toDelete, setToDelete] = useState<AdminProduct[] | null>(null)
  const [busy, setBusy] = useState(false)

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

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order')
      if (error) throw error
      return data
    },
  })

  const refresh = () =>
    Promise.all(
      ['admin-products', 'admin-categories', 'products', 'product', 'variant-info'].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k] })
      )
    )

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of products ?? []) m.set(p.category_id, (m.get(p.category_id) ?? 0) + 1)
    return m
  }, [products])

  const visible = useMemo(() => {
    const q = term.trim().toLowerCase()
    return (products ?? []).filter(
      (p) => (categoryFilter === 'all' || p.category_id === categoryFilter) && (!q || p.name.toLowerCase().includes(q))
    )
  }, [products, categoryFilter, term])

  const selectedProducts = (products ?? []).filter((p) => selected.has(p.id))
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const p of visible) {
        if (allVisibleSelected) next.delete(p.id)
        else next.add(p.id)
      }
      return next
    })

  async function setVisibility(items: AdminProduct[], active: boolean) {
    setBusy(true)
    const { error } = await supabase
      .from('products')
      .update({ is_active: active })
      .in('id', items.map((p) => p.id))
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success(
      items.length === 1
        ? active ? 'Product is now visible in the store' : 'Product hidden from the store'
        : `${items.length} products ${active ? 'shown in' : 'hidden from'} the store`
    )
    refresh()
  }

  async function moveToCategory(categoryId: string) {
    if (!categoryId || selectedProducts.length === 0) return
    setBusy(true)
    const { error } = await supabase
      .from('products')
      .update({ category_id: categoryId })
      .in('id', selectedProducts.map((p) => p.id))
    setBusy(false)
    if (error) return toast.error(error.message)
    const name = categories?.find((c) => c.id === categoryId)?.name ?? 'the category'
    toast.success(`Moved ${selectedProducts.length} to ${name}`)
    setSelected(new Set())
    refresh()
  }

  async function confirmDelete() {
    if (!toDelete) return
    setBusy(true)
    let deleted = 0
    let archived = 0
    let failed = 0
    let firstError = ''
    for (const p of toDelete) {
      try {
        const outcome = await deleteProduct(p.id, p.images)
        if (outcome === 'deleted') deleted++
        else archived++
      } catch (err) {
        failed++
        firstError ||= (err as Error).message
      }
    }
    setBusy(false)
    setToDelete(null)
    setSelected(new Set())

    if (deleted) toast.success(`Deleted ${deleted} ${deleted === 1 ? 'product' : 'products'}`)
    if (archived) {
      toast.message(
        `${archived} ${archived === 1 ? 'product is' : 'products are'} part of past orders, so ${
          archived === 1 ? 'it was' : 'they were'
        } hidden instead of deleted. Order history is untouched.`
      )
    }
    if (failed) toast.error(`Couldn't delete ${failed}: ${firstError}`)
    refresh()
  }

  return (
    <div className={selected.size > 0 ? 'pb-24' : ''}>
      <div className="mb-5 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Products</h1>
        <div className="flex gap-2">
          <Link
            to="/admin/categories"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-brand hover:text-brand"
          >
            <FolderCog size={16} /> Categories
          </Link>
          <Link
            to="/admin/products/new"
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light"
          >
            <Plus size={16} /> Add product
          </Link>
        </div>
      </div>

      {/* Search + category filter */}
      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search products"
          aria-label="Search products"
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand"
        />
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button className={chip(categoryFilter === 'all')} onClick={() => setCategoryFilter('all')}>
          All ({products?.length ?? 0})
        </button>
        {categories?.map((c) => (
          <button key={c.id} className={chip(categoryFilter === c.id)} onClick={() => setCategoryFilter(c.id)}>
            {c.name} ({counts.get(c.id) ?? 0})
          </button>
        ))}
      </div>

      {isLoading && <ListSkeleton rows={4} withImage />}
      {error && <p className="text-red-600">Couldn't load products: {(error as Error).message}</p>}
      {products && products.length === 0 && (
        <p className="py-16 text-center text-gray-400">No products yet. Add your first one!</p>
      )}
      {products && products.length > 0 && visible.length === 0 && (
        <p className="py-12 text-center text-gray-400">No products match.</p>
      )}

      {visible.length > 0 && (
        <label className="mb-2 flex items-center gap-2 text-sm text-gray-500">
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="h-4 w-4 accent-brand" />
          Select all shown ({visible.length})
        </label>
      )}

      <ul className="space-y-3">
        {visible.map((p) => {
          const stock = p.product_variants.filter((v) => v.is_active).reduce((n, v) => n + v.stock, 0)

          return (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${
                selected.has(p.id) ? 'border-brand' : 'border-gray-200'
              }`}
            >
              <input
                type="checkbox"
                aria-label={`Select ${p.name}`}
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
                className="h-4 w-4 shrink-0 accent-brand"
              />
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
                  disabled={busy}
                  onClick={() => setVisibility([p], !p.is_active)}
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
                <button
                  aria-label={`Delete ${p.name}`}
                  title="Delete"
                  disabled={busy}
                  onClick={() => setToDelete([p])}
                  className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:border-sale hover:text-sale"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white p-3 shadow-lg">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
            <span className="mr-auto text-sm font-medium">{selected.size} selected</span>
            <select
              aria-label="Move selected to category"
              disabled={busy}
              value=""
              onChange={(e) => moveToCategory(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
            >
              <option value="">Move to…</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              disabled={busy}
              onClick={() => setVisibility(selectedProducts, true)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:border-brand"
            >
              Show
            </button>
            <button
              disabled={busy}
              onClick={() => setVisibility(selectedProducts, false)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:border-brand"
            >
              Hide
            </button>
            <button
              disabled={busy}
              onClick={() => setToDelete(selectedProducts)}
              className="rounded-lg bg-sale px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Delete
            </button>
            <button onClick={() => setSelected(new Set())} className="px-2 py-2 text-sm text-gray-500 hover:text-brand">
              Clear
            </button>
          </div>
        </div>
      )}

      {toDelete && (
        <ConfirmDialog
          title={toDelete.length === 1 ? `Delete "${toDelete[0].name}"?` : `Delete ${toDelete.length} products?`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        >
          <p>
            This removes {toDelete.length === 1 ? 'the product' : 'these products'}, their options and photos for good.
            Anything that is part of a past order is hidden instead, so order history stays intact.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}

import { useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ImagePlus, Plus, Star, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { uploadProductImage } from '../../lib/images'
import type { Category, Product, ProductVariant } from '../../lib/types'

interface Props {
  // Present when editing; absent when adding a new product.
  initial?: { product: Product; variants: ProductVariant[] }
}

interface VariantRow {
  key: string // local-only id so React can track rows
  id?: string // database id (existing variants only)
  color: string
  size: string
  stock: string
  removed?: boolean
}

const MAX_IMAGES = 6

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand'
const labelClass = 'mb-1 block text-sm font-medium'

export default function ProductForm({ initial }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const isNew = !initial

  const [name, setName] = useState(initial?.product.name ?? '')
  const [description, setDescription] = useState(initial?.product.description ?? '')
  const [details, setDetails] = useState(initial?.product.details ?? '')
  const [categoryId, setCategoryId] = useState(initial?.product.category_id ?? '')
  const [price, setPrice] = useState(initial ? String(initial.product.price) : '')
  const [compareAt, setCompareAt] = useState(
    initial?.product.compare_at_price ? String(initial.product.compare_at_price) : ''
  )
  const [images, setImages] = useState<string[]>(initial?.product.images ?? [])
  const [isActive, setIsActive] = useState(initial?.product.is_active ?? true)
  const [rows, setRows] = useState<VariantRow[]>(() =>
    initial
      ? initial.variants
          .filter((v) => v.is_active)
          .map((v) => ({
            key: v.id,
            id: v.id,
            color: v.color ?? '',
            size: v.size ?? '',
            stock: String(v.stock),
          }))
      : [{ key: crypto.randomUUID(), color: '', size: '', stock: '1' }]
  )
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order')
      if (error) throw error
      return data
    },
  })

  // ---------- photos ----------
  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    e.target.value = '' // lets the same file be picked again later
    if (files.length === 0) return

    const room = MAX_IMAGES - images.length
    if (files.length > room) toast.message(`Only ${MAX_IMAGES} photos per product. Extra photos were skipped.`)

    setUploading(true)
    try {
      const urls: string[] = []
      for (const file of files.slice(0, Math.max(room, 0))) {
        urls.push(await uploadProductImage(file))
      }
      setImages((prev) => [...prev, ...urls])
    } catch (err) {
      toast.error(`Upload failed: ${(err as Error).message}`)
    } finally {
      setUploading(false)
    }
  }

  const makeCover = (url: string) => setImages((prev) => [url, ...prev.filter((u) => u !== url)])
  const removeImage = (url: string) => setImages((prev) => prev.filter((u) => u !== url))

  // ---------- variants ----------
  const visibleRows = rows.filter((r) => !r.removed)
  const updateRow = (key: string, patch: Partial<VariantRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const addRow = () =>
    setRows((prev) => [...prev, { key: crypto.randomUUID(), color: '', size: '', stock: '1' }])
  // Rows that exist in the database are marked removed (deleted on save); new rows just vanish.
  const removeRow = (row: VariantRow) =>
    setRows((prev) =>
      row.id ? prev.map((r) => (r.key === row.key ? { ...r, removed: true } : r)) : prev.filter((r) => r.key !== row.key)
    )

  // ---------- validation ----------
  function validate(): string | null {
    if (!name.trim()) return 'Please enter a product name.'
    if (!categoryId) return 'Please choose a category.'
    const p = Number(price)
    if (!price || Number.isNaN(p) || p <= 0) return 'Enter a valid price.'
    if (compareAt) {
      const c = Number(compareAt)
      if (Number.isNaN(c) || c <= p) return 'The original price must be higher than the current price.'
    }
    if (visibleRows.length === 0) return 'Add at least one option (even a single "no color / no size" row).'

    const seen = new Set<string>()
    for (const r of visibleRows) {
      const s = Number(r.stock)
      if (r.stock === '' || !Number.isInteger(s) || s < 0) return 'Stock must be a whole number, 0 or more.'
      const combo = `${r.color.trim().toLowerCase()}|${r.size.trim().toLowerCase()}`
      if (seen.has(combo)) return 'Two options have the same color and size.'
      seen.add(combo)
    }
    return null
  }

  // ---------- save ----------
  async function save() {
    const problem = validate()
    if (problem) {
      toast.error(problem)
      return
    }

    setSaving(true)
    let productId = initial?.product.id

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        details: details.trim() || null,
        category_id: categoryId,
        price: Number(price),
        compare_at_price: compareAt ? Number(compareAt) : null,
        images,
        is_active: isActive,
      }

      if (productId) {
        const { error } = await supabase.from('products').update(payload).eq('id', productId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('products').insert(payload).select('id').single()
        if (error) throw error
        productId = data.id
      }

      for (const row of rows) {
        if (row.removed) {
          if (!row.id) continue
          const { error } = await supabase.from('product_variants').delete().eq('id', row.id)
          // 23503 = it's part of a past order. We keep the history and simply hide the option.
          if (error?.code === '23503') {
            await supabase.from('product_variants').update({ is_active: false, stock: 0 }).eq('id', row.id)
          } else if (error) {
            throw error
          }
          continue
        }

        const values = {
          color: row.color.trim() || null,
          size: row.size.trim() || null,
          stock: Number(row.stock),
          is_active: true,
        }
        if (row.id) {
          const { error } = await supabase.from('product_variants').update(values).eq('id', row.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('product_variants').insert({ ...values, product_id: productId })
          if (error) throw error
        }
      }

      // Make the storefront and admin lists show fresh data.
      await Promise.all(
        ['admin-products', 'products', 'product', 'variant-info'].map((k) =>
          queryClient.invalidateQueries({ queryKey: [k] })
        )
      )
      toast.success(isNew ? 'Product added' : 'Product saved')
      navigate('/admin/products')
    } catch (err) {
      const e = err as { code?: string; message: string }
      const message =
        e.code === '23505' ? 'That color and size already exists on this product (it may be hidden).' : e.message

      if (isNew && productId) {
        // The product itself was created; only its options failed. Continue in edit mode
        // so pressing Save again can't create a duplicate product.
        toast.error(`Product created, but options failed: ${message}`)
        navigate(`/admin/products/${productId}`)
      } else {
        toast.error(message)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/admin/products" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
        <ArrowLeft size={16} /> Back to products
      </Link>
      <h1 className="mb-6 text-xl font-bold">{isNew ? 'Add product' : 'Edit product'}</h1>

      <div className="space-y-6">
        {/* Photos */}
        <section>
          <p className={labelClass}>
            Photos <span className="font-normal text-gray-400">(first photo is the cover)</span>
          </p>
          <div className="flex flex-wrap gap-3">
            {images.map((url, i) => (
              <div key={url} className="relative h-28 w-24 overflow-hidden rounded-lg bg-gray-100">
                <img src={url} alt="" className="h-full w-full object-cover" />
                {i === 0 ? (
                  <span className="absolute bottom-1 left-1 rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    Cover
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label="Make cover photo"
                    onClick={() => makeCover(url)}
                    className="absolute bottom-1 left-1 rounded bg-white/90 p-1 text-gray-700 hover:text-brand"
                  >
                    <Star size={12} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => removeImage(url)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black"
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            {images.length < MAX_IMAGES && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                className="flex h-28 w-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-brand hover:text-brand disabled:opacity-60"
              >
                <ImagePlus size={20} />
                {uploading ? 'Uploading…' : 'Add photo'}
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFiles}
          />
        </section>

        {/* Details */}
        <section className="space-y-4">
          <div>
            <label className={labelClass}>Name</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              className={inputClass}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>
              Product details <span className="font-normal text-gray-400">(optional, one point per line)</span>
            </label>
            <textarea
              className={inputClass}
              rows={4}
              placeholder={'Cotton blend, soft and breathable\nOversized fit\nWashed and ready to wear'}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Shown as a list on the product page, with the category, colours, sizes and availability added
              automatically.
            </p>
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <select className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Choose a category…</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Price (₦)</label>
              <input
                className={inputClass}
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="1500"
              />
            </div>
            <div>
              <label className={labelClass}>
                Original price (₦) <span className="font-normal text-gray-400">optional</span>
              </label>
              <input
                className={inputClass}
                inputMode="decimal"
                value={compareAt}
                onChange={(e) => setCompareAt(e.target.value)}
                placeholder="2000"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-gray-500">
            Fill in the original price to show a discount (₦2,000 crossed out, ₦1,500 now).
          </p>
        </section>

        {/* Variants */}
        <section>
          <p className={labelClass}>Options and stock</p>
          <p className="mb-3 text-xs text-gray-500">
            One row per color/size you have. For an item with only one version, leave color and size blank.
          </p>

          <div className="space-y-2">
            {visibleRows.map((row) => (
              <div key={row.key} className="grid grid-cols-[1fr_1fr_5rem_auto] items-center gap-2">
                <input
                  className={inputClass}
                  placeholder="Color"
                  value={row.color}
                  onChange={(e) => updateRow(row.key, { color: e.target.value })}
                />
                <input
                  className={inputClass}
                  placeholder="Size"
                  value={row.size}
                  onChange={(e) => updateRow(row.key, { size: e.target.value })}
                />
                <input
                  className={inputClass}
                  placeholder="Stock"
                  inputMode="numeric"
                  value={row.stock}
                  onChange={(e) => updateRow(row.key, { stock: e.target.value })}
                />
                <button
                  type="button"
                  aria-label="Remove option"
                  onClick={() => removeRow(row)}
                  className="p-2 text-gray-400 hover:text-sale"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
          >
            <Plus size={14} /> Add another option
          </button>
        </section>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Visible in the store
        </label>

        <button
          type="button"
          onClick={save}
          disabled={saving || uploading}
          className="w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
        >
          {saving ? 'Saving…' : isNew ? 'Add product' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

import { useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ImagePlus, Plus, Star, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { uploadProductImage } from '../../lib/images'
import { PRODUCT_PHOTO_HINT } from '../../lib/layout'
import type { Category, Product, ProductVariant } from '../../lib/types'

interface Props {
  // Present when editing; absent when adding a new product.
  initial?: { product: Product; variants: ProductVariant[] }
}

// One size of one colour. Each of these is a row in product_variants.
interface SizeRow {
  key: string // local-only id so React can track rows
  id?: string // database id (existing variants only)
  size: string
  stock: string
}

// A colour and all the sizes you have in it. Leave the colour blank for items without colours.
interface ColorGroup {
  key: string
  color: string
  sizes: SizeRow[]
}

const MAX_IMAGES = 6
const QUICK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

// The product details you typed last time are kept on this device and pre-filled for the next product.
const LAST_DETAILS_KEY = 'looma:last-product-details'
function readLastDetails(): string {
  try {
    return localStorage.getItem(LAST_DETAILS_KEY) ?? ''
  } catch {
    return '' // storage blocked: the box just starts empty
  }
}
function rememberDetails(text: string) {
  try {
    localStorage.setItem(LAST_DETAILS_KEY, text)
  } catch {
    /* not important enough to block saving */
  }
}

const newSize = (size = ''): SizeRow => ({ key: crypto.randomUUID(), size, stock: '1' })
const newGroup = (): ColorGroup => ({ key: crypto.randomUUID(), color: '', sizes: [newSize()] })

// Turns the saved variants (one per colour/size) into colour groups for editing.
function groupVariants(variants: ProductVariant[]): ColorGroup[] {
  const groups: ColorGroup[] = []
  for (const v of variants.filter((x) => x.is_active)) {
    const color = (v.color ?? '').trim()
    let group = groups.find((g) => g.color.trim().toLowerCase() === color.toLowerCase())
    if (!group) {
      group = { key: crypto.randomUUID(), color, sizes: [] }
      groups.push(group)
    }
    group.sizes.push({ key: v.id, id: v.id, size: v.size ?? '', stock: String(v.stock) })
  }
  return groups.length > 0 ? groups : [newGroup()]
}

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
  const [details, setDetails] = useState(initial ? (initial.product.details ?? '') : readLastDetails())
  const [categoryId, setCategoryId] = useState(initial?.product.category_id ?? '')
  const [price, setPrice] = useState(initial ? String(initial.product.price) : '')
  const [compareAt, setCompareAt] = useState(
    initial?.product.compare_at_price ? String(initial.product.compare_at_price) : ''
  )
  const [images, setImages] = useState<string[]>(initial?.product.images ?? [])
  const [isActive, setIsActive] = useState(initial?.product.is_active ?? true)
  const [groups, setGroups] = useState<ColorGroup[]>(() => (initial ? groupVariants(initial.variants) : [newGroup()]))
  // Saved variants the admin removed in this session; they are deleted (or hidden) on save.
  const [deletedIds, setDeletedIds] = useState<string[]>([])
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
  const allSizeRows = groups.flatMap((g) => g.sizes)
  const updateGroup = (key: string, patch: Partial<ColorGroup>) =>
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)))
  const updateSize = (groupKey: string, rowKey: string, patch: Partial<SizeRow>) =>
    setGroups((prev) =>
      prev.map((g) =>
        g.key === groupKey ? { ...g, sizes: g.sizes.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)) } : g
      )
    )
  const addSize = (groupKey: string, size = '') =>
    setGroups((prev) =>
      prev.map((g) => {
        if (g.key !== groupKey) return g
        // A quick-pick fills the empty starter row instead of adding a second one.
        const blank = size ? g.sizes.find((r) => !r.id && !r.size.trim() && g.sizes.length === 1) : undefined
        if (blank) return { ...g, sizes: [{ ...blank, size }] }
        return { ...g, sizes: [...g.sizes, newSize(size)] }
      })
    )
  const addGroup = () => setGroups((prev) => [...prev, newGroup()])

  // Rows that exist in the database are remembered so save can delete them; new rows just vanish.
  const removeSize = (group: ColorGroup, row: SizeRow) => {
    if (row.id) setDeletedIds((prev) => [...prev, row.id!])
    setGroups((prev) =>
      prev
        .map((g) => (g.key === group.key ? { ...g, sizes: g.sizes.filter((r) => r.key !== row.key) } : g))
        .filter((g) => g.sizes.length > 0) // a colour with no sizes left disappears
    )
  }
  const removeGroup = (group: ColorGroup) => {
    const ids = group.sizes.map((r) => r.id).filter((id): id is string => !!id)
    if (ids.length) setDeletedIds((prev) => [...prev, ...ids])
    setGroups((prev) => prev.filter((g) => g.key !== group.key))
  }

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
    if (allSizeRows.length === 0) return 'Add at least one option (even a single "no color / no size" row).'

    const seen = new Set<string>()
    for (const g of groups) {
      for (const r of g.sizes) {
        const s = Number(r.stock)
        if (r.stock === '' || !Number.isInteger(s) || s < 0) return 'Stock must be a whole number, 0 or more.'
        const combo = `${g.color.trim().toLowerCase()}|${r.size.trim().toLowerCase()}`
        if (seen.has(combo)) return 'Two options have the same color and size.'
        seen.add(combo)
      }
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

      // Options removed in the form: delete them, or hide them if a past order uses them.
      for (const id of deletedIds) {
        const { error } = await supabase.from('product_variants').delete().eq('id', id)
        // 23503 = it's part of a past order. We keep the history and simply hide the option.
        if (error?.code === '23503') {
          await supabase.from('product_variants').update({ is_active: false, stock: 0 }).eq('id', id)
        } else if (error) {
          throw error
        }
      }
      setDeletedIds([])

      for (const group of groups) {
        for (const row of group.sizes) {
          const values = {
            color: group.color.trim() || null,
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
      }

      // Remembered so the next new product starts with the same details.
      rememberDetails(details.trim())

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
          <p className="mb-2 text-xs text-gray-400">Best size: {PRODUCT_PHOTO_HINT}. Other shapes are centred and trimmed to fit.</p>
          <div className="flex flex-wrap gap-3">
            {images.map((url, i) => (
              <div key={url} className="relative h-28 w-24 overflow-hidden rounded-lg bg-gray-100">
                <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
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
              {isNew && ' The details from your last product are filled in for you, so edit them if this item is different.'}
            </p>
            {isNew && details && (
              <button
                type="button"
                onClick={() => setDetails('')}
                className="mt-1 text-xs font-medium text-brand hover:underline"
              >
                Clear details
              </button>
            )}
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
          <p className={labelClass}>Colors, sizes and stock</p>
          <p className="mb-3 text-xs text-gray-500">
            Add a color, then every size you have in it. Leave the color blank if the item has no color options, and
            leave the size blank if it has no sizes.
          </p>

          <div className="space-y-4">
            {groups.map((group) => {
              const taken = new Set(group.sizes.map((r) => r.size.trim().toLowerCase()))
              const quick = QUICK_SIZES.filter((q) => !taken.has(q.toLowerCase()))
              return (
                <div key={group.key} className="rounded-xl border border-gray-200 p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      className={inputClass}
                      placeholder="Color (optional)"
                      value={group.color}
                      onChange={(e) => updateGroup(group.key, { color: e.target.value })}
                    />
                    {groups.length > 1 && (
                      <button
                        type="button"
                        aria-label="Remove this color"
                        onClick={() => removeGroup(group)}
                        className="p-2 text-gray-400 hover:text-sale"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {group.sizes.map((row) => (
                      <div key={row.key} className="grid grid-cols-[1fr_5rem_auto] items-center gap-2">
                        <input
                          className={inputClass}
                          placeholder="Size (e.g. M, 42)"
                          value={row.size}
                          onChange={(e) => updateSize(group.key, row.key, { size: e.target.value })}
                        />
                        <input
                          className={inputClass}
                          placeholder="Stock"
                          inputMode="numeric"
                          value={row.stock}
                          onChange={(e) => updateSize(group.key, row.key, { stock: e.target.value })}
                        />
                        <button
                          type="button"
                          aria-label="Remove size"
                          onClick={() => removeSize(group, row)}
                          className="p-2 text-gray-400 hover:text-sale"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {quick.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => addSize(group.key, q)}
                        className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-brand hover:text-brand"
                      >
                        + {q}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => addSize(group.key)}
                      className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                    >
                      <Plus size={12} /> Other size
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={addGroup}
            className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
          >
            <Plus size={14} /> Add another color
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

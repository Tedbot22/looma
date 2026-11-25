import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  addCategory,
  deleteCategory,
  fetchAdminCategories,
  renameCategory,
  setCategoryOrder,
  type CategoryRow,
} from '../../api/adminCatalog'
import { errorMessage } from '../../api/db'
import { invalidateAll, queryKeys } from '../../api/queryKeys'
import { ListSkeleton } from '../../components/Skeleton'
import ConfirmDialog from '../../components/admin/ConfirmDialog'

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand'

export default function AdminCategories() {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<CategoryRow | null>(null)
  const [moveTo, setMoveTo] = useState('')

  const { data: categories, isLoading, error } = useQuery({ queryKey: queryKeys.admin.categories(), queryFn: fetchAdminCategories })

  // The storefront, footer and product form all share the 'categories' query.
  const refresh = () =>
    invalidateAll(queryClient, [
      queryKeys.admin.categories(),
      queryKeys.categories(),
      queryKeys.admin.products(),
      queryKeys.products.root(),
    ])

  const nameTaken = (name: string, exceptId?: string) =>
    !!categories?.some((c) => c.id !== exceptId && c.name.trim().toLowerCase() === name.trim().toLowerCase())

  async function add() {
    const name = newName.trim()
    if (!name) return toast.error('Enter a category name.')
    if (nameTaken(name)) return toast.error('You already have a category with that name.')
    setBusy(true)
    const nextOrder = (categories?.at(-1)?.sort_order ?? 0) + 1
    try {
      await addCategory(name, nextOrder)
    } catch (err) {
      return toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
    setNewName('')
    toast.success('Category added')
    refresh()
  }

  async function rename(c: CategoryRow) {
    const name = editName.trim()
    if (!name) return toast.error('Enter a category name.')
    if (nameTaken(name, c.id)) return toast.error('You already have a category with that name.')
    setBusy(true)
    try {
      await renameCategory(c.id, name)
    } catch (err) {
      return toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
    setEditingId(null)
    toast.success('Category renamed')
    refresh()
  }

  async function move(index: number, direction: -1 | 1) {
    if (!categories) return
    const next = [...categories]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setBusy(true)
    try {
      await setCategoryOrder(next.map((c) => c.id))
    } catch (err) {
      toast.error(errorMessage(err))
    }
    setBusy(false)
    refresh()
  }

  async function confirmDelete() {
    if (!deleting) return
    if (deleting.count > 0 && !moveTo) return toast.error('Choose where to move its products.')
    setBusy(true)
    try {
      await deleteCategory(deleting.id, deleting.count > 0 ? moveTo : null)
      toast.success('Category deleted')
      setDeleting(null)
      setMoveTo('')
      refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const others = categories?.filter((c) => c.id !== deleting?.id) ?? []

  return (
    <div>
      <Link to="/admin/products" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
        <ArrowLeft size={14} /> Back to products
      </Link>
      <h1 className="mb-5 text-xl font-bold">Categories</h1>

      <div className="mb-5 flex gap-2">
        <input
          className={inputClass}
          placeholder="New category name"
          value={newName}
          maxLength={40}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button
          onClick={add}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
        >
          <Plus size={16} /> Add
        </button>
      </div>

      {isLoading && <ListSkeleton rows={4} />}
      {error && <p className="text-red-600">Couldn't load categories: {(error as Error).message}</p>}
      {categories && categories.length === 0 && (
        <p className="py-12 text-center text-gray-400">No categories yet. Add your first one above.</p>
      )}

      <ul className="space-y-2">
        {categories?.map((c, i) => (
          <li key={c.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex flex-col">
              <button
                aria-label={`Move ${c.name} up`}
                disabled={busy || i === 0}
                onClick={() => move(i, -1)}
                className="text-gray-400 hover:text-brand disabled:opacity-30"
              >
                <ArrowUp size={16} />
              </button>
              <button
                aria-label={`Move ${c.name} down`}
                disabled={busy || i === categories.length - 1}
                onClick={() => move(i, 1)}
                className="text-gray-400 hover:text-brand disabled:opacity-30"
              >
                <ArrowDown size={16} />
              </button>
            </div>

            <div className="min-w-0 flex-1">
              {editingId === c.id ? (
                <input
                  autoFocus
                  className={inputClass}
                  value={editName}
                  maxLength={40}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') rename(c)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <>
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-xs text-gray-500">
                    {c.count} {c.count === 1 ? 'product' : 'products'}
                  </p>
                </>
              )}
            </div>

            <div className="flex shrink-0 gap-2">
              {editingId === c.id ? (
                <>
                  <button
                    aria-label="Save name"
                    disabled={busy}
                    onClick={() => rename(c)}
                    className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:border-brand hover:text-brand"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    aria-label="Cancel rename"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:border-brand hover:text-brand"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    aria-label={`Rename ${c.name}`}
                    onClick={() => {
                      setEditingId(c.id)
                      setEditName(c.name)
                    }}
                    className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:border-brand hover:text-brand"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    aria-label={`Delete ${c.name}`}
                    onClick={() => {
                      setDeleting(c)
                      setMoveTo('')
                    }}
                    className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:border-sale hover:text-sale"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          confirmLabel="Delete category"
          danger
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        >
          {deleting.count === 0 ? (
            <p>This category is empty, so nothing else will change.</p>
          ) : others.length === 0 ? (
            <p>
              It still has {deleting.count} {deleting.count === 1 ? 'product' : 'products'}, and there is no other
              category to move them to. Add another category first.
            </p>
          ) : (
            <>
              <p className="mb-2">
                It has {deleting.count} {deleting.count === 1 ? 'product' : 'products'}. Move them to:
              </p>
              <select className={inputClass} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Choose a category…</option>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}

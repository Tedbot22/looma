import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import { whatsappLinkTo } from '../../lib/whatsapp'
import type { CustomerRow } from '../../lib/adminMetrics'
import { ListSkeleton } from '../../components/Skeleton'

const PAGE = 25

// Admin, then Customers: everyone who has signed up, with how much they have bought.
export default function AdminCustomers() {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  // Wait for a pause in typing before asking the database.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(input.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [input])

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['admin-customers', search, page],
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<{ total: number; rows: CustomerRow[] }> => {
      const { data, error } = await supabase.rpc('admin_customers', {
        p_search: search || null,
        p_limit: PAGE,
        p_offset: page * PAGE,
      })
      if (error) throw error
      return data as { total: number; rows: CustomerRow[] }
    },
  })

  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Customers</h1>
          <p className="text-sm text-gray-500">{total} {total === 1 ? 'person has' : 'people have'} signed up{search && ' (matching your search)'}.</p>
        </div>
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Search customers</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search name, email or phone"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand"
          />
        </label>
      </div>

      {isLoading && <ListSkeleton rows={5} />}
      {error && <p className="text-red-600">Couldn't load customers. Has phase9_admin_metrics_and_review_media.sql been run?</p>}
      {data && data.rows.length === 0 && <p className="py-10 text-center text-gray-400">No customers found.</p>}

      <ul className={`space-y-2 ${isFetching ? 'opacity-70' : ''}`}>
        {data?.rows.map((c) => (
          <li key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  <span className="truncate">{c.full_name || 'No name yet'}</span>
                  {c.is_admin && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase text-white">Admin</span>}
                </p>
                <p className="truncate text-sm text-gray-500">{c.email}</p>
                {c.phone && (
                  <a href={whatsappLinkTo(c.phone, '')} target="_blank" rel="noreferrer" className="text-sm text-brand underline">
                    {c.phone}
                  </a>
                )}
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold tabular-nums">{formatNaira(Number(c.spent))}</p>
                <p className="text-gray-500">
                  {c.orders} {c.orders === 1 ? 'order' : 'orders'}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Joined {new Date(c.joined_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}
              {c.last_order_at && ` · Last order ${new Date(c.last_order_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}`}
            </p>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 font-medium hover:border-brand disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-gray-500">
            Page {page + 1} of {pages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 font-medium hover:border-brand disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

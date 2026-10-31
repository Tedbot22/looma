import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Category } from '../lib/types'

export default function Home() {
  const { data: categories, isLoading, error } = useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  return (
    <div>
      <section className="rounded-2xl bg-brand px-6 py-14 text-center text-white">
        <h1 className="text-3xl font-bold sm:text-4xl">Fresh fits. Student prices.</h1>
        <p className="mx-auto mt-3 max-w-md text-gray-300">
          Thrift finds and styled outfits, picked for campus life.
        </p>
        <Link
          to="/shop"
          className="mt-6 inline-block rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-brand"
        >
          Shop now
        </Link>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Shop by category</h2>

        {isLoading && <p className="text-gray-400">Loading categories…</p>}
        {error && (
          <p className="text-red-600">
            Couldn't load categories: {(error as Error).message}
          </p>
        )}

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
    </div>
  )
}

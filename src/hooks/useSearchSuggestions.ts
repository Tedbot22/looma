import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface Suggestion {
  id: string
  name: string
  price: number
  image: string | null
}

// Same clean-up the shop uses, so a comma or bracket typed in the box can never break the filter.
export const cleanSearchTerm = (raw: string) =>
  raw.replace(/[%_,()*"\\]/g, ' ').replace(/\s+/g, ' ').trim()

// Up to 6 matching items for the search box dropdown. Waits for a short pause in typing, so we ask
// the database once per pause rather than once per keystroke.
export function useSearchSuggestions(text: string, enabled: boolean) {
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(cleanSearchTerm(text)), 200)
    return () => clearTimeout(timer)
  }, [text])

  const term = debounced.length >= 2 ? debounced : ''

  const query = useQuery({
    queryKey: ['search-suggestions', term],
    enabled: enabled && term !== '',
    staleTime: 60_000,
    placeholderData: (previous) => previous, // keep the old list showing while the next one loads
    queryFn: async (): Promise<Suggestion[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, images')
        .eq('is_active', true)
        .ilike('name', `%${term}%`)
        .order('created_at', { ascending: false })
        .limit(6)
      if (error) throw error
      return (data ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        price: p.price as number,
        image: ((p.images as string[] | null) ?? [])[0] ?? null,
      }))
    },
  })

  return {
    suggestions: term ? (query.data ?? []) : [],
    loading: term !== '' && query.isFetching,
    term,
  }
}

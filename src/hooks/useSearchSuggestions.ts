import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { suggestQueries, type QuerySuggestion, type SearchableProduct } from '../lib/search'

export type Suggestion = QuerySuggestion

// Same clean-up the shop uses, so odd characters typed in the box can never cause trouble.
export const cleanSearchTerm = (raw: string) =>
  raw.replace(/[%_,()*"\\]/g, ' ').replace(/\s+/g, ' ').trim()

// The searchable text of every active item, loaded once and kept for a few minutes. Suggestions are
// then worked out on the device, so the list updates instantly as you type.
function useSearchIndex(enabled: boolean) {
  return useQuery({
    queryKey: ['search-index'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SearchableProduct[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category_id, details, description, categories(name), product_variants(color, size, is_active)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as SearchableProduct[]
    },
  })
}

// Suggested searches for the dropdown (like "black hoodie" or "black in Jackets"), best first.
export function useSearchSuggestions(text: string, enabled: boolean) {
  const [debounced, setDebounced] = useState('')

  // A very short pause, only to avoid redoing the work on every single keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(cleanSearchTerm(text)), 120)
    return () => clearTimeout(timer)
  }, [text])

  const term = debounced.length >= 2 ? debounced : ''
  const index = useSearchIndex(enabled && term !== '')

  const suggestions = useMemo<Suggestion[]>(
    () => (term && index.data ? suggestQueries(index.data, term) : []),
    [term, index.data]
  )

  return { suggestions, loading: term !== '' && index.isLoading, term }
}

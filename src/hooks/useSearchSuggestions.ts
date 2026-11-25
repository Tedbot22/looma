import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSearchCandidates } from '../api/shop'
import { suggestQueries, type QuerySuggestion } from '../lib/search'
import { queryKeys } from '../api/queryKeys'

export type Suggestion = QuerySuggestion

// Same clean-up the shop uses, so odd characters typed in the box can never cause trouble.
export const cleanSearchTerm = (raw: string) =>
  raw.replace(/[%_,()*"\\]/g, ' ').replace(/\s+/g, ' ').trim()

// How many matching items the suggestions are worked out from. A handful is plenty for a dropdown.
const SUGGESTION_SAMPLE = 40

// Suggested searches for the dropdown (like "black hoodie" or "black in Jackets"), best first.
// The database finds the matching items; the wording of the suggestions is still worked out here.
export function useSearchSuggestions(text: string, enabled: boolean) {
  const [debounced, setDebounced] = useState('')

  // A short pause so a request isn't sent for every single keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(cleanSearchTerm(text)), 200)
    return () => clearTimeout(timer)
  }, [text])

  const term = debounced.length >= 2 ? debounced : ''

  const matches = useQuery({
    queryKey: queryKeys.products.suggest(term),
    enabled: enabled && term !== '',
    staleTime: 60_000,
    placeholderData: (previous) => previous, // keep the old list showing while the next one loads
    queryFn: () => fetchSearchCandidates(term, {}, SUGGESTION_SAMPLE),
  })

  const suggestions = useMemo<Suggestion[]>(
    () => (term && matches.data ? suggestQueries(matches.data, term) : []),
    [term, matches.data]
  )

  return { suggestions, loading: term !== '' && matches.isLoading, term }
}

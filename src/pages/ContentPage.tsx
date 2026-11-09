import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { FaqAccordion, RichText } from '../components/RichText'
import { Skeleton } from '../components/Skeleton'

interface SitePage {
  slug: string
  title: string
  content: string
  updated_at: string
}

// One page whose text the owner can edit in Admin > Store (About, FAQ, Privacy Policy, Terms).
// The FAQ shows each question as a section that opens to reveal its answer.
export default function ContentPage({ slug, accordion = false }: { slug: string; accordion?: boolean }) {
  const { data: page, isLoading } = useQuery({
    queryKey: ['site-page', slug],
    queryFn: async (): Promise<SitePage | null> => {
      const { data, error } = await supabase.from('site_pages').select('*').eq('slug', slug).maybeSingle()
      if (error) throw error
      return data as SitePage | null
    },
    staleTime: 10 * 60_000,
  })

  if (isLoading) {
    return (
      <div role="status" aria-busy="true" className="mx-auto max-w-3xl space-y-4 py-4">
        <span className="sr-only">Loading…</span>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="mt-6 h-6 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    )
  }

  if (!page) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">This page isn't available.</p>
        <Link to="/" className="mt-3 inline-block font-medium text-brand underline">
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <article className="mx-auto max-w-3xl py-4">
      <h1 className="mb-6 text-3xl font-bold">{page.title}</h1>
      {accordion ? <FaqAccordion content={page.content} /> : <RichText content={page.content} />}
      <p className="mt-10 border-t border-gray-100 pt-4 text-xs text-gray-400">
        Last updated {new Date(page.updated_at).toLocaleDateString('en-NG', { dateStyle: 'long' })}
      </p>
    </article>
  )
}

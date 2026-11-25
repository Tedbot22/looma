// Pages whose text the owner edits in Admin > Store (About, FAQ, Privacy Policy, Terms).

import { supabase } from '../lib/supabase'
import { run, unwrap } from './db'

export interface SitePage {
  slug: string
  title: string
  content: string
  updated_at: string
}

// One page, or null if there is no page with that address.
export const fetchSitePage = (slug: string): Promise<SitePage | null> =>
  unwrap(supabase.from('site_pages').select('*').eq('slug', slug).maybeSingle())

export type EditableSitePage = Pick<SitePage, 'slug' | 'title' | 'content'>

export const fetchEditableSitePages = (): Promise<EditableSitePage[]> =>
  unwrap(supabase.from('site_pages').select('slug, title, content'))

export const saveSitePage = (slug: string, page: { title: string; content: string }) =>
  run(supabase.from('site_pages').update({ ...page, updated_at: new Date().toISOString() }).eq('slug', slug))

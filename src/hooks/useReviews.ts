import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { PublicReview, ReviewProduct, ReviewStats } from '../lib/reviews'

// Totals for the summary and the product page link. Counted in the database; cached for a few minutes.
export function useReviewStats() {
  return useQuery({
    queryKey: ['review-stats'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ReviewStats> => {
      const { data, error } = await supabase.rpc('store_review_stats')
      if (error) throw error
      return data as ReviewStats
    },
  })
}

export type ReviewSort = 'newest' | 'highest' | 'lowest'

export interface ReviewFilters {
  rating: number | null // only this many stars, or null for all
  withComments: boolean
  sort: ReviewSort
}

// The most recent reviews that match the filters (the first 100; the page reveals them ten at a time).
export function useStoreReviews(filters: ReviewFilters) {
  return useQuery({
    queryKey: ['store-reviews', filters],
    staleTime: 60_000,
    queryFn: async (): Promise<PublicReview[]> => {
      let query = supabase.from('public_store_reviews').select('*').limit(100)
      if (filters.rating) query = query.eq('rating', filters.rating)
      if (filters.withComments) query = query.not('message', 'is', null)

      if (filters.sort === 'highest') query = query.order('rating', { ascending: false })
      if (filters.sort === 'lowest') query = query.order('rating', { ascending: true })
      query = query.order('created_at', { ascending: false })

      const { data, error } = await query
      if (error) throw error
      return data as PublicReview[]
    },
  })
}

// Reviews linked to one product (customers who bought it), newest first, plus its average and count.
export function useProductReviews(productId: string | undefined) {
  return useQuery({
    queryKey: ['product-reviews', productId],
    enabled: !!productId,
    staleTime: 60_000,
    queryFn: async (): Promise<{ reviews: PublicReview[]; count: number; average: number }> => {
      const [list, stats] = await Promise.all([
        supabase
          .from('public_product_reviews')
          .select('*')
          .eq('product_id', productId!)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('product_review_stats').select('count, average').eq('product_id', productId!).maybeSingle(),
      ])
      if (list.error) throw list.error
      if (stats.error) throw stats.error
      return {
        reviews: list.data as PublicReview[],
        count: Number(stats.data?.count ?? 0),
        average: Number(stats.data?.average ?? 0),
      }
    },
  })
}

// The products each of these reviews is linked to, keyed by review id (for the "Bought:" line on review cards).
export function useReviewProducts(reviewIds: string[]) {
  return useQuery({
    queryKey: ['review-products', reviewIds.join(',')],
    enabled: reviewIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, ReviewProduct[]>> => {
      const { data, error } = await supabase
        .from('public_review_products')
        .select('review_id, product_id, product_name')
        .in('review_id', reviewIds)
      if (error) throw error
      const byReview: Record<string, ReviewProduct[]> = {}
      for (const row of (data ?? []) as ReviewProduct[]) (byReview[row.review_id] ??= []).push(row)
      return byReview
    },
  })
}

// The ids of the orders this customer has already reviewed.
export function useMyReviewedOrderIds() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-reviewed-orders', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('store_reviews').select('order_id').eq('user_id', user!.id)
      if (error) throw error
      return (data ?? []).map((r) => r.order_id as string)
    },
  })
}

export interface PendingReviewOrder {
  id: string
  order_number: number
}

const PROMPT_WINDOW_DAYS = 45

// Delivered orders (placed in the last 45 days) that the customer has not reviewed yet, newest first.
// This is what the "How was your order?" prompt is built from.
export function usePendingReviewOrders() {
  const { user } = useAuth()
  const reviewed = useMyReviewedOrderIds()

  const delivered = useQuery({
    queryKey: ['review-prompt-orders', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PendingReviewOrder[]> => {
      const since = new Date(Date.now() - PROMPT_WINDOW_DAYS * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number')
        .eq('user_id', user!.id)
        .eq('status', 'delivered')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data as PendingReviewOrder[]
    },
  })

  const pending = useMemo(() => {
    if (!delivered.data || !reviewed.data) return undefined
    return delivered.data.filter((o) => !reviewed.data.includes(o.id))
  }, [delivered.data, reviewed.data])

  return { pending, isLoading: delivered.isLoading || reviewed.isLoading }
}

// This customer's review of one order, or null if they haven't reviewed it.
export function useOrderReview(orderId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-review', orderId],
    enabled: !!user && !!orderId,
    queryFn: async (): Promise<{ id: string; rating: number } | null> => {
      const { data, error } = await supabase
        .from('store_reviews')
        .select('id, rating')
        .eq('order_id', orderId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchOrderReview,
  fetchProductReviews,
  fetchRecentDeliveredOrders,
  fetchReviewMedia,
  fetchReviewProducts,
  fetchReviewStats,
  fetchReviewedOrderIds,
  fetchStoreReviews,
} from '../api/reviews'
import { queryKeys } from '../api/queryKeys'
import { useAuth } from '../context/AuthContext'
import type { ReviewFilters } from '../lib/reviews'

export type { PendingReviewOrder } from '../api/reviews'
export type { ReviewFilters, ReviewSort } from '../lib/reviews'

// Totals for the summary and the product page link. Counted in the database; cached for a few minutes.
export function useReviewStats() {
  return useQuery({ queryKey: queryKeys.reviews.stats(), staleTime: 5 * 60_000, queryFn: fetchReviewStats })
}

// The most recent reviews that match the filters (the first 100; the page reveals them ten at a time).
export function useStoreReviews(filters: ReviewFilters) {
  return useQuery({
    queryKey: queryKeys.reviews.store(filters),
    staleTime: 60_000,
    queryFn: () => fetchStoreReviews(filters),
  })
}

// Reviews linked to one product (customers who bought it), newest first, plus its average and count.
export function useProductReviews(productId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reviews.product(productId),
    enabled: !!productId,
    staleTime: 60_000,
    queryFn: () => fetchProductReviews(productId!),
  })
}

// The products each of these reviews is linked to, keyed by review id (for the "Bought:" line on review cards).
export function useReviewProducts(reviewIds: string[]) {
  return useQuery({
    queryKey: queryKeys.reviews.products(reviewIds),
    enabled: reviewIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchReviewProducts(reviewIds),
  })
}

// The photos and videos on these reviews, keyed by review id.
export function useReviewMedia(reviewIds: string[]) {
  return useQuery({
    queryKey: queryKeys.reviews.media(reviewIds),
    enabled: reviewIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchReviewMedia(reviewIds),
  })
}

// The ids of the orders this customer has already reviewed.
export function useMyReviewedOrderIds() {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.reviews.reviewedOrders(user?.id),
    enabled: !!user,
    staleTime: 60_000,
    queryFn: () => fetchReviewedOrderIds(user!.id),
  })
}

const PROMPT_WINDOW_DAYS = 45

// Delivered orders (placed in the last 45 days) that the customer has not reviewed yet, newest first.
// This is what the "How was your order?" prompt is built from.
export function usePendingReviewOrders() {
  const { user } = useAuth()
  const reviewed = useMyReviewedOrderIds()

  const delivered = useQuery({
    queryKey: queryKeys.reviews.promptOrders(user?.id),
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: () => fetchRecentDeliveredOrders(user!.id, PROMPT_WINDOW_DAYS),
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
    queryKey: queryKeys.reviews.orderReview(orderId),
    enabled: !!user && !!orderId,
    queryFn: () => fetchOrderReview(orderId!),
  })
}

// Reviews: what customers read, what a customer writes about their order, and what the owner moderates.

import { supabase } from '../lib/supabase'
import type { ReviewMedia } from '../lib/reviewMedia'
import type { PublicReview, ReviewFilters, ReviewProduct, ReviewStats } from '../lib/reviews'
import { errorCode, run, unwrap } from './db'

/* --------------------------------- reading --------------------------------- */

// Totals for the summary and the product page link, counted in the database.
export const fetchReviewStats = (): Promise<ReviewStats> => unwrap<ReviewStats>(supabase.rpc('store_review_stats'))

// The most recent public reviews that match the filters (the first 100).
export function fetchStoreReviews(filters: ReviewFilters): Promise<PublicReview[]> {
  let query = supabase.from('public_store_reviews').select('*').limit(100)
  if (filters.rating) query = query.eq('rating', filters.rating)
  if (filters.withComments) query = query.not('message', 'is', null)

  if (filters.sort === 'highest') query = query.order('rating', { ascending: false })
  if (filters.sort === 'lowest') query = query.order('rating', { ascending: true })
  query = query.order('created_at', { ascending: false })

  return unwrap(query)
}

export interface ProductReviews {
  reviews: PublicReview[]
  count: number
  average: number
}

// Reviews linked to one product (from customers who bought it), newest first, plus its average and count.
export async function fetchProductReviews(productId: string): Promise<ProductReviews> {
  const [reviews, stats] = await Promise.all([
    unwrap<PublicReview[]>(
      supabase.from('public_product_reviews').select('*').eq('product_id', productId).order('created_at', { ascending: false }).limit(20)
    ),
    unwrap<{ count: number | string; average: number | string } | null>(
      supabase.from('product_review_stats').select('count, average').eq('product_id', productId).maybeSingle()
    ),
  ])
  return { reviews, count: Number(stats?.count ?? 0), average: Number(stats?.average ?? 0) }
}

// The products each of these reviews is linked to, keyed by review id (for the "Bought:" line on review cards).
export async function fetchReviewProducts(reviewIds: string[]): Promise<Record<string, ReviewProduct[]>> {
  const rows = await unwrap<ReviewProduct[] | null>(
    supabase.from('public_review_products').select('review_id, product_id, product_name').in('review_id', reviewIds)
  )
  const byReview: Record<string, ReviewProduct[]> = {}
  for (const row of rows ?? []) (byReview[row.review_id] ??= []).push(row)
  return byReview
}

// The photos and videos on these reviews, keyed by review id. If they can't be read, the reviews still show
// (just without media), so this never throws.
export async function fetchReviewMedia(reviewIds: string[]): Promise<Record<string, ReviewMedia[]>> {
  const { data, error } = await supabase
    .from('public_review_media')
    .select('id, review_id, kind, url')
    .in('review_id', reviewIds)
    .order('created_at')
  if (error) return {}
  const byReview: Record<string, ReviewMedia[]> = {}
  for (const row of (data ?? []) as ReviewMedia[]) (byReview[row.review_id] ??= []).push(row)
  return byReview
}

/* ------------------------------ a customer's reviews ------------------------------ */

// The ids of the orders this customer has already reviewed.
export async function fetchReviewedOrderIds(userId: string): Promise<string[]> {
  const rows = await unwrap<{ order_id: string }[] | null>(supabase.from('store_reviews').select('order_id').eq('user_id', userId))
  return (rows ?? []).map((r) => r.order_id)
}

export interface PendingReviewOrder {
  id: string
  order_number: number
}

// Delivered orders placed in the last `days` days, newest first (the 10 latest). The "How was your order?"
// prompt shows the ones not yet reviewed.
export function fetchRecentDeliveredOrders(userId: string, days: number): Promise<PendingReviewOrder[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  return unwrap(
    supabase
      .from('orders')
      .select('id, order_number')
      .eq('user_id', userId)
      .eq('status', 'delivered')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10)
  )
}

// This customer's review of one order, or null if they haven't reviewed it.
export const fetchOrderReview = (orderId: string): Promise<{ id: string; rating: number } | null> =>
  unwrap(supabase.from('store_reviews').select('id, rating').eq('order_id', orderId).maybeSingle())

export interface OrderToReview {
  id: string
  order_number: number
  status: string
  order_items: { name: string }[]
}

// The order a review is being written for (the database only lets you read your own).
export const fetchOrderToReview = (orderId: string): Promise<OrderToReview | null> =>
  unwrap(supabase.from('orders').select('id, order_number, status, order_items(name)').eq('id', orderId).maybeSingle())

/* ------------------------------- writing a review ------------------------------- */

export interface ReviewInput {
  orderId: string
  userId: string
  rating: number
  itemCondition: string | null
  delivery: string | null
  message: string | null
}

// Saves the review and returns its id. The database only allows one review per delivered order.
export async function createReview(input: ReviewInput): Promise<string> {
  const row = await unwrap<{ id: string }>(
    supabase
      .from('store_reviews')
      .insert({
        order_id: input.orderId,
        user_id: input.userId,
        rating: input.rating,
        item_condition: input.itemCondition,
        delivery: input.delivery,
        message: input.message,
      })
      .select('id')
      .single()
  )
  return row.id
}

// Why a review was refused:
//   already_reviewed  this order already has one (database code 23505)
//   not_delivered     reviews open once the order is delivered (code 42501)
export type ReviewProblem = 'already_reviewed' | 'not_delivered' | 'other'

export function classifyReviewError(err: unknown): ReviewProblem {
  const code = errorCode(err)
  if (code === '23505') return 'already_reviewed'
  if (code === '42501') return 'not_delivered'
  return 'other'
}

// Attaches uploaded photos and videos to a review.
export const attachReviewMedia = (reviewId: string, userId: string, files: { kind: 'image' | 'video'; url: string }[]) =>
  run(supabase.from('review_media').insert(files.map((f) => ({ review_id: reviewId, user_id: userId, kind: f.kind, url: f.url }))))

/* ------------------------------- the owner's side ------------------------------- */

export interface AdminReview {
  id: string
  rating: number
  size_fit: string | null
  comfort: string | null
  delivery: string | null
  item_condition: string | null
  message: string | null
  is_visible: boolean
  created_at: string
  orders: { order_number: number } | null
  profiles: { full_name: string | null } | null
  review_media: Pick<ReviewMedia, 'id' | 'kind' | 'url'>[] | null
}

// The 200 most recent reviews, hidden ones included.
export const fetchAdminReviews = (): Promise<AdminReview[]> =>
  unwrap(
    supabase
      .from('store_reviews')
      .select('*, orders(order_number), profiles(full_name), review_media(id, kind, url)')
      .order('created_at', { ascending: false })
      .limit(200)
  ) as unknown as Promise<AdminReview[]>

// A hidden review disappears from the store and from the averages.
export const setReviewVisible = (reviewId: string, visible: boolean) =>
  run(supabase.from('store_reviews').update({ is_visible: visible }).eq('id', reviewId))

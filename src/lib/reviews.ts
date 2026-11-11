// Everything about store reviews that more than one screen needs: the quick questions,
// their answers, the shape of the data, and the "Not now" memory for the review prompt.

export type ReviewQuestionKey = 'size_fit' | 'comfort' | 'item_condition' | 'delivery'

// How good an answer is, used to colour the bars on the reviews page.
export type Tone = 'low' | 'mid' | 'high'

export interface ReviewOption {
  value: string
  label: string
  tone: Tone
}

export interface ReviewQuestion {
  key: ReviewQuestionKey
  short: string // used on review cards and the summary ("Size fit")
  question: string // asked on the review form
  options: ReviewOption[] // always worst first, best last
}

// To add or change a question: edit it here AND add the column in phase8_reviews.sql.
export const REVIEW_QUESTIONS: ReviewQuestion[] = [
  {
    key: 'size_fit',
    short: 'Size fit',
    question: 'How did the size fit?',
    options: [
      { value: 'bad', label: 'Bad', tone: 'low' },
      { value: 'good', label: 'Good', tone: 'mid' },
      { value: 'very_good', label: 'Very good', tone: 'high' },
    ],
  },
  {
    key: 'comfort',
    short: 'Comfort',
    question: 'How comfortable is it?',
    options: [
      { value: 'bad', label: 'Not comfortable', tone: 'low' },
      { value: 'good', label: 'Comfortable', tone: 'mid' },
      { value: 'very_good', label: 'Very comfortable', tone: 'high' },
    ],
  },
  {
    key: 'item_condition',
    short: 'Condition',
    question: 'Did it match the description?',
    options: [
      { value: 'worse', label: 'Worse than described', tone: 'low' },
      { value: 'as_described', label: 'As described', tone: 'mid' },
      { value: 'better', label: 'Better than described', tone: 'high' },
    ],
  },
  {
    key: 'delivery',
    short: 'Delivery',
    question: 'How was the delivery?',
    options: [
      { value: 'bad', label: 'Bad', tone: 'low' },
      { value: 'good', label: 'Good', tone: 'mid' },
      { value: 'very_good', label: 'Very good', tone: 'high' },
    ],
  },
]

export const MAX_MESSAGE_LENGTH = 1000

export const RATING_LABEL: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very good',
  5: 'Excellent',
}

export function optionLabel(key: ReviewQuestionKey, value: string | null): string | null {
  if (!value) return null
  return REVIEW_QUESTIONS.find((q) => q.key === key)?.options.find((o) => o.value === value)?.label ?? null
}

// A review as the public sees it (from the public_store_reviews view).
export interface PublicReview {
  id: string
  rating: number
  size_fit: string | null
  comfort: string | null
  delivery: string | null
  item_condition: string | null
  message: string | null
  created_at: string
  reviewer_name: string
}

// A product a review is linked to (from the public_review_products view).
export interface ReviewProduct {
  review_id: string
  product_id: string
  product_name: string
}

// The totals from store_review_stats().
export interface ReviewStats {
  count: number
  average: number
  stars: Record<'1' | '2' | '3' | '4' | '5', number>
  size_fit: Record<string, number>
  comfort: Record<string, number>
  delivery: Record<string, number>
  item_condition: Record<string, number>
}

// ---------- "Not now" on the review prompt ----------
// Reviews are voluntary: if someone dismisses the prompt for an order, we don't show it again on this device.
// (They can still review from the order page or the orders list at any time.)
const DISMISSED_KEY = 'review-prompt-dismissed'

export function getDismissedOrders(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function dismissOrderPrompt(orderId: string): string[] {
  const next = [...new Set([...getDismissedOrders(), orderId])].slice(-50)
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
  } catch {
    /* storage blocked: the prompt may come back on the next visit, which is harmless */
  }
  return next
}

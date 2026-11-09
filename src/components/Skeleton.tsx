import type { ReactNode } from 'react'
import { FULL_BLEED } from '../lib/layout'

// Skeleton screens: grey placeholder shapes that mimic the real page while data loads.
// They keep the layout steady (nothing jumps when the content arrives) and feel faster than a "Loading…" message.

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-gray-200 ${className}`} />
}

// Tells screen readers the area is loading, while the grey shapes themselves stay silent.
function Busy({ label = 'Loading', className = '', children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  )
}

// The same shape as a product card: photo, name, price.
export function ProductCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[3/4] w-full rounded-xl" />
      <Skeleton className="mt-3 h-4 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/3" />
    </div>
  )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <Busy label="Loading products" className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </Busy>
  )
}

// Rounded pills, like the category chips.
export function ChipsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <Busy label="Loading categories" className="flex gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-9 w-24 rounded-full" />
      ))}
    </Busy>
  )
}

// A vertical list of rows, optionally with a thumbnail (orders, products, vouchers).
export function ListSkeleton({ rows = 4, withImage = false }: { rows?: number; withImage?: boolean }) {
  return (
    <Busy label="Loading" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-gray-100 p-4">
          {withImage && <Skeleton className="h-20 w-16 shrink-0 rounded-lg" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-8 w-16 shrink-0" />
        </div>
      ))}
    </Busy>
  )
}

export function ProductPageSkeleton() {
  return (
    <Busy label="Loading product" className="grid gap-8 md:grid-cols-2">
      <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
      <div className="space-y-5">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-7 w-1/3" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-3 pt-4">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
      </div>
    </Busy>
  )
}

export function CartSkeleton() {
  return (
    <Busy label="Loading your cart" className="mx-auto max-w-2xl">
      <Skeleton className="mb-6 h-8 w-32" />
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-24 w-20 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-4 w-1/5" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 h-32 w-full rounded-xl" />
    </Busy>
  )
}

export function CheckoutSkeleton() {
  return (
    <Busy label="Loading checkout" className="mx-auto grid max-w-4xl gap-8 md:grid-cols-5">
      <div className="space-y-6 md:col-span-3">
        <Skeleton className="h-8 w-40" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl md:col-span-2" />
    </Busy>
  )
}

export function OrderSkeleton() {
  return (
    <Busy label="Loading your order" className="mx-auto max-w-xl">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="mt-8 space-y-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 h-40 w-full rounded-xl" />
    </Busy>
  )
}

// The home page banner while it loads.
export function HeroSkeleton() {
  return (
    <Busy label="Loading" className={`-mt-6 mb-10 ${FULL_BLEED}`}>
      <Skeleton className="aspect-[16/9] max-h-[620px] w-full rounded-none sm:aspect-[21/9]" />
    </Busy>
  )
}
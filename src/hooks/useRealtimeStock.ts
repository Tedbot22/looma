import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// Live stock updates. Whenever ANY variant changes in the database (a sale, a restock,
// the owner editing stock), every open shop page re-checks its data, so items flip to
// "Sold out" on their own, without anyone clicking anything.
//
// Mount this ONCE for the storefront (we do it in Layout).
export function useRealtimeStock() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let hasConnectedBefore = false

    // Debounce: an order with 5 items causes 5 events at once. One refresh is enough.
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        for (const key of ['products', 'product', 'variant-info', 'cart', 'wishlist']) {
          queryClient.invalidateQueries({ queryKey: [key] }) // only re-fetches what's on screen
        }
      }, 400)
    }

    const connect = () => {
      if (channel) return
      channel = supabase
        .channel('stock-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, refresh)
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return
          // After a reconnect we may have missed events, so re-check once.
          if (hasConnectedBefore) refresh()
          hasConnectedBefore = true
        })
    }

    const disconnect = () => {
      if (channel) {
        supabase.removeChannel(channel)
        channel = null
      }
    }

    // Hidden tab = no live connection (saves your free-tier connection limit).
    const onVisibility = () => (document.hidden ? disconnect() : connect())

    if (!document.hidden) connect()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(timer)
      disconnect()
    }
  }, [queryClient])
}

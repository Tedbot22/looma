import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './index.css'
import './lib/install' // starts listening for the browser's install event right away
import App from './App'
import { CartProvider } from './context/CartContext'
import { WishlistProvider } from './context/WishlistContext'
import { AuthProvider } from './context/AuthContext'
import { DialogProvider } from './context/DialogContext'

// React Query caches server data and handles loading/error states for us.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // treat data as fresh for 1 minute
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <DialogProvider>
              <App />
            </DialogProvider>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  </StrictMode>
)

// Register the service worker (it only handles push notifications; it doesn't cache anything).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* push just won't be available */
    })
  })
}

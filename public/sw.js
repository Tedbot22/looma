// Service worker: its only job is to receive push messages and show them as notifications
// (new-order alerts for the owner, order updates for customers).
// It deliberately does NOT cache pages, so customers never see a stale store.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// A push arrived from the server (even if the app is closed).
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'LOOMA', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag, // same tag = replaces the older notification (one per order)
      renotify: !!data.tag, // ...but still buzz when it is replaced by a newer update
      data: { url: data.url || '/' },
    })
  )
})

// Tapping a notification opens the page it is about, reusing an open window when there is one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin)

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      // Already on that exact page: just bring it to the front.
      const same = windows.find((c) => new URL(c.url).pathname === target.pathname)
      if (same && 'focus' in same) return same.focus()

      // Some other page of ours is open: focus it and send it where the notification points.
      const any = windows.find((c) => new URL(c.url).origin === target.origin)
      if (any && 'focus' in any) {
        try {
          const focused = await any.focus()
          if (focused && 'navigate' in focused) return focused.navigate(target.href)
        } catch {
          /* fall through and open a new window */
        }
      }
      return self.clients.openWindow(target.href)
    })
  )
})

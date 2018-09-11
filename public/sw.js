/* global self, caches, fetch */

// https://medium.com/dev-channel/learn-how-to-build-a-pwa-in-under-5-minutes-c860ad406ed

const cacheName = 'praytime-cache'
const filesToCache = [
  '/',
  '/index.html',
  '/praytime.js',
  '/suncalc.js'
]

self.addEventListener('install', function (e) {
  console.log('[ServiceWorker] Install')
  e.waitUntil(
    caches.open(cacheName).then(function (cache) {
      console.log('[ServiceWorker] Caching app shell')
      return cache.addAll(filesToCache)
    })
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request)
      })
  )
})

/* global self, caches, fetch */

// https://medium.com/dev-channel/learn-how-to-build-a-pwa-in-under-5-minutes-c860ad406ed

// TODO: use cache-busting hashes then re-enable
const cacheName = 'praytime-cache-v1'
const filesToCache = [
  // '/',
  // '/index.html',
  // '/praytime.js',
]

self.addEventListener('install', function (e) {
  console.log('[SW] Install')
  e.waitUntil(
    caches.open(cacheName).then(function (cache) {
      console.log('[SW] Caching app shell')
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

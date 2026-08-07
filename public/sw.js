const CACHE_NAME = 'llm-mobile-v7';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  // Force active immediately when skipWaiting is received
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass caching for APIs, WebSockets, or SSE
  if (url.pathname.startsWith('/api') || 
      url.pathname.startsWith('/events') || 
      url.pathname.startsWith('/status') ||
      url.pathname.startsWith('/system_stats') ||
      url.pathname.startsWith('/models') ||
      url.pathname.startsWith('/ws') ||
      event.request.method !== 'GET') {
    return;
  }

  // Helper: check if a response is safe to cache (not a Cloudflare login redirect)
  const isSafeToCache = (response) => {
    if (response.status !== 200) return false;
    if (response.type !== 'basic') return false;
    const url = new URL(response.url);
    if (url.hostname.includes('cloudflareaccess.com') || url.hostname.includes('navynui.cloudflareaccess')) return false;
    return true;
  };

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch new version in background to update cache (stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (isSafeToCache(networkResponse)) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => { /* ignore offline fetch failure */ });
        
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Only cache if the response is safe and valid
        if (isSafeToCache(networkResponse)) {
          const clonedResponse = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clonedResponse));
        }
        return networkResponse;
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'LLM Mobile', body: event.data.text() };
    }
  }

  const options = {
    body: data.body || 'Background task finished.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/#/generate'
    },
    tag: 'task-notification'
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'LLM Mobile', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/#/generate';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('navigate' in client) {
          client.focus();
          // Convert route to absolute URL
          const absoluteUrl = new URL(targetUrl, self.location.origin).toString();
          return client.navigate(absoluteUrl);
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});


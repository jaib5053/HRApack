/**
 * HRAPack Service Worker
 * Provides offline resilience for 100% client-side privacy-first tax compliance kit.
 * Uses Network-First for HTML/JS/CSS to ensure users always receive latest tax compliance rules,
 * and Cache-First for static vendor assets and media.
 */

const CACHE_NAME = 'hrapack-v2.2.1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/form-12bb.html',
  '/landlord-declaration.html',
  '/revenue-stamp-rules.html',
  '/manifest.json',
  '/css/styles.css',
  '/js/utils.js',
  '/js/pdf-engine.js',
  '/js/app.js',
  '/assets/favicon.svg',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/og-image.png',
  '/vendor/lucide.min.js',
  '/vendor/pdf-lib.min.js',
  '/vendor/jszip.min.js',
  '/vendor/FileSaver.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Pre-cache partial failure:', err);
      });
    })
  );
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
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Determine if this is an app code asset (HTML, JS, CSS) that requires Network-First
  const isNavigation = event.request.mode === 'navigate';
  const isAppCode = isSameOrigin && (
    isNavigation ||
    url.pathname.endsWith('.html') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/css/') ||
    url.pathname === '/'
  );

  if (isAppCode) {
    // ── Network-First Strategy ──
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed — fallback to cache
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (isNavigation) {
              return caches.match('/index.html');
            }
          });
        })
    );
    return;
  }

  // ── Cache-First Strategy for vendor libraries & static assets ──
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});

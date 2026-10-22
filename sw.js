'use strict';
// Nur der Ordner /inventur/ wird kontrolliert, keine anderen HolzOptiX-Module.
const CACHE = 'holzoptix-inventur-v1-4-20261022';
// Die App selbst ist in index.html enthalten. Keine gemischten JS-Versionen mehr.
const ASSETS = ['./','./index.html',
  './manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('holzoptix-inventur-') && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if(event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if(response.ok) {const copy=response.clone();caches.open(CACHE).then(cache => cache.put('./index.html',copy));}
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached =>
    cached || fetch(event.request).then(response => {
      if(response.ok) {const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
      return response;
    })
  ));
});

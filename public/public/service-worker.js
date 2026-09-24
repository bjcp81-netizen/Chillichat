// Minimal service worker — its main job right now is making ChilliChat
// installable as a home-screen app. It doesn't cache anything for
// offline use yet; every request still goes to the network.
const CACHE_NAME = "chillichat-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
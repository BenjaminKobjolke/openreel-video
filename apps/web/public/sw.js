/**
 * OpenReel Service Worker
 *
 * Handles offline functionality by caching application assets.
 * Implements a cache-first strategy for static assets and network-first for API calls.
 *
 * Requirements: 35.1, 35.2, 35.4
 * - 35.1: Cache all application assets on first load for offline use
 * - 35.2: Function fully for all non-AI features when offline
 * - 35.4: Inform user that AI requires internet connectivity
 */

const CACHE_NAME = "openreel-v2";
const STATIC_CACHE_NAME = "openreel-static-v2";
const DYNAMIC_CACHE_NAME = "openreel-dynamic-v2";

/* global importScripts */
importScripts("messages-sw.js");

/**
 * Static assets to cache on install
 * These are the core application files needed for offline functionality
 */
const STATIC_ASSETS = ["/", "/index.html", "/manifest.json"];

/**
 * Patterns for assets that should be cached dynamically
 */
const CACHEABLE_PATTERNS = [
  /\.js$/,
  /\.css$/,
  /\.woff2?$/,
  /\.ttf$/,
  /\.eot$/,
  /\.svg$/,
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.gif$/,
  /\.webp$/,
  /\.ico$/,
];

/**
 * Patterns for requests that should never be cached (AI features, etc.)
 */
const NO_CACHE_PATTERNS = [
  /api\.anthropic\.com/,
  /api\.openai\.com/,
  /whisper/,
  /transcribe/,
  /\/api\//,
];

/**
 * Check if a URL should be cached
 */
function shouldCache(url) {
  const urlString = url.toString();

  // Never cache AI-related requests
  if (NO_CACHE_PATTERNS.some((pattern) => pattern.test(urlString))) {
    return false;
  }

  // Cache if matches cacheable patterns
  return CACHEABLE_PATTERNS.some((pattern) => pattern.test(urlString));
}

/**
 * Check if a request is for an AI feature
 */
function isAIRequest(url) {
  const urlString = url.toString();
  return NO_CACHE_PATTERNS.some((pattern) => pattern.test(urlString));
}

/**
 * Install event - cache static assets
 */
self.addEventListener("install", (event) => {
  console.log("[ServiceWorker] Installing...");

  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log("[ServiceWorker] Caching static assets");
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log("[ServiceWorker] Static assets cached");
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error("[ServiceWorker] Failed to cache static assets:", error);
      })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener("activate", (event) => {
  console.log("[ServiceWorker] Activating...");

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete old versions of our caches
              return (
                name.startsWith(`${CACHE_NAME.slice(0, CACHE_NAME.indexOf("-"))}-`) &&
                name !== STATIC_CACHE_NAME &&
                name !== DYNAMIC_CACHE_NAME
              );
            })
            .map((name) => {
              console.log("[ServiceWorker] Deleting old cache:", name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log("[ServiceWorker] Activated");
        // Take control of all clients immediately
        return self.clients.claim();
      })
  );
});

/**
 * Fetch event - serve from cache or network
 */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith("http")) {
    return;
  }

  // Sync server API (apps/sync-server) must always hit the network
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Handle AI requests - network only with offline message
  if (isAIRequest(url)) {
    event.respondWith(
      fetch(request).catch(() => {
        // Return a JSON response indicating AI is unavailable offline
        return new Response(
          JSON.stringify({
            error: "AI_OFFLINE",
            message:
              "AI features require an internet connection. Please connect to the internet to use this feature.",
          }),
          {
            status: 503,
            statusText: "Service Unavailable",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      })
    );
    return;
  }

  // For navigation requests (HTML pages), use network-first strategy
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the response for offline use
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fall back to cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Fall back to index.html for SPA routing
            return caches.match("/index.html");
          });
        })
    );
    return;
  }

  // For static assets, use cache-first strategy
  if (shouldCache(url)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached response and update cache in background
          event.waitUntil(
            fetch(request)
              .then((networkResponse) => {
                if (networkResponse.ok) {
                  caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                    cache.put(request, networkResponse);
                  });
                }
              })
              .catch(() => {
                // Network failed, but we have cache - that's fine
              })
          );
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // For other requests, use network-first strategy
  event.respondWith(
    fetch(request)
      .then((response) => {
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

console.log("[ServiceWorker] Script loaded");



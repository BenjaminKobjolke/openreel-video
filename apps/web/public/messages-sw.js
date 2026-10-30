/* global CACHE_NAME */
// Main-thread message handling from sw.js, loaded via importScripts.
// The filename ends in sw.js so the sync server serves it without cache.

/**
 * Message event - handle messages from the main thread
 */
self.addEventListener("message", (event) => {
  const { type } = event.data || {};

  switch (type) {
    case "SKIP_WAITING":
      self.skipWaiting();
      break;

    case "GET_CACHE_STATUS":
      getCacheStatus().then((status) => {
        event.ports[0].postMessage({ type: "CACHE_STATUS", payload: status });
      });
      break;

    case "CLEAR_CACHE":
      clearAllCaches().then(() => {
        event.ports[0].postMessage({ type: "CACHE_CLEARED" });
      });
      break;

    case "CHECK_ONLINE":
      event.ports[0].postMessage({
        type: "ONLINE_STATUS",
        payload: { online: navigator.onLine },
      });
      break;
  }
});

/**
 * Get cache status information
 */
async function getCacheStatus() {
  const cacheNames = await caches.keys();
  let totalEntries = 0;

  for (const name of cacheNames) {
    if (name.startsWith("openreel-")) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      totalEntries += keys.length;
    }
  }

  return {
    cacheNames: cacheNames.filter((n) => n.startsWith("openreel-")),
    totalEntries,
    version: CACHE_NAME,
  };
}

/**
 * Clear all OpenReel caches
 */
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith("openreel-"))
      .map((name) => caches.delete(name))
  );
}


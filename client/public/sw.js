/* Binly service worker — push + click handling. Quietly heroic. */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Binly",
    body: "Bins. Tomorrow. You know the drill.",
    url: "/",
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch (e) {
    try {
      payload.body = event.data ? event.data.text() : payload.body;
    } catch {}
  }

  const options = {
    body: payload.body,
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/badge-72.png",
    tag: payload.tag || "binly",
    data: { url: payload.url || "/" },
    vibrate: [120, 60, 120],
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(targetUrl).catch(() => {});
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

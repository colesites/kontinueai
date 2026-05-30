// Kontinue AI push service worker.
// Receives Web Push messages and renders a notification; clicking it focuses
// an existing tab (or opens one) at the payload URL.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Kontinue AI", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Kontinue AI";
  const options = {
    body: data.body || "",
    icon: "/kontinueai-3d.png",
    badge: "/kontinueai-3d.png",
    data: { url: data.url || "/" },
    tag: data.tag,
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
            client.focus();
            if ("navigate" in client) client.navigate(targetUrl);
            return;
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      }),
  );
});

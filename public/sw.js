// Minimal service worker: its only job is to receive a push event and show a notification.
// Registered from src/lib/push.ts. No caching/offline logic — this app doesn't need it.

self.addEventListener("push", (event) => {
  let payload = { title: "Benefit Cliff Navigator", body: "You have a new notification." };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    // Non-JSON payload — fall back to the default text above.
  }

  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/dashboard") && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/dashboard");
    }),
  );
});

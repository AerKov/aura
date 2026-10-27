// Aura service worker: shows Web Push notifications from the desktop server (ADR 0009).
self.addEventListener("push", (event) => {
  let data = { title: "Aura", body: "", tag: "aura", chatId: "" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // Keep the defaults.
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // An open, visible app already shows the event.
      if (clients.some((c) => c.visibilityState === "visible")) return;
      return self.registration.showNotification(data.title, {
        body: data.body,
        tag: data.tag,
        data,
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => c.url.includes(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(self.registration.scope);
    }),
  );
});

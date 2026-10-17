// Garde l'écran de l'appli disponible hors connexion. Les prix et le Sheet ne sont jamais mis en cache.
const CACHE = "cdp-v6";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // API et prix : toujours en direct
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./")))
  );
});

// ---------- Notifications : le script envoie un « réveil » sans contenu, l'appli va lire l'onglet Notifs ----------
function idbGet(k){
  return new Promise(res => {
    const r = indexedDB.open("cdp-owner", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onerror = () => res(null);
    r.onsuccess = () => { try{ const g = r.result.transaction("kv").objectStore("kv").get(k); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); }catch(_){ res(null); } };
  });
}
async function showLatest(){
  let title = "Crypto de poche", body = "Nouvelle alerte ou nouveau bilan", unread = 0, tag = "cdp";
  try{
    const key = await idbGet("apiKey"), api = await idbGet("api");
    if (key && api){
      const r = await fetch(api + "?" + new URLSearchParams({k: key, a: "notifs"}), {cache: "no-store"});
      const j = await r.json();
      if (j.ok){
        unread = j.data.unread || 0;
        const n = (j.data.items || []).find(x => !x.read && !/^ras$/i.test(x.lvl));
        if (n){ title = n.title || title; body = [n.lvl, n.src].filter(Boolean).join(" · ") + (unread > 1 ? ` · ${unread} non lus` : ""); tag = "cdp-" + n.row; }
      }
    }
  }catch(_){}
  try{ if (self.navigator.setAppBadge) unread ? self.navigator.setAppBadge(unread) : self.navigator.setAppBadge(); }catch(_){}
  return self.registration.showNotification(title, {body, tag, icon: "icon-192.png", badge: "icon-192.png", data: {url: "./#notifs"}});
}
self.addEventListener("push", e => e.waitUntil(showLatest()));
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(cs => {
    for (const c of cs){ if (c.url.indexOf("/a/") < 0 && "focus" in c){ c.postMessage({open: "notifs"}); return c.focus(); } }
    return self.clients.openWindow("./#notifs");
  }));
});

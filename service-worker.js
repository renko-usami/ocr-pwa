// ===== OCR PWA Service Worker =====
const CACHE = "ocr-pwa-v3";
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
];

// ---------- 설치: 앱 셸 캐싱 ----------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ---------- 활성화: 오래된 캐시 정리 ----------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ---------- IndexedDB (공유 파일 저장) ----------
const SHARED_DB = "ocr-pwa";
const SHARED_STORE = "shared-files";
const SHARED_KEY = "latest";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARED_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SHARED_STORE)) {
        db.createObjectStore(SHARED_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putSharedFile(blob, name) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARED_STORE, "readwrite");
    tx.objectStore(SHARED_STORE).put({ blob, name, ts: Date.now() }, SHARED_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- 공유 타겟(POST) 처리 ----------
async function handleShareTarget(event) {
  const formData = await event.request.formData();
  const file = formData.get("image");
  if (file && file.size > 0) {
    await putSharedFile(file, file.name || "shared.png");
  }
  // 클라이언트에게 알림
  const allClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of allClients) {
    client.postMessage({ type: "shared-file" });
  }
  // index.html로 리다이렉트
  return Response.redirect("/index.html", 303);
}

// ---------- fetch 처리 ----------
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Web Share Target: POST multipart/form-data
  if (req.method === "POST" && new URL(req.url).pathname.endsWith("index.html")) {
    event.respondWith(handleShareTarget(event));
    return;
  }

  // HTML은 네트워크 우선 (캐시된 구버전 방지)
  if (req.method === "GET" && req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("/index.html")))
    );
    return;
  }

  // 동일 출처 GET 요청: 캐시 우선, 네트워크 폴백
  if (req.method === "GET" && new URL(req.url).origin === location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
  // 그 외(OpenRouter API 등)는 기본 네트워크 동작
});
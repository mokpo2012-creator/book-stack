// 인터넷 없이도 앱이 열리게 하는 서비스 워커.
// 앱 파일은 네트워크를 먼저 시도해 수정 사항이 바로 반영되고, 표지는 한 번 본 것을 저장해 둔다.
// API 요청과 동기화(POST)는 건드리지 않는다.
const APP_CACHE = 'app-v1';
const COVER_CACHE = 'covers-v1';
const APP_FILES = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const NETWORK_WAIT = 3000; // 인터넷이 느리면 이만큼만 기다리고 저장본을 보여 준다
const COVER_MAX = 500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== APP_CACHE && k !== COVER_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function appFile(req, key) {
  const cache = await caches.open(APP_CACHE);
  const net = fetch(req).then(res => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  });
  const saved = await cache.match(key, { ignoreSearch: true });
  if (!saved) return net;
  net.catch(() => {});
  const late = new Promise(ok => setTimeout(() => ok(saved), NETWORK_WAIT));
  return Promise.race([net.catch(() => saved), late]);
}

async function cover(req) {
  const cache = await caches.open(COVER_CACHE);
  const saved = await cache.match(req);
  if (saved) return saved;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    await cache.put(req, res.clone());
    const keys = await cache.keys();
    if (keys.length > COVER_MAX) await cache.delete(keys[0]);
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') e.respondWith(appFile(req, './'));
    else if (url.pathname.endsWith('.webmanifest') || url.pathname.includes('/icons/')) e.respondWith(appFile(req, req));
    return;
  }
  // 책등 색 계산용 변환 이미지(wsrv.nl)는 표지 저장 대상이 아니다
  if (req.destination === 'image' && url.hostname !== 'wsrv.nl') e.respondWith(cover(req));
});

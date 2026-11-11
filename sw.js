/* ================================================================
   奶酪信笺 · Service Worker（离线缓存）
   策略：
   - 页面导航（含站点根路径 "/"）：network-first + no-store，保证每次都拿最新
   - version.json：只走网络，用来触发前端更新
   - 图片 / 图标 / 静态脚本：cache-first
   升级时改 CACHE 版本号即可清掉旧缓存
   ================================================================ */
const CACHE = 'CHEESE_V6';
/* 与页面 version.json 保持一致；激活时用它把旧页面强制带到新地址 */
const VERSION = '2026.11.11-shop1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon.svg',
  './favicon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(
        PRECACHE.map((u) => fetch(u, {cache:'no-store'}).then((r) => (r && r.ok) ? c.put(u, r) : null).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
    .then(() => self.clients.matchAll({type:'window'}))
    .then((list) => {
      /* 旧页面自己不会刷新：直接把窗口导航到带新版本号的地址 */
      list.forEach((c) => {
        try {
          const u = new URL(c.url);
          if (u.searchParams.get('v') !== VERSION) {
            u.searchParams.set('v', VERSION);
            c.navigate(u.toString());
          }
        } catch (err) {}
      });
    })
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isPageRequest(req, url){
  if (req.mode === 'navigate') return true;
  if (url.pathname.endsWith('.html')) return true;
  /* 站点根目录：GitHub Pages 的 /cheese-chat/ */
  if (url.pathname.endsWith('/')) return true;
  return false;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* 版本文件：永远走网络 */
  if (url.pathname.endsWith('/version.json')) {
    e.respondWith(fetch(req, {cache:'no-store'}).catch(() => new Response('{"v":""}', {headers:{'Content-Type':'application/json'}})));
    return;
  }

  /* 页面本身：网络优先，且绕过 HTTP 缓存，离线时才回退 */
  if (isPageRequest(req, url)) {
    e.respondWith(
      fetch(req, {cache:'no-store'})
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  /* 其他资源：cache-first */
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});

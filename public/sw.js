// 온음 PC용: 한 번 열면 인터넷 없이도 켜지게 앱 파일을 저장해 둔다. 음악 파일은 건드리지 않는다.
const CACHE = 'onum-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  e.respondWith(
    // 새 버전이 있으면 받아 오고, 인터넷이 없으면 저장해 둔 것을 쓴다
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
      return res
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./')))
  )
})

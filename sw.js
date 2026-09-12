// ============================================================
// 서비스 워커 — 전체 오프라인 동작 (PRD 8)
// 앱 파일을 갈아끼울 때는 CACHE 버전 문자열만 올리면 된다.
// ============================================================
const CACHE = 'hangul-trace-v2';

const CORE = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './src/main.js',
  './src/jamo.js',
  './src/geometry.js',
  './src/store.js',
  './src/audio.js',
  './src/lines.js',
  './src/voicebank.js',
  './src/stickers.js',
  './src/trace.js',
  './src/session.js',
  './src/screens/reward.js',
  './src/screens/stickerbook.js',
  './src/screens/parent.js',
  './src/screens/letterpick.js',
  './src/screens/recorder.js',
  './assets/stickers/stickers.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(CORE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// stale-while-revalidate:
//  캐시에 있으면 즉시 내주고(오프라인·즉시 실행), 뒤에서 새 파일을 받아 캐시를 갱신한다.
//  → 코드를 고쳐 넣으면 다음 실행 때 반영된다. (cache-first만 쓰면 영원히 옛 버전이 뜬다)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          // 스티커 이미지·음성처럼 나중에 넣은 에셋도 자동으로 캐시에 담는다
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit || caches.match('./index.html'));
      return hit || network;
    })
  );
});

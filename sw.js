// ============================================================
// 서비스 워커 — 전체 오프라인 동작 (PRD 8)
// 앱 파일을 갈아끼울 때는 CACHE 버전 문자열만 올리면 된다.
// ============================================================
const CACHE = 'hangul-trace-v6';

const CORE = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './src/main.js',
  './src/jamo.js',
  './src/compose.js',
  './src/curriculum.js',
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

// 화면을 이루는 파일(html·js·css·json)과 소리·그림을 다르게 다룬다.
//
//   화면 파일 : 인터넷이 되면 늘 새것을 받는다 → 고친 것이 바로 보인다.
//              인터넷이 없으면 저장해 둔 것으로 돈다.
//   소리·그림 : 저장해 둔 것을 먼저 쓴다 → 용량이 크고 잘 바뀌지 않는다.
//
// 전에는 둘 다 «저장해 둔 것 먼저» 라서, 고친 내용이 다음 실행에야 보였다.
const SHELL = /\.(?:html|js|css|json|webmanifest|svg)$/i;

function keep(req, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || SHELL.test(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then((res) => keep(req, res))
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => keep(req, res)))
  );
});

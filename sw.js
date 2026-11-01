/* Service worker：第一次載入後把全部檔案存起來，之後可離線使用。更新網站時請改 VERSION。 */
const VERSION = 'jpstudy-v2';
const FILES = ["./", "app.js", "data/audiomap.js", "data/core.js", "data/grammar-1.js", "data/grammar-2.js", "data/grammar-3.js", "data/kana.js", "data/lessons-1.js", "data/lessons-2.js", "data/lessons-3.js", "data/lessons-4.js", "data/listening.js", "data/mocks.js", "data/readings.js", "data/vocab-1.js", "data/vocab-2.js", "data/vocab-3.js", "data/vocab-4.js", "data/vocab-5.js", "data/vocab-6.js", "icons/icon-192.png", "icons/icon-512.png", "index.html", "js/audio.js", "js/counters.js", "js/dataindex.js", "js/jp.js", "js/progress.js", "js/quizgen.js", "js/storage.js", "js/sync.js", "js/view-audio.js", "js/view-learn.js", "js/view-quiz.js", "js/view-records.js", "js/view-vocab.js", "manifest.webmanifest", "styles.css"];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return; // GitHub API（雲端同步）等外部請求不經過快取
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});

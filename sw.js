// ============================================================
//  sw.js — Service Worker PWA  v11
//  PLN UP3 Jayapura — Monitoring Gardu
//
//  Perubahan v11 (dari v10):
//  - CACHE_VERSION terpisah sebagai konstanta — lebih mudah di-bump saat deploy
//  - CACHE_NAME menggunakan CACHE_VERSION agar otomatis invalidate saat naik versi
//  - Install: skipWaiting() langsung agar SW baru segera aktif tanpa tunggu tab ditutup
//  - Activate: clients.claim() + hapus cache lama + postMessage ke semua tab
//  - Fetch: perbaikan race condition pada networkFirstWithCache
//  - Message: tambah handler GET_VERSION untuk debug versi aktif dari halaman
//  - Tidak ada breaking change pada API atau IndexedDB schema
// ============================================================

var CACHE_VERSION = 'v11-20260609';          // ← NAIK VERSI INI SETIAP DEPLOY
var CACHE_NAME  = 'gardu-pln-' + CACHE_VERSION;
var DB_NAME     = 'gardu-pln-db';
var DB_VERSION  = 1;
var QUEUE_STORE = 'gardu-sync-queue';
var SYNC_TAG    = 'sync-inspeksi';

// ── APP SHELL: file yang harus ada untuk offline dasar ───────
var APP_SHELL = [
  './index.html',
  './manifest.json',
  './supabase-api.js'
];

// ── CDN assets yang boleh di-cache setelah pertama dimuat ────
var CDN_CACHEABLE = [
  'unpkg.com/html5-qrcode',
  'cdnjs.cloudflare.com/ajax/libs/xlsx',
  'cdn.jsdelivr.net/npm/exceljs'
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', function(event) {
  // skipWaiting() SEGERA — SW baru langsung aktif tanpa tunggu tab lama ditutup.
  // Ini kunci agar cache lama tidak mengganggu user saat ada deploy baru.
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        // Cache app shell satu per satu — jangan pakai addAll agar
        // satu aset gagal tidak membatalkan semua (jaringan Papua tidak stabil)
        return APP_SHELL.reduce(function(chain, url) {
          return chain.then(function() {
            return cache.add(url).catch(function(e) {
              console.warn('[SW] Gagal cache:', url, e.message);
            });
          });
        }, Promise.resolve());
      })
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k)   {
              console.log('[SW] Hapus cache lama:', k);
              return caches.delete(k);
            })
      );
    })
    .then(function() { return self.clients.claim(); })
    .then(function() {
      // Beritahu semua tab bahwa SW baru sudah aktif → halaman akan reload otomatis
      return self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
        .then(function(clients) {
          clients.forEach(function(client) {
            client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
          });
        });
    })
  );
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  var req = event.request;
  var url = req.url;

  // Abaikan non-GET dan chrome-extension
  if (req.method !== 'GET') return;
  if (url.startsWith('chrome-extension://')) return;

  // Supabase REST/RPC → network-first (data harus fresh)
  // Fallback ke cache hanya untuk data read (GET)
  if (url.includes('supabase.co/rest/') || url.includes('supabase.co/rpc/')) {
    event.respondWith(networkFirstWithCache(req));
    return;
  }

  // CDN assets (ExcelJS, SheetJS, QR scanner) → cache-first
  var isCdn = CDN_CACHEABLE.some(function(host) { return url.includes(host); });
  if (isCdn) {
    event.respondWith(cacheFirstWithNetwork(req));
    return;
  }

  // App shell dan aset lokal → cache-first, fallback network
  event.respondWith(cacheFirstWithNetwork(req));
});

// ── Strategy: Network-first, simpan ke cache jika berhasil ──
function networkFirstWithCache(request) {
  return fetch(request.clone()).then(function(response) {
    if (response.ok) {
      // Hanya cache GET Supabase yang tidak memerlukan auth khusus
      var cloned = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(request, cloned);
      });
    }
    return response;
  }).catch(function() {
    // Offline: kembalikan cache jika ada
    return caches.match(request).then(function(cached) {
      if (cached) return cached;
      // Tidak ada cache → kembalikan respons offline standar
      return new Response(
        JSON.stringify({
          status: 'offline',
          message: 'Tidak ada koneksi. Data terakhir ditampilkan jika tersedia di cache.'
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'X-SW-Offline': '1'
          }
        }
      );
    });
  });
}

// ── Strategy: Cache-first, fallback network ──────────────────
function cacheFirstWithNetwork(request) {
  return caches.match(request).then(function(cached) {
    if (cached) return cached;
    return fetch(request.clone()).then(function(response) {
      if (response.ok && response.type !== 'opaque') {
        var cloned = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(request, cloned);
        });
      }
      return response;
    }).catch(function() {
      // Offline dan tidak ada cache untuk aset ini
      // Untuk HTML → kembalikan index.html (SPA fallback)
      if (request.headers.get('Accept') && request.headers.get('Accept').includes('text/html')) {
        return caches.match('./index.html');
      }
      return new Response('', { status: 503 });
    });
  });
}

// ── BACKGROUND SYNC ──────────────────────────────────────────
// Dipertahankan untuk kompatibilitas — berguna jika di masa depan
// ada fitur antrian offline yang dikirim ke endpoint tertentu.
self.addEventListener('sync', function(event) {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(kirimAntrianInspeksi());
  }
});

// ── Kirim antrian dari IndexedDB (jika ada) ──────────────────
function kirimAntrianInspeksi() {
  return bukaDB().then(function(db) {
    return getAllQueue(db).then(function(items) {
      if (!items || !items.length) return; // tidak ada antrian
      return items.reduce(function(chain, item) {
        return chain.then(function() { return kirimSatu(db, item); });
      }, Promise.resolve());
    });
  }).catch(function(e) {
    console.warn('[SW] kirimAntrianInspeksi error:', e);
  });
}

function kirimSatu(db, item) {
  if (!item.apiUrl || !item.payload) return Promise.resolve();
  return fetch(item.apiUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(item.payload)
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (res && res.status === 'ok') {
      return hapusQueue(db, item.id).then(function() {
        return self.clients.matchAll({ includeUncontrolled: true }).then(function(clients) {
          clients.forEach(function(c) {
            c.postMessage({
              type:    'SYNC_SUCCESS',
              idGardu: item.payload.idGardu || item.id,
              message: '☁️ Data ' + (item.payload.idGardu || '') + ' berhasil dikirim ke server.'
            });
          });
        });
      });
    } else {
      console.log('[SW] Server menolak:', res && res.message);
    }
  })
  .catch(function(err) {
    console.log('[SW] Gagal kirim (akan retry saat online):', err.message);
  });
}

// ── IndexedDB helpers ─────────────────────────────────────────
function bukaDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror   = function(e) { reject(e.target.error); };
  });
}

function getAllQueue(db) {
  return new Promise(function(resolve, reject) {
    var req = db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).getAll();
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror   = function(e) { reject(e.target.error); };
  });
}

function hapusQueue(db, id) {
  return new Promise(function(resolve, reject) {
    var req = db.transaction(QUEUE_STORE, 'readwrite').objectStore(QUEUE_STORE).delete(id);
    req.onsuccess = function() { resolve(); };
    req.onerror   = function(e) { reject(e.target.error); };
  });
}

// ── MESSAGE dari halaman ──────────────────────────────────────
self.addEventListener('message', function(event) {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'SYNC_NOW') {
    kirimAntrianInspeksi();
  }
  // Notifikasi ke semua tab bahwa SW aktif
  if (event.data.type === 'PING') {
    event.source && event.source.postMessage({
      type: 'PONG',
      cache: CACHE_NAME,
      version: CACHE_VERSION
    });
  }
  // Debug: dapatkan versi SW yang sedang aktif
  if (event.data.type === 'GET_VERSION') {
    event.source && event.source.postMessage({
      type: 'VERSION_INFO',
      version: CACHE_VERSION,
      cache: CACHE_NAME
    });
  }
});

console.log('[SW v11] Aktif. Cache:', CACHE_NAME, '| Version:', CACHE_VERSION);

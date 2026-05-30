// ============================================================
//  PLN UP3 JAYAPURA — Supabase API Layer  v8
//  File: supabase-api.js
//  Semua action memanggil RPC (fn_*) atau REST view
// ============================================================

// ── KONFIGURASI ──────────────────────────────────────────────
var SUPABASE_URL  = 'https://ckarfhmaydqhcclvueqn.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrYXJmaG1heWRxaGNjbHZ1ZXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMzkwNTgsImV4cCI6MjA5NDkxNTA1OH0.js9CKdBZ-8omTQpwaTfnuvTGStuB1tajjRbdCrP5L6o';

// ── ULP Enum normalizer ──────────────────────────────────────
function _normalizeUlpEnum(ulp) {
  if (!ulp) return null;
  var s = String(ulp).trim().toUpperCase();
  if (!s) return null;
  if (s.startsWith('ULP ')) return s;
  return 'ULP ' + s;
}

// ── SHA-256 helper ───────────────────────────────────────────
async function sha256(str) {
  var buf = await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(String(str)));
  return Array.from(new Uint8Array(buf))
    .map(function(b) { return ('0' + b.toString(16)).slice(-2); }).join('');
}

// ── Supabase REST helper ─────────────────────────────────────
function sbFetch(path, opts) {
  opts = opts || {};
  var headers = Object.assign({
    'apikey':        SUPABASE_ANON,
    'Authorization': 'Bearer ' + SUPABASE_ANON,
    'Content-Type':  'application/json',
    'Prefer':        opts.prefer || ''
  }, opts.headers || {});
  return fetch(SUPABASE_URL + path, {
    method:  opts.method  || 'GET',
    headers: headers,
    body:    opts.body    || undefined,
    signal:  opts.signal  || undefined
  });
}

// ── RPC helper ───────────────────────────────────────────────
function sbRpc(funcName, params, signal) {
  return sbFetch('/rest/v1/rpc/' + funcName, {
    method: 'POST',
    body:   JSON.stringify(params || {}),
    signal: signal
  });
}

// ── RPC wrapper: panggil dan parse JSON langsung ─────────────
async function rpcCall(funcName, params, signal) {
  var res = await sbRpc(funcName, params, signal);
  if (!res.ok) {
    var errTxt = await res.text().catch(function() { return res.status; });
    return { status: 'error', message: 'Server error ' + res.status + ': ' + errTxt };
  }
  var data = await res.json();
  if (!data) return { status: 'error', message: 'Response kosong dari server.' };
  // Supabase RPC kadang mengembalikan array [result] — unwrap otomatis
  if (Array.isArray(data)) {
    if (data.length === 0) return { status: 'error', message: 'Response kosong dari server.' };
    data = data[0];
  }
  return data;
}

// ── apiCall wrapper ──────────────────────────────────────────
var _HEAVY_ACTIONS = {
  getGarduKritis: 1, getExportRekap: 1, getRekap: 1, getDaftarGardu: 1
};
var _TIMEOUT_MS = { getDaftarGardu: 120000, getGarduKritis: 90000, getExportRekap: 90000, getRekap: 60000 };

function apiCall(action, params, cb) {
  var controller = new AbortController();
  var done = false;
  var timeoutMs = _TIMEOUT_MS[action] || (_HEAVY_ACTIONS[action] ? 60000 : 30000);
  var timer = setTimeout(function() {
    if (done) return;
    done = true;
    controller.abort();
    cb({ status: 'error', message: 'Koneksi timeout. Periksa jaringan lalu coba lagi.' });
  }, timeoutMs);

  function finish(result) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    cb(result);
  }

  _dispatch(action, params, controller.signal)
    .then(finish)
    .catch(function(err) {
      if (done) return;
      finish({
        status: 'error',
        message: err.name === 'AbortError'
          ? 'Koneksi timeout. Periksa jaringan lalu coba lagi.'
          : 'Gagal menghubungi server. (' + err.message + ')'
      });
    });
}

// ── Router ───────────────────────────────────────────────────
async function _dispatch(action, p, signal) {
  switch (action) {
    case 'loginUser':        return _login(p, signal);
    case 'verifyToken':      return _verifyToken(p, signal);
    case 'getDaftarGardu':   return _getDaftarGardu(p, signal);
    case 'getDetailLengkap': return _getDetailLengkap(p, signal);
    case 'getDetailGardu':   return _getDetailGardu(p, signal);
    case 'getTrenBeban':     return _getTrenBeban(p, signal);
    case 'getRekap':         return _getRekap(p, signal);
    case 'getGarduKritis':   return _getGarduKritis(p, signal);
    case 'getExportRekap':   return _getExportRekap(p, signal);
    case 'verifyPin':        return _verifyPin(p, signal);
    case 'setPin':           return _setPin(p, signal);
    case 'tambahGardu':      return _tambahGardu(p, signal);
    case 'editGardu':        return _editGardu(p, signal);
    case 'getDaftarUser':    return _getDaftarUser(p, signal);
    case 'hapusUser':        return _hapusUser(p, signal);
    case 'cariGardu':        return _cariGardu(p, signal);
    case 'logoutUser':       return _logoutUser(p, signal);
    case 'getRiwayat':       return _getRiwayat(p, signal);
    case 'getRekapGardu':    return _getRekapGardu(p, signal);
    case 'tambahUser':       return _tambahUser(p, signal);
    case 'editUser':         return _editUser(p, signal);
    case 'gantiPassword':    return _gantiPassword(p, signal);
    case 'verifyULPPin':     return _verifyULPPin(p, signal);
    case 'toggleStatus':     return _toggleStatus(p, signal);
    case 'tambahInspeksi':   return _tambahInspeksi(p, signal);
    case 'hapusInspeksi':    return _hapusInspeksi(p, signal);
    case 'getInspeksi':      return _getInspeksi(p, signal);
    case 'editInspeksi':     return _editInspeksi(p, signal);
    case 'resetPassword':    return _resetPasswordByAdmin(p, signal);
    case 'resetPin':         return _resetPinByAdmin(p, signal);
    case 'aktifkanUser':     return _aktifkanUser(p, signal);
    case 'statistikUlp':     return _statistikUlp(p, signal);
    case 'maintenanceCleanup': return _maintenanceCleanup(p, signal);
    case 'tambahPemeliharaan':    return _tambahPemeliharaan(p, signal);
    case 'getDaftarPemeliharaan': return _getDaftarPemeliharaan(p, signal);
    case 'hapusPemeliharaan':     return _hapusPemeliharaan(p, signal);
    case 'editPemeliharaan':      return _editPemeliharaan(p, signal);
    default: return { status: 'error', message: 'Action tidak dikenali: ' + action };
  }
}

// ── HELPER: verify token via RPC ─────────────────────────────
async function _getUserFromToken(token) {
  if (!token) return null;
  try {
    var data = await rpcCall('fn_verify_token', { p_token: token });
    if (!data || data.status !== 'ok') return null;
    return data;
  } catch (e) {
    console.error('[sbApi] _getUserFromToken error:', e);
    return null;
  }
}

// ── LOGIN ────────────────────────────────────────────────────
async function _login(p, signal) {
  var pwHash = await sha256(String(p.password || '').trim());
  var data = await rpcCall('fn_login', {
    p_username:      String(p.username || '').trim().toLowerCase(),
    p_password_hash: pwHash
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: data.message || 'Login gagal.' };

  // fn_login bisa return flat (username,nama,role,ulp) atau nested di data.user
  var u = (data.user && typeof data.user === 'object') ? data.user : data;
  return {
    status: 'ok',
    token:  data.token,
    user: {
      username: u.username || '',
      nama:     u.nama     || u.username || '',
      role:     u.role     || '',
      ulp:      u.ulp      || ''
    }
  };
}

// ── VERIFY TOKEN ─────────────────────────────────────────────
async function _verifyToken(p, signal) {
  var data = await rpcCall('fn_verify_token', { p_token: p.token }, signal);
  if (!data || data.status !== 'ok')
    return { status: 'error', message: 'Sesi tidak valid.' };
  return {
    status: 'ok',
    user: {
      username: data.username,
      nama:     data.nama,
      role:     data.role,
      ulp:      data.ulp || ''
    }
  };
}

// ── DAFTAR GARDU — pagination loop melewati limit 1000 Supabase ──────────────
async function _getDaftarGardu(p, signal) {
  var PAGE_SIZE = 500;
  var baseUrl = '/rest/v1/v_gardu_lengkap?select=*&order=no_gardu.asc';
  if (p && p.ulp) baseUrl += '&ulp=eq.' + encodeURIComponent(_normalizeUlpEnum(p.ulp));

  var allRows = [];
  var offset  = 0;
  var hasMore = true;

  while (hasMore) {
    var rangeStart = offset;
    var rangeEnd   = offset + PAGE_SIZE - 1;
    var res = await sbFetch(baseUrl, {
      signal: signal,
      headers: {
        'Range-Unit': 'items',
        'Range':      rangeStart + '-' + rangeEnd,
        'Prefer':     'count=none'
      }
    });

    if (!res.ok) {
      var errTxt = await res.text().catch(function() { return res.status; });
      return { status: 'error', message: 'Gagal memuat daftar gardu (' + res.status + '): ' + errTxt };
    }

    var rows = await res.json();
    if (!rows || !rows.length) break;

    allRows = allRows.concat(rows);
    offset += PAGE_SIZE;

    // Jika hasil < PAGE_SIZE berarti sudah halaman terakhir
    hasMore = rows.length === PAGE_SIZE;
  }

  // Deduplikasi berdasarkan no_gardu untuk hindari ghost row
  var seen = {};
  var uniqueRows = allRows.filter(function(g) {
    var key = (g.no_gardu || '').trim().toUpperCase();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });

  var data = uniqueRows.map(function(g) {
    return {
      'NO_GARDU':           g.no_gardu || '',
      'ULP':                g.ulp      || '',
      'UNITUP':             g.unitup   || '',
      'PENYULANG':          g.penyulang || '',
      'ALAMAT':             g.alamat   || '',
      'KAPASITAS_KVA':      g.kapasitas_kva != null ? String(g.kapasitas_kva) : '',
      'TIPE':               g.tipe     || '',
      'STATUS_OPERASIONAL': g.status_operasional || '',
      'STATUS_KEPEMILIKAN': g.status_kepemilikan || '',
      'MEREK_TRAFO':        g.merek_trafo || '',
      '_lastInspeksi':      g.last_inspeksi_tgl || '',
      '_lastPetugas':       g.last_inspeksi_petugas || '',
      '_lastBeban':         g.last_prosen != null ? String(g.last_prosen) : '',
      '_totalInspeksi':     g.total_inspeksi || 0,
      'LATITUDE':           g.latitude  || '',
      'LONGITUDE':          g.longitude || '',
      'KETERANGAN':         g.keterangan || ''
    };
  });

  return {
    status: 'ok',
    data: data,
    _generatedAt: new Date().toLocaleTimeString('id-ID')
  };
}

// ── DETAIL GARDU + RIWAYAT ───────────────────────────────────
async function _getDetailLengkap(p, signal) {
  var noGardu = (p.noGardu || '').trim().toUpperCase();

  // Gunakan v_gardu_lengkap (view publik) daripada tabel gardu langsung
  var resG = await sbFetch(
    '/rest/v1/v_gardu_lengkap?no_gardu=eq.' + encodeURIComponent(noGardu) + '&limit=1',
    { signal: signal }
  );
  if (!resG.ok) {
    var errTxt = await resG.text().catch(function() { return resG.status; });
    return { status: 'error', message: 'Gagal memuat data gardu (' + resG.status + ').' };
  }

  var garduArr = await resG.json();
  if (!garduArr || !garduArr.length)
    return { status: 'error', message: 'Gardu tidak ditemukan: ' + noGardu };

  var g = garduArr[0];

  // Gunakan RPC fn_get_riwayat_inspeksi
  var riwayatRows = [];
  try {
    var riwayatData = await rpcCall('fn_get_riwayat_inspeksi', {
      p_no_gardu: noGardu,
      p_limit: 5
    }, signal);
    if (riwayatData && riwayatData.status === 'ok') {
      riwayatRows = (riwayatData.data || []).map(function(r) { return _mapInspeksiRow(r); });
    } else {
      // Fallback: REST langsung ke tabel inspeksi
      var resI = await sbFetch(
        '/rest/v1/inspeksi?no_gardu=eq.' + encodeURIComponent(noGardu) +
        '&order=tgl_ukur.desc,jam_ukur.desc&limit=5',
        { signal: signal }
      );
      if (resI.ok) {
        var rawI = await resI.json();
        riwayatRows = (rawI || []).map(function(r) { return _mapInspeksiRow(r); });
      }
    }
  } catch (e) {
    console.warn('[sbApi] Gagal memuat riwayat inspeksi:', e);
  }

  // Map gardu dari v_gardu_lengkap
  var garduMapped = {
    'NO_GARDU':           g.no_gardu   || '',
    'ULP':                g.ulp        || '',
    'UNITUP':             g.unitup     || '',
    'PENYULANG':          g.penyulang  || '',
    'ALAMAT':             g.alamat     || '',
    'KAPASITAS_KVA':      g.kapasitas_kva != null ? String(g.kapasitas_kva) : '',
    'DAYA_KVA':           g.kapasitas_kva != null ? String(g.kapasitas_kva) : '',
    'TIPE':               g.tipe       || '',
    'MEREK_TRAFO':        g.merek_trafo || '',
    'STATUS_KEPEMILIKAN': g.status_kepemilikan || '',
    'STATUS_OPERASIONAL': g.status_operasional || '',
    'LATITUDE':           g.latitude   || '',
    'LONGITUDE':          g.longitude  || '',
    'KETERANGAN':         g.keterangan || ''
  };

  return {
    status:  'ok',
    data:    garduMapped,
    riwayat: riwayatRows
  };
}

// ── DETAIL GARDU SAJA ────────────────────────────────────────
async function _getDetailGardu(p, signal) {
  var noGardu = (p.noGardu || '').trim().toUpperCase();
  var res = await sbFetch(
    '/rest/v1/gardu?no_gardu=eq.' + encodeURIComponent(noGardu) + '&limit=1',
    { signal: signal }
  );
  if (!res.ok) return { status: 'error', message: 'Gagal memuat data gardu.' };

  var arr = await res.json();
  if (!arr || !arr.length)
    return { status: 'error', message: 'Gardu tidak ditemukan: ' + noGardu };

  return { status: 'ok', data: _mapGarduRow(arr[0]) };
}

// ── TREN BEBAN via RPC ───────────────────────────────────────
async function _getTrenBeban(p, signal) {
  var data = await rpcCall('fn_get_tren_beban', {
    p_no_gardu: (p.noGardu || '').trim().toUpperCase(),
    p_limit:    100
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: data.message || 'Gagal memuat tren beban.' };

  var rows = (data.data || []).map(function(r) {
    return { tgl: r.tgl_ukur, prosen: parseFloat(r.prosen) };
  });

  return { status: 'ok', data: rows };
}

// ── REKAP DASHBOARD via RPC ──────────────────────────────────
async function _getRekap(p, signal) {
  var ulpFilter = (p && p.ulp) ? _normalizeUlpEnum(p.ulp) : null;
  var data = await rpcCall('fn_get_rekap', { p_ulp: ulpFilter }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: data.message || 'Gagal memuat rekap.' };

  return data;
}

// ── GARDU KRITIS via RPC ─────────────────────────────────────
async function _getGarduKritis(p, signal) {
  var ulpFilter = (p && p.ulp) ? _normalizeUlpEnum(p.ulp) : null;
  var data = await rpcCall('fn_get_gardu_kritis', { p_ulp: ulpFilter }, signal);

  if (!data || data.status !== 'ok') {
    var errMsg = (data && data.message) ? data.message : 'Gagal memuat data gardu kritis.';
    return { status: 'error', message: errMsg };
  }

  return data;
}

// ── EXPORT REKAP via RPC ─────────────────────────────────────
async function _getExportRekap(p, signal) {
  var ulpFilter = (p && p.ulp) ? _normalizeUlpEnum(p.ulp) : null;
  var data = await rpcCall('fn_get_export_rekap', {
    p_ulp:   ulpFilter,
    p_bulan: p.bulan || null
  }, signal);

  if (!data || data.status !== 'ok') {
    var errMsg = (data && data.message) ? data.message : 'Gagal memuat data export.';
    return { status: 'error', message: errMsg };
  }

  return data;
}

// ── VERIFY PIN via RPC ───────────────────────────────────────
async function _verifyPin(p, signal) {
  var session = await _getUserFromToken(p.token);
  if (!session) return { status: 'error', message: 'Sesi tidak valid.' };

  var pinHash = await sha256(String(p.pin || '').trim());
  var data = await rpcCall('fn_verify_pin', {
    p_username: session.username,
    p_pin_hash: pinHash
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) ? data.message : 'PIN salah.' };

  return { status: 'ok', message: 'PIN benar.' };
}

// ── SET PIN via RPC ──────────────────────────────────────────
async function _setPin(p, signal) {
  var pwHash  = await sha256(String(p.password || '').trim());
  var pinHash = await sha256(String(p.pinBaru  || '').trim());

  var data = await rpcCall('fn_set_pin_user', {
    p_token:         p.token,
    p_password_hash: pwHash,
    p_pin_hash_baru: pinHash
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) ? data.message : 'Gagal menyimpan PIN.' };

  return { status: 'ok', message: data.message };
}

// ── TAMBAH GARDU via RPC ─────────────────────────────────────
async function _tambahGardu(p, signal) {
  var pinHash = await sha256(String(p.pin || '').trim());
  var ulpEnum = _normalizeUlpEnum(p.ulp);

  var data = await rpcCall('fn_tambah_gardu', {
    p_token:              p.token,
    p_pin_hash:           pinHash,
    p_no_gardu:           (p.noGardu || '').trim().toUpperCase(),
    p_ulp:                ulpEnum,
    p_unitup:             p.unitup     || null,
    p_penyulang:          p.penyulang  || null,
    p_alamat:             p.alamat     || null,
    p_kapasitas_kva:      p.daya       ? parseFloat(p.daya) : null,
    p_tipe:               p.tipe       ? String(p.tipe).toUpperCase() : null,
    p_status_kepemilikan: p.kepemilikan ? String(p.kepemilikan).toUpperCase() : null,
    p_status_operasional: p.statusOp   ? String(p.statusOp).toUpperCase() : 'AKTIF',
    p_merek_trafo:        p.merek      || null,
    p_latitude:           p.lat        ? String(p.lat) : null,
    p_longitude:          p.lng        ? String(p.lng) : null,
    p_keterangan:         p.keterangan || null
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) ? data.message : 'Gagal menambahkan gardu.' };

  return { status: 'ok', message: data.message };
}

// ── EDIT GARDU via RPC ───────────────────────────────────────
async function _editGardu(p, signal) {
  var pinHash = await sha256(String(p.pin || '').trim());
  var ulpEnum = p.ulp ? _normalizeUlpEnum(p.ulp) : null;
  var noGarduBaru = (p.noGarduBaru || '').trim().toUpperCase();

  var data = await rpcCall('fn_edit_gardu', {
    p_token:              p.token,
    p_pin_hash:           pinHash,
    p_no_gardu_lama:      (p.noGarduLama || '').trim().toUpperCase(),
    p_no_gardu_baru:      noGarduBaru || null,
    p_ulp:                ulpEnum,
    p_unitup:             p.unitup     || null,
    p_penyulang:          p.penyulang  || null,
    p_alamat:             p.alamat     || null,
    p_kapasitas_kva:      p.daya       ? parseFloat(p.daya) : null,
    p_tipe:               p.tipe       ? String(p.tipe).toUpperCase() : null,
    p_status_kepemilikan: p.kepemilikan ? String(p.kepemilikan).toUpperCase() : null,
    p_status_operasional: p.status     ? String(p.status).toUpperCase() : null,
    p_merek_trafo:        p.merek      || null,
    p_latitude:           p.lat        ? String(p.lat) : null,
    p_longitude:          p.lng        ? String(p.lng) : null,
    p_keterangan:         p.keterangan || null
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) ? data.message : 'Gagal menyimpan perubahan.' };

  return { status: 'ok', message: data.message };
}

// ── DAFTAR USER via RPC ──────────────────────────────────────
async function _getDaftarUser(p, signal) {
  var data = await rpcCall('fn_get_daftar_user', { p_token: p.token }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal memuat daftar user.' };

  return { status: 'ok', data: data.rows || [] };
}

// ── HAPUS USER via RPC ───────────────────────────────────────
async function _hapusUser(p, signal) {
  var data = await rpcCall('fn_hapus_user', {
    p_token:    p.token,
    p_username: p.username
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal menghapus user.' };

  return { status: 'ok', message: data.message };
}

// ── CARI GARDU via RPC ───────────────────────────────────────
async function _cariGardu(p, signal) {
  var data = await rpcCall('fn_search_gardu', {
    p_keyword: (p.keyword || '').trim(),
    p_ulp:     p.ulp ? _normalizeUlpEnum(p.ulp) : null,
    p_limit:   20
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: 'Gagal mencari gardu.' };

  var rows = (data.data || []).map(function(g) {
    return _mapGarduRow(g);
  });

  return { status: 'ok', data: rows };
}

// ── LOGOUT via RPC ───────────────────────────────────────────
async function _logoutUser(p, signal) {
  if (p && p.token) {
    await rpcCall('fn_logout', { p_token: p.token }, signal).catch(function() {});
  }
  return { status: 'ok', message: 'Logout berhasil.' };
}

// ── RIWAYAT INSPEKSI via RPC ─────────────────────────────────
async function _getRiwayat(p, signal) {
  var data = await rpcCall('fn_get_riwayat_inspeksi', {
    p_no_gardu:  p.noGardu  ? (p.noGardu || '').trim().toUpperCase() : null,
    p_ulp:       p.ulp      ? _normalizeUlpEnum(p.ulp)               : null,
    p_tgl_awal:  p.tglAwal  || null,
    p_tgl_akhir: p.tglAkhir || null,
    p_limit:     p.limit    ? parseInt(p.limit)                       : 5,
    p_offset:    p.offset   ? parseInt(p.offset)                      : 0
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: 'Gagal memuat riwayat inspeksi.' };

  var rows = (data.data || []).map(function(r) { return _mapInspeksiRow(r); });
  return { status: 'ok', data: rows, total: data.total || 0 };
}

// ── REKAP GARDU SEDERHANA via REST ───────────────────────────
async function _getRekapGardu(p, signal) {
  var url = '/rest/v1/gardu?select=no_gardu,ulp,unitup,penyulang,status_operasional,status_kepemilikan,tipe,kapasitas_kva&order=ulp.asc,no_gardu.asc';
  if (p && p.ulp) url += '&ulp=eq.' + encodeURIComponent(_normalizeUlpEnum(p.ulp));

  var res = await sbFetch(url, { signal: signal });
  if (!res.ok) return { status: 'error', message: 'Gagal memuat rekap gardu.' };

  var rows = await res.json();
  return {
    status: 'ok',
    data: rows.map(function(g) {
      return {
        noGardu:     g.no_gardu || '',
        ulp:         g.ulp || '',
        unitup:      g.unitup || '',
        penyulang:   g.penyulang || '',
        statusOp:    g.status_operasional || '',
        kepemilikan: g.status_kepemilikan || '',
        tipe:        g.tipe || '',
        daya:        g.kapasitas_kva || ''
      };
    })
  };
}

// ── TAMBAH USER via RPC ──────────────────────────────────────
async function _tambahUser(p, signal) {
  var pwHash = await sha256(String(p.password || '').trim());

  var data = await rpcCall('fn_tambah_user', {
    p_token:         p.token,
    p_username:      (p.username || '').trim().toLowerCase(),
    p_password_hash: pwHash,
    p_nama:          p.nama || '',
    p_role:          p.role || 'petugas',
    p_ulp:           p.ulp  || null
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal tambah user.' };

  return { status: 'ok', message: data.message };
}

// ── EDIT USER via RPC ────────────────────────────────────────
async function _editUser(p, signal) {
  var pwHash = (p.password && String(p.password).trim().length >= 4)
    ? await sha256(String(p.password).trim())
    : null;

  var data = await rpcCall('fn_edit_user', {
    p_token:         p.token,
    p_username_lama: p.usernameLama || p.username,
    p_nama:          p.nama         || null,
    p_role:          p.role         || null,
    p_ulp:           p.ulp !== undefined ? (p.ulp || null) : null,
    p_password_hash: pwHash
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal edit user.' };

  return { status: 'ok', message: data.message };
}

// ── GANTI PASSWORD via RPC ───────────────────────────────────
async function _gantiPassword(p, signal) {
  var oldHash = await sha256(String(p.passwordLama || '').trim());
  var newHash = await sha256(String(p.passwordBaru || '').trim());

  var data = await rpcCall('fn_ganti_password', {
    p_token:              p.token,
    p_password_hash_lama: oldHash,
    p_password_hash_baru: newHash
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal mengubah password.' };

  return { status: 'ok', message: data.message };
}

// ── VERIFY ULP PIN via RPC ───────────────────────────────────
async function _verifyULPPin(p, signal) {
  var pinHash   = await sha256(String(p.pin || '').trim());
  var ulpTarget = (p.ulp || '').trim().toUpperCase();

  var data = await rpcCall('fn_verify_ulp_pin', {
    p_pin_hash:   pinHash,
    p_ulp_target: ulpTarget
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'PIN salah.' };

  return { status: 'ok', role: data.role, ulp: data.ulp };
}

// ── TOGGLE STATUS GARDU via RPC ──────────────────────────────
async function _toggleStatus(p, signal) {
  var data = await rpcCall('fn_toggle_status_gardu', {
    p_token:    p.token,
    p_no_gardu: p.noGardu,
    p_status:   (p.status || 'AKTIF').toUpperCase()
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal mengubah status gardu.' };

  return { status: 'ok', message: data.message };
}

// ── TAMBAH INSPEKSI via RPC ──────────────────────────────────
async function _tambahInspeksi(p, signal) {
  // Normalisasi jurusan: pastikan semua field numerik diparse dan field 'titik' ikut terkirim
  var jurusanPayload = null;
  if (p.jurusan) {
    try {
      var jurusanArr = typeof p.jurusan === 'string' ? JSON.parse(p.jurusan) : p.jurusan;
      jurusanPayload = JSON.stringify(jurusanArr.map(function(j) {
        return {
          nama:    j.nama    || null,
          titik:   j.titik   || null,
          r_total: j.r_total != null ? parseFloat(j.r_total) : null,
          s_total: j.s_total != null ? parseFloat(j.s_total) : null,
          t_total: j.t_total != null ? parseFloat(j.t_total) : null,
          n_total: j.n_total != null ? parseFloat(j.n_total) : null,
          v_r_n:   j.v_r_n   != null ? parseFloat(j.v_r_n)   : null,
          v_s_n:   j.v_s_n   != null ? parseFloat(j.v_s_n)   : null,
          v_t_n:   j.v_t_n   != null ? parseFloat(j.v_t_n)   : null,
          v_r_s:   j.v_r_s   != null ? parseFloat(j.v_r_s)   : null,
          v_s_t:   j.v_s_t   != null ? parseFloat(j.v_s_t)   : null,
          v_r_t:   j.v_r_t   != null ? parseFloat(j.v_r_t)   : null,
          thd_r:   j.thd_r   != null ? parseFloat(j.thd_r)   : null,
          thd_s:   j.thd_s   != null ? parseFloat(j.thd_s)   : null,
          thd_t:   j.thd_t   != null ? parseFloat(j.thd_t)   : null,
          ipeak_r: j.ipeak_r != null ? parseFloat(j.ipeak_r) : null,
          ipeak_s: j.ipeak_s != null ? parseFloat(j.ipeak_s) : null,
          ipeak_t: j.ipeak_t != null ? parseFloat(j.ipeak_t) : null,
          tpf_r:   j.tpf_r   != null ? parseFloat(j.tpf_r)   : null,
          tpf_s:   j.tpf_s   != null ? parseFloat(j.tpf_s)   : null,
          tpf_t:   j.tpf_t   != null ? parseFloat(j.tpf_t)   : null
        };
      }));
    } catch (e) {
      jurusanPayload = typeof p.jurusan === 'string' ? p.jurusan : null;
    }
  }

  var data = await rpcCall('fn_tambah_inspeksi', {
    p_token:         p.token,
    p_no_gardu:      (p.noGardu || '').trim().toUpperCase(),
    p_tgl_ukur:      p.tglUkur                               || null,
    p_jam_ukur:      p.jamUkur                               || null,
    p_petugas:       p.petugas                               || null,
    p_daya:          p.daya        ? parseFloat(p.daya)      : null,
    p_fasa:          p.fasa        ? parseInt(p.fasa)        : null,
    p_daya_pakai:    p.dayaPakai   ? parseFloat(p.dayaPakai) : null,
    p_prosen:        p.prosen      ? parseFloat(p.prosen)    : null,
    p_tdk_seimbang:  p.tdkSeimbang ? parseFloat(p.tdkSeimbang) : null,
    p_r_total:       p.rTotal      ? parseFloat(p.rTotal)    : null,
    p_s_total:       p.sTotal      ? parseFloat(p.sTotal)    : null,
    p_t_total:       p.tTotal      ? parseFloat(p.tTotal)    : null,
    p_n_total:       p.nTotal      ? parseFloat(p.nTotal)    : null,
    p_v_r_n:         p.vRN         ? parseFloat(p.vRN)       : null,
    p_v_s_n:         p.vSN         ? parseFloat(p.vSN)       : null,
    p_v_t_n:         p.vTN         ? parseFloat(p.vTN)       : null,
    p_v_r_s:         p.vRS         ? parseFloat(p.vRS)       : null,
    p_v_s_t:         p.vST         ? parseFloat(p.vST)       : null,
    p_v_r_t:         p.vRT         ? parseFloat(p.vRT)       : null,
    p_thd_r:         p.thdR        ? parseFloat(p.thdR)      : null,
    p_thd_s:         p.thdS        ? parseFloat(p.thdS)      : null,
    p_thd_t:         p.thdT        ? parseFloat(p.thdT)      : null,
    p_ipeak_r:       p.ipeakR      ? parseFloat(p.ipeakR)    : null,
    p_ipeak_s:       p.ipeakS      ? parseFloat(p.ipeakS)    : null,
    p_ipeak_t:       p.ipeakT      ? parseFloat(p.ipeakT)    : null,
    p_tpf_r:         p.tpfR        ? parseFloat(p.tpfR)      : null,
    p_tpf_s:         p.tpfS        ? parseFloat(p.tpfS)      : null,
    p_tpf_t:         p.tpfT        ? parseFloat(p.tpfT)      : null,
    p_jurusan:       jurusanPayload
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal menyimpan inspeksi.' };

  return { status: 'ok', message: data.message, id: data.id };
}

// ── HAPUS INSPEKSI via RPC ───────────────────────────────────
async function _hapusInspeksi(p, signal) {
  var data = await rpcCall('fn_hapus_inspeksi', {
    p_token: p.token,
    p_id:    parseInt(p.id)
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal menghapus inspeksi.' };

  return { status: 'ok', message: data.message };
}

// ── GET DAFTAR INSPEKSI per gardu / per ULP via RPC ─────────
async function _getInspeksi(p, signal) {
  var data = await rpcCall('fn_get_riwayat_inspeksi', {
    p_no_gardu:  p.noGardu  ? (p.noGardu || '').trim().toUpperCase() : null,
    p_ulp:       p.ulp      ? _normalizeUlpEnum(p.ulp)               : null,
    p_tgl_awal:  p.tglAwal  || null,
    p_tgl_akhir: p.tglAkhir || null,
    p_limit:     p.limit    ? parseInt(p.limit)                       : 50,
    p_offset:    p.offset   ? parseInt(p.offset)                      : 0
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal memuat data inspeksi.' };

  return {
    status: 'ok',
    data:   (data.data || []).map(_mapInspeksiRow),
    total:   data.total || 0
  };
}

// ── EDIT INSPEKSI via RPC ─────────────────────────────────────
async function _editInspeksi(p, signal) {
  var jurusanPayload = null;
  if (p.jurusan) {
    try {
      var arr = typeof p.jurusan === 'string' ? JSON.parse(p.jurusan) : p.jurusan;
      jurusanPayload = JSON.stringify(arr.map(function(j) {
        return {
          nama:    j.nama    || null,
          titik:   j.titik   || null,
          r_total: j.r_total != null ? parseFloat(j.r_total) : null,
          s_total: j.s_total != null ? parseFloat(j.s_total) : null,
          t_total: j.t_total != null ? parseFloat(j.t_total) : null,
          n_total: j.n_total != null ? parseFloat(j.n_total) : null,
          v_r_n:   j.v_r_n   != null ? parseFloat(j.v_r_n)   : null,
          v_s_n:   j.v_s_n   != null ? parseFloat(j.v_s_n)   : null,
          v_t_n:   j.v_t_n   != null ? parseFloat(j.v_t_n)   : null,
          v_r_s:   j.v_r_s   != null ? parseFloat(j.v_r_s)   : null,
          v_s_t:   j.v_s_t   != null ? parseFloat(j.v_s_t)   : null,
          v_r_t:   j.v_r_t   != null ? parseFloat(j.v_r_t)   : null,
          thd_r:   j.thd_r   != null ? parseFloat(j.thd_r)   : null,
          thd_s:   j.thd_s   != null ? parseFloat(j.thd_s)   : null,
          thd_t:   j.thd_t   != null ? parseFloat(j.thd_t)   : null,
          ipeak_r: j.ipeak_r != null ? parseFloat(j.ipeak_r) : null,
          ipeak_s: j.ipeak_s != null ? parseFloat(j.ipeak_s) : null,
          ipeak_t: j.ipeak_t != null ? parseFloat(j.ipeak_t) : null,
          tpf_r:   j.tpf_r   != null ? parseFloat(j.tpf_r)   : null,
          tpf_s:   j.tpf_s   != null ? parseFloat(j.tpf_s)   : null,
          tpf_t:   j.tpf_t   != null ? parseFloat(j.tpf_t)   : null
        };
      }));
    } catch (e) {
      jurusanPayload = typeof p.jurusan === 'string' ? p.jurusan : null;
    }
  }

  var data = await rpcCall('fn_edit_inspeksi', {
    p_token:         p.token,
    p_id:            parseInt(p.id),
    p_tgl_ukur:      p.tglUkur                               || null,
    p_jam_ukur:      p.jamUkur                               || null,
    p_petugas:       p.petugas                               || null,
    p_daya:          p.daya        ? parseFloat(p.daya)      : null,
    p_fasa:          p.fasa        ? parseInt(p.fasa)        : null,
    p_daya_pakai:    p.dayaPakai   ? parseFloat(p.dayaPakai) : null,
    p_prosen:        p.prosen      ? parseFloat(p.prosen)    : null,
    p_tdk_seimbang:  p.tdkSeimbang ? parseFloat(p.tdkSeimbang) : null,
    p_r_total:       p.rTotal      ? parseFloat(p.rTotal)    : null,
    p_s_total:       p.sTotal      ? parseFloat(p.sTotal)    : null,
    p_t_total:       p.tTotal      ? parseFloat(p.tTotal)    : null,
    p_n_total:       p.nTotal      ? parseFloat(p.nTotal)    : null,
    p_v_r_n:         p.vRN         ? parseFloat(p.vRN)       : null,
    p_v_s_n:         p.vSN         ? parseFloat(p.vSN)       : null,
    p_v_t_n:         p.vTN         ? parseFloat(p.vTN)       : null,
    p_v_r_s:         p.vRS         ? parseFloat(p.vRS)       : null,
    p_v_s_t:         p.vST         ? parseFloat(p.vST)       : null,
    p_v_r_t:         p.vRT         ? parseFloat(p.vRT)       : null,
    p_thd_r:         p.thdR        ? parseFloat(p.thdR)      : null,
    p_thd_s:         p.thdS        ? parseFloat(p.thdS)      : null,
    p_thd_t:         p.thdT        ? parseFloat(p.thdT)      : null,
    p_ipeak_r:       p.ipeakR      ? parseFloat(p.ipeakR)    : null,
    p_ipeak_s:       p.ipeakS      ? parseFloat(p.ipeakS)    : null,
    p_ipeak_t:       p.ipeakT      ? parseFloat(p.ipeakT)    : null,
    p_tpf_r:         p.tpfR        ? parseFloat(p.tpfR)      : null,
    p_tpf_s:         p.tpfS        ? parseFloat(p.tpfS)      : null,
    p_tpf_t:         p.tpfT        ? parseFloat(p.tpfT)      : null,
    p_jurusan:       jurusanPayload
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal mengedit inspeksi.' };

  return { status: 'ok', message: data.message };
}

// ── RESET PASSWORD BY ADMIN via RPC ──────────────────────────
async function _resetPasswordByAdmin(p, signal) {
  var pwHash = await sha256(String(p.passwordBaru || '').trim());

  var data = await rpcCall('fn_reset_password_by_admin', {
    p_token:           p.token,
    p_username_target: p.username,
    p_password_hash:   pwHash
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal reset password.' };

  return { status: 'ok', message: data.message };
}

// ── RESET PIN BY ADMIN via RPC ───────────────────────────────
async function _resetPinByAdmin(p, signal) {
  var data = await rpcCall('fn_reset_pin_by_admin', {
    p_token:           p.token,
    p_username_target: p.username
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal reset PIN.' };

  return { status: 'ok', message: data.message };
}

// ── AKTIFKAN USER via RPC ────────────────────────────────────
async function _aktifkanUser(p, signal) {
  var data = await rpcCall('fn_aktifkan_user', {
    p_token:           p.token,
    p_username_target: p.username
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal mengaktifkan user.' };

  return { status: 'ok', message: data.message };
}

// ── STATISTIK ULP via RPC ────────────────────────────────────
async function _statistikUlp(p, signal) {
  var data = await rpcCall('fn_get_statistik_ulp', {
    p_ulp: _normalizeUlpEnum(p.ulp)
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal memuat statistik ULP.' };

  return data;
}

// ── MAINTENANCE CLEANUP via RPC ──────────────────────────────
async function _maintenanceCleanup(p, signal) {
  var data = await rpcCall('fn_maintenance_cleanup_sessions', {}, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal cleanup sessions.' };

  return { status: 'ok', message: data.message };
}

// ── HELPER: Map row gardu ────────────────────────────────────
function _mapGarduRow(g) {
  return {
    'NO_GARDU':           g.no_gardu   || '',
    'ULP':                g.ulp        || '',
    'UNITUP':             g.unitup     || '',
    'PENYULANG':          g.penyulang  || '',
    'ALAMAT':             g.alamat     || '',
    'KAPASITAS_KVA':      g.kapasitas_kva != null ? String(g.kapasitas_kva) : '',
    'DAYA_KVA':           g.kapasitas_kva != null ? String(g.kapasitas_kva) : '',
    'TIPE':               g.tipe       || '',
    'MEREK_TRAFO':        g.merek_trafo || '',
    'STATUS_KEPEMILIKAN': g.status_kepemilikan || '',
    'STATUS_OPERASIONAL': g.status_operasional || '',
    'LATITUDE':           g.latitude   || '',
    'LONGITUDE':          g.longitude  || '',
    'KETERANGAN':         g.keterangan || ''
  };
}

// ── HELPER: Map row inspeksi ─────────────────────────────────
function _mapInspeksiRow(r) {
  var flat = {
    '_id':          r.id         != null ? r.id : null,
    'NO_GARDU':     r.no_gardu   || '',
    'NOGARDU':      r.no_gardu   || '',
    'ULP':          r.ulp        || '',
    'UNITUP':       r.unitup     || '',
    'PENYULANG':    r.penyulang  || '',
    'ALAMAT':       r.alamat     || '',
    'STATUS_KEPEMILIKAN': r.status_kepemilikan || '',
    'TGLUKUR':      r.tgl_ukur   || '',
    'JAM UKUR':     r.jam_ukur   ? String(r.jam_ukur).slice(0, 5) : '',
    'PETUGAS':      r.petugas    || '',
    'DAYA':         r.daya       != null ? String(r.daya)       : '',
    'FASA':         r.fasa       != null ? String(r.fasa)       : '',
    'DAYA PAKAI':   r.daya_pakai != null ? String(r.daya_pakai) : '',
    'PROSEN':       r.prosen     != null ? String(r.prosen)     : '',
    'TDKSEIMBANG':  r.tdk_seimbang != null ? String(r.tdk_seimbang) : '',
    'TDK SEIMBANG': r.tdk_seimbang != null ? String(r.tdk_seimbang) : '',
    'R TOTAL':      r.r_total    != null ? String(r.r_total)    : '',
    'S TOTAL':      r.s_total    != null ? String(r.s_total)    : '',
    'T TOTAL':      r.t_total    != null ? String(r.t_total)    : '',
    'N TOTAL':      r.n_total    != null ? String(r.n_total)    : '',
    'R - N':        r.v_r_n      != null ? String(r.v_r_n)      : '',
    'S - N':        r.v_s_n      != null ? String(r.v_s_n)      : '',
    'T - N':        r.v_t_n      != null ? String(r.v_t_n)      : '',
    'R - S':        r.v_r_s      != null ? String(r.v_r_s)      : '',
    'S - T':        r.v_s_t      != null ? String(r.v_s_t)      : '',
    'R - T':        r.v_r_t      != null ? String(r.v_r_t)      : '',
    'THD-R':        r.thd_r      != null ? String(r.thd_r)      : '',
    'THD-S':        r.thd_s      != null ? String(r.thd_s)      : '',
    'THD-T':        r.thd_t      != null ? String(r.thd_t)      : '',
    'IPEAK-R':      r.ipeak_r    != null ? String(r.ipeak_r)    : '',
    'IPEAK-S':      r.ipeak_s    != null ? String(r.ipeak_s)    : '',
    'IPEAK-T':      r.ipeak_t    != null ? String(r.ipeak_t)    : '',
    'TPF-R':        r.tpf_r      != null ? String(r.tpf_r)      : '',
    'TPF-S':        r.tpf_s      != null ? String(r.tpf_s)      : '',
    'TPF-T':        r.tpf_t      != null ? String(r.tpf_t)      : ''
  };

  var jurusan = [];
  try {
    jurusan = typeof r.jurusan === 'string'
      ? JSON.parse(r.jurusan)
      : (r.jurusan || []);
  } catch (e) {}

  jurusan.forEach(function(j, idx) {
    var n = idx + 1;
    flat['JURUSAN ' + n]       = j.nama     || '';
    flat['JUR' + n + '_R TOTAL'] = j.r_total != null ? String(j.r_total)  : '';
    flat['JUR' + n + '_S TOTAL'] = j.s_total != null ? String(j.s_total)  : '';
    flat['JUR' + n + '_T TOTAL'] = j.t_total != null ? String(j.t_total)  : '';
    flat['JUR' + n + '_N TOTAL'] = j.n_total != null ? String(j.n_total)  : '';
    flat['JUR' + n + '_R - N']   = j.v_r_n   != null ? String(j.v_r_n)    : '';
    flat['JUR' + n + '_S - N']   = j.v_s_n   != null ? String(j.v_s_n)    : '';
    flat['JUR' + n + '_T - N']   = j.v_t_n   != null ? String(j.v_t_n)    : '';
    flat['JUR' + n + '_R - s']   = j.v_r_t   != null ? String(j.v_r_t)    : '';
    flat['JUR' + n + '_R - T']   = j.v_r_t   != null ? String(j.v_r_t)    : '';
    flat['JUR' + n + '_S - T']   = j.v_s_t   != null ? String(j.v_s_t)    : '';
    flat['JUR' + n + '_THD-R']   = j.thd_r   != null ? String(j.thd_r)    : '';
    flat['JUR' + n + '_THD-S']   = j.thd_s   != null ? String(j.thd_s)    : '';
    flat['JUR' + n + '_THD-T']   = j.thd_t   != null ? String(j.thd_t)    : '';
    flat['JUR' + n + '_IPEAK-R'] = j.ipeak_r != null ? String(j.ipeak_r)  : '';
    flat['JUR' + n + '_IPEAK-S'] = j.ipeak_s != null ? String(j.ipeak_s)  : '';
    flat['JUR' + n + '_IPEAK-T'] = j.ipeak_t != null ? String(j.ipeak_t)  : '';
    flat['JUR' + n + '_TPF-R']   = j.tpf_r   != null ? String(j.tpf_r)    : '';
    flat['JUR' + n + '_TPF-S']   = j.tpf_s   != null ? String(j.tpf_s)    : '';
    flat['JUR' + n + '_TPF-T']   = j.tpf_t   != null ? String(j.tpf_t)    : '';
  });

  return flat;
}

// ── TAMBAH PEMELIHARAAN via RPC ───────────────────────────────
async function _tambahPemeliharaan(p, signal) {
  var data = await rpcCall('fn_tambah_pemeliharaan', {
    p_token:          p.token,
    p_no_gardu:       (p.noGardu || '').trim().toUpperCase(),
    p_tanggal:        p.tanggal        || null,
    p_petugas:        p.petugas        || null,
    p_kategori:       p.kategori       || null,
    p_jenis:          p.jenis          || null,
    p_kondisi_awal:   p.kondisiAwal    || null,
    p_kondisi_akhir:  p.kondisiAkhir   || null,
    p_temuan:         p.temuan         || null,
    p_tindakan:       p.tindakan       || null,
    p_bahan_pakai:    p.bahanPakai     ? JSON.stringify(p.bahanPakai) : null,
    p_rekomendasi:    p.rekomendasi    || null,
    p_status:         p.status         || 'SELESAI',
    p_jam_mulai:      p.jamMulai       || null,
    p_jam_selesai:    p.jamSelesai     || null,
    p_catatan:        p.catatan        || null
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal menyimpan data pemeliharaan.' };

  return { status: 'ok', message: data.message, id: data.id };
}

// ── GET DAFTAR PEMELIHARAAN via RPC ──────────────────────────
async function _getDaftarPemeliharaan(p, signal) {
  var data = await rpcCall('fn_get_pemeliharaan', {
    p_token:     p.token,
    p_no_gardu:  p.noGardu  ? (p.noGardu || '').trim().toUpperCase() : null,
    p_ulp:       p.ulp      ? _normalizeUlpEnum(p.ulp)               : null,
    p_status:    p.status   || null,
    p_tgl_awal:  p.tglAwal  || null,
    p_tgl_akhir: p.tglAkhir || null,
    p_limit:     p.limit    ? parseInt(p.limit)                       : 50,
    p_offset:    p.offset   ? parseInt(p.offset)                      : 0
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal memuat data pemeliharaan.' };

  return { status: 'ok', data: data.data || [], total: data.total || 0 };
}

// ── HAPUS PEMELIHARAAN via RPC ────────────────────────────────
async function _hapusPemeliharaan(p, signal) {
  var data = await rpcCall('fn_hapus_pemeliharaan', {
    p_token: p.token,
    p_id:    parseInt(p.id)
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal menghapus data pemeliharaan.' };

  return { status: 'ok', message: data.message };
}

// ── EDIT PEMELIHARAAN via RPC ─────────────────────────────────
async function _editPemeliharaan(p, signal) {
  var data = await rpcCall('fn_edit_pemeliharaan', {
    p_token:          p.token,
    p_id:             parseInt(p.id),
    p_tanggal:        p.tanggal       || null,
    p_petugas:        p.petugas       || null,
    p_kategori:       p.kategori      || null,
    p_jenis:          p.jenis         || null,
    p_kondisi_awal:   p.kondisiAwal   || null,
    p_kondisi_akhir:  p.kondisiAkhir  || null,
    p_temuan:         p.temuan        || null,
    p_tindakan:       p.tindakan      || null,
    p_bahan_pakai:    p.bahanPakai    ? JSON.stringify(p.bahanPakai) : null,
    p_rekomendasi:    p.rekomendasi   || null,
    p_status:         p.status        || null,
    p_jam_mulai:      p.jamMulai      || null,
    p_jam_selesai:    p.jamSelesai    || null,
    p_catatan:        p.catatan       || null
  }, signal);

  if (!data || data.status !== 'ok')
    return { status: 'error', message: (data && data.message) || 'Gagal mengedit data pemeliharaan.' };

  return { status: 'ok', message: data.message };
}

// ── Override apiGet global ────────────────────────────────────
window.apiGet = function(params, cb) {
  var action = params.action || '';
  var p = Object.assign({}, params);
  delete p.action;
  apiCall(action, p, cb);
};

window._sbApiReady = true;
console.log('[Supabase API v8] Layer aktif. URL:', SUPABASE_URL);
/* =============================================
   SiNilai – app.js
   Logic utama: kalkulasi nilai, UI, Google Sheets
   ============================================= */

'use strict';

// ── STATE ──────────────────────────────────────
let allData = [];       // semua data dari Google Sheets / localStorage
let filteredData = [];  // data setelah filter
let sortKey = null;
let sortAsc = true;
let pendingDeleteId = null;

// Mode data: default ke sheets.
// Pastikan Apps Script sudah di-deploy dan permission-nya "Anyone".
// Jika API URL belum tersimpan/terkonfigurasi, tampilkan error yang jelas di UI.
// Default: gunakan lokal supaya langsung terlihat bertambah (tidak bergantung Sheets)
// Default: agar data selalu tersimpan & muncul di halaman utama, gunakan mode lokal dulu.
// (mode sheets hanya aktif jika user benar-benar memasang URL API.)
const storedMode = localStorage.getItem('sinilai_data_mode');
let DATA_MODE = storedMode || 'local';
if (storedMode !== 'local' && storedMode !== 'sheets') DATA_MODE = 'local';
localStorage.setItem('sinilai_data_mode', DATA_MODE);




// Ambil API URL dari localStorage (hanya dipakai jika DATA_MODE === 'sheets')
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwFeWNvnlwSLrCVDV57VGqNKPVfwTo37CgaOZhlKzGqvvr9Jn_z8mLdGCNY_XBbq5cV/exec';

let API_URL = localStorage.getItem('sinilai_api_url') || DEFAULT_API_URL;

// Key localStorage untuk data nilai
const LS_GRADES_KEY = 'sinilai_grades_v1';

// Simpan template empty-state supaya dashboard/profil tetap aman.
if (!localStorage.getItem(LS_GRADES_KEY)) {
  localStorage.setItem(LS_GRADES_KEY, JSON.stringify([]));
}

// ── BROADCAST CHANNEL (real-time cross-tab sync) ──────────────
// BroadcastChannel memungkinkan semua tab/window yang membuka
// website ini langsung menerima data baru tanpa perlu polling.
let broadcastChannel = null;
try {
  broadcastChannel = new BroadcastChannel('sinilai_realtime_sync');
  broadcastChannel.onmessage = (event) => {
    if (!isAuthed()) return;
    const msg = event.data;
    if (msg && msg.type === 'DATA_CHANGED') {
      // Reload data dari localStorage dan re-render
      const rows = loadFromLocal();
      allData = rows.map(mapRowToData);
      filteredData = [...allData];
      renderDashboard();
      renderMainTable();
    }
  };
} catch (_) {
  // BroadcastChannel tidak tersedia di browser lama, fallback ke storage event
}

// Kirim notifikasi ke semua tab lain bahwa data berubah
function notifyDataChanged() {
  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'DATA_CHANGED', timestamp: Date.now() });
    }
  } catch (_) {}
}

// ── ROW MAPPER (DRY helper) ───────────────────
function mapRowToData(row) {
  return {
    id:         row.id,
    timestamp:  row.timestamp,
    nama:       row.nama,
    nim:        row.nim,
    semester:   String(row.semester),
    prodi:      row.prodi,
    namaMK:     row.namaMK,
    kodeMK:     row.kodeMK,
    sks:        parseInt(row.sks) || 0,
    dosen:      row.dosen,
    quiz:       parseFloat(row.quiz) || 0,
    uts:        parseFloat(row.uts) || 0,
    uas:        parseFloat(row.uas) || 0,
    nilaiAkhir: parseFloat(row.nilaiAkhir) || 0,
    huruf:      row.huruf,
    bobot:      parseFloat(row.bobot) || 0,
  };
}



// ── AUTH ───────────────────────────────────────
const AUTH_USER = 'admin';
const AUTH_PASS = 'admin123';


// Pastikan fungsi global agar inline onsubmit/onclick di index.html bisa memanggil
// (beberapa environment bisa tidak mengekspos fungsi lokal default)
// NOTE: window.handleLogin/window.logout di-assign setelah fungsi didefinisikan (lihat akhir file)

// Debug login singkat (tidak menampilkan password)
// Biar saat error user, kita bisa tahu kenapa tidak masuk.
function debugAuthState(username, password) {
  // hanya log ke console jika ada
  try {
    console.debug('[SiNilai][auth]', {
      username,
      passProvided: !!password,
      authedBefore: isAuthed(),
    });
  } catch (_) {}
}
const LS_AUTH_KEY = 'sinilai_logged_in';

function isAuthed() {
  // Debug: beberapa browser bisa menyimpan boolean menjadi string lain.
  // Normalisasikan supaya autentikasi lebih robust.
  const v = localStorage.getItem(LS_AUTH_KEY);
  return v === 'true' || v === true;
}

function setAuthed(v) {
  try {
    localStorage.setItem(LS_AUTH_KEY, v ? 'true' : 'false');
  } catch (e) {
    // ignore, but still update UI
  }
  applyAuthUI();
}

function applyAuthUI() {
  const body = document.body;
  const authed = isAuthed();
  const loginEl = document.getElementById('login-section');
  const appEl = document.getElementById('app-shell');

  if (authed) {
    body.classList.add('authed');
    if (loginEl) loginEl.style.display = 'none';
    if (appEl) appEl.style.display = '';
  } else {
    body.classList.remove('authed');
    if (loginEl) loginEl.style.display = '';
    if (appEl) appEl.style.display = 'none';
  }

  // Jika logout, reset error/inputs (biar rapi)
  if (!authed) {
    const errEl = document.getElementById('login-error');
    if (errEl) errEl.style.display = 'none';
  }
}

function handleLogin(e) {
  e.preventDefault();


  // Hapus kredensial dari URL kalau ada (contoh: ?username=...&password=...)
  // Pakai URL object biar aman untuk skenario path berbeda.
  try {
    const url = new URL(window.location.href);
    url.search = '';
    window.history.replaceState({}, document.title, url.toString());
  } catch (_) {}


  const username = (document.getElementById('login-username')?.value || '').trim();
  const password = (document.getElementById('login-password')?.value || '').trim();

  const errEl = document.getElementById('login-error');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }

  debugAuthState(username, password);

  // Cek credentials
  if (username === AUTH_USER && password === AUTH_PASS) {
    setAuthed(true);
    try { showTab('dashboard'); } catch (_) {}
    toast('✅ Login berhasil!', 'success');
    // Load data setelah login
    loadData().then(() => {
      renderDashboard();
      renderMainTable();
      startRealtimeSync();
    });
    document.getElementById('main-content')?.focus?.();
    return;
  }

  // Login gagal
  if (errEl) {
    errEl.textContent = 'Username atau password salah.';
    errEl.style.display = 'block';
  }
  toast('❌ Login gagal', 'error');
}

function logout() {
  setAuthed(false);
  try {
    // Pastikan tab & render ulang setelah login kembali
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  } catch (_) {}
  toast('👋 Logout berhasil', 'info');
}

function fillDemoLogin() {
  // input sudah disembunyikan, tetap isi agar kompatibel dengan handleLogin
  const u = document.getElementById('login-username');
  const p = document.getElementById('login-password');
  if (u) u.value = AUTH_USER;
  if (p) p.value = AUTH_PASS;
}

// ── INIT ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // auth shell
  applyAuthUI();

  // simpan template empty-state untuk reset
  const emptyEl = document.getElementById('nim-empty');
  if (emptyEl && !emptyEl.dataset.emptyHtml) {
    emptyEl.dataset.emptyHtml = emptyEl.innerHTML;
  }

  // Jika mode sheets, sync URL API ke input (kalau ada)
  const urlInput = document.getElementById('api-url-input');
  if (urlInput && DATA_MODE === 'sheets') {
    if (API_URL) urlInput.value = API_URL;
  }

  // Sync local antar tab browser (instant) – daftarkan SELALU
  window.addEventListener('storage', (ev) => {
    if (!ev || ev.key !== LS_GRADES_KEY) return;
    if (!isAuthed()) return;
    // Langsung reload dari localStorage dan re-render
    const rows = loadFromLocal();
    allData = rows.map(mapRowToData);
    filteredData = [...allData];
    renderDashboard();
    renderMainTable();
  });

  // Konfirmasi hapus – daftarkan SELALU
  document.getElementById('confirm-delete-btn')?.addEventListener('click', confirmDelete);

  // Hanya muat data jika sudah login
  if (isAuthed()) {
    loadData()
      .then(() => {
        renderDashboard();
        renderMainTable();
        startRealtimeSync();

        // Set default tab
        showTab('dashboard');

        // Enable preview realtime
        const quiz = document.getElementById('f-quiz');
        if (quiz) updatePreview();
      })
      .catch((err) => {
        console.error('[SiNilai] init error:', err);
      });
  }
});




// ── NAVIGASI TAB ──────────────────────────────
function showTab(name) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const section = document.getElementById('tab-' + name);
  const navBtn  = document.getElementById('nav-' + name);
  if (section) section.classList.add('active');
  if (navBtn)  navBtn.classList.add('active');

  if (name === 'riwayat') renderMainTable();
  if (name === 'dashboard') renderDashboard();

  // Chiudi sidebar su mobile
  closeSidebarMobile();
}

// ── SIDEBAR MOBILE ─────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const hamburger = document.getElementById('hamburger');
  sidebar.classList.toggle('open');
  hamburger.classList.toggle('open');
}
function closeSidebarMobile() {
  const sidebar = document.getElementById('sidebar');
  const hamburger = document.getElementById('hamburger');
  if (window.innerWidth <= 768) {
    sidebar.classList.remove('open');
    hamburger.classList.remove('open');
  }
}

// ── THEME TOGGLE ───────────────────────────────
function toggleTheme() {
  const body  = document.body;
  const icon  = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  const isLight = body.classList.toggle('light-theme');
  localStorage.setItem('sinilai_theme', isLight ? 'light' : 'dark');

  if (isLight) {
    icon.innerHTML = '<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    label.textContent = 'Mode Gelap';
  } else {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    label.textContent = 'Mode Terang';
  }
}

// Terapkan tema tersimpan
(function applyStoredTheme() {
  const stored = localStorage.getItem('sinilai_theme');
  if (stored === 'light') {
    document.body.classList.add('light-theme');
    setTimeout(() => {
      const icon  = document.getElementById('theme-icon');
      const label = document.getElementById('theme-label');
      if (icon) icon.innerHTML = '<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
      if (label) label.textContent = 'Mode Gelap';
    }, 0);
  }
})();

// ── KALKULASI NILAI ────────────────────────────
function calcNilaiAkhir(quiz, uts, uas) {
  return Math.round((quiz * 0.25 + uts * 0.35 + uas * 0.40) * 100) / 100;
}

function nilaiToHuruf(nilai) {
  if (nilai >= 85) return 'A';
  if (nilai >= 80) return 'A-';
  if (nilai >= 75) return 'B+';
  if (nilai >= 70) return 'B';
  if (nilai >= 65) return 'B-';
  if (nilai >= 60) return 'C+';
  if (nilai >= 55) return 'C';
  if (nilai >= 50) return 'C-';
  if (nilai >= 45) return 'D';
  return 'E';
}

function hurufToBobot(huruf) {
  const map = { 'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7,
                'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D': 1.0, 'E': 0.0 };
  return map[huruf] ?? 0.0;
}

function predikat(ipk) {
  if (ipk >= 3.51) return '🏆 Cumlaude / Pujian';
  if (ipk >= 3.01) return '⭐ Sangat Memuaskan';
  if (ipk >= 2.51) return '👍 Memuaskan';
  if (ipk >= 2.00) return '✅ Cukup';
  return '⚠️ Perlu Peningkatan';
}

function gradeClass(huruf) {
  const map = { 'A': 'grade-A', 'A-': 'grade-Am', 'B+': 'grade-Bp', 'B': 'grade-B',
                'B-': 'grade-Bm', 'C+': 'grade-Cp', 'C': 'grade-C', 'C-': 'grade-Cm',
                'D': 'grade-D', 'E': 'grade-E' };
  return map[huruf] || 'grade-E';
}

// ── PREVIEW REAL-TIME ──────────────────────────
function updatePreview() {
  const nama     = document.getElementById('f-nama').value.trim();
  const nim      = document.getElementById('f-nim').value.trim();
  const mk       = document.getElementById('f-mk').value.trim();
  const dosen    = document.getElementById('f-dosen').value.trim();
  const quizRaw  = document.getElementById('f-quiz').value;
  const utsRaw   = document.getElementById('f-uts').value;
  const uasRaw   = document.getElementById('f-uas').value;

  // Avatar
  const avatar = document.getElementById('prev-avatar');
  avatar.textContent = nama ? nama.charAt(0).toUpperCase() : '?';

  // Info mahasiswa
  document.getElementById('prev-nama').textContent = nama || 'Nama Mahasiswa';
  document.getElementById('prev-nim').textContent  = nim ? 'NIM: ' + nim : 'NIM: –';
  document.getElementById('prev-mk').textContent   = mk ? 'Mata Kuliah: ' + mk : 'Mata Kuliah: –';
  document.getElementById('prev-dosen').textContent = dosen ? 'Dosen: ' + dosen : 'Dosen: –';

  // Nilai komponen
  const quiz = parseFloat(quizRaw);
  const uts  = parseFloat(utsRaw);
  const uas  = parseFloat(uasRaw);

  document.getElementById('prev-quiz').textContent = !isNaN(quiz) ? quiz.toFixed(0) : '–';
  document.getElementById('prev-uts').textContent  = !isNaN(uts)  ? uts.toFixed(0)  : '–';
  document.getElementById('prev-uas').textContent  = !isNaN(uas)  ? uas.toFixed(0)  : '–';

  // Progress bars
  updateBar('bar-quiz', quiz);
  updateBar('bar-uts',  uts);
  updateBar('bar-uas',  uas);

  // Kalkulasi
  if (!isNaN(quiz) && !isNaN(uts) && !isNaN(uas)) {
    const akhir  = calcNilaiAkhir(quiz, uts, uas);
    const huruf  = nilaiToHuruf(akhir);
    const bobot  = hurufToBobot(huruf);
    const pred   = predikat(bobot);

    document.getElementById('prev-akhir').textContent  = akhir.toFixed(2);
    document.getElementById('prev-huruf').textContent  = huruf;
    document.getElementById('prev-bobot').textContent  = 'Bobot ' + bobot.toFixed(1);
    document.getElementById('prev-predikat').textContent = pred;
  } else {
    document.getElementById('prev-akhir').textContent  = '–';
    document.getElementById('prev-huruf').textContent  = '–';
    document.getElementById('prev-bobot').textContent  = '–';
    document.getElementById('prev-predikat').textContent = 'Masukkan semua nilai untuk melihat hasil';
  }
}

function updateBar(id, val) {
  const el = document.getElementById(id);
  if (el) el.style.width = (isNaN(val) ? 0 : Math.min(100, Math.max(0, val))) + '%';
}

// ── SUBMIT FORM ────────────────────────────────
async function submitGrade(e) {
  if (e?.preventDefault) e.preventDefault();
  // Supaya dashboard selalu langsung update, kunci urutan refresh UI di akhir

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;margin:0;border-width:2px;display:inline-block;vertical-align:middle"></div> Menyimpan…';

  try {
    const quiz = parseFloat(document.getElementById('f-quiz').value);
    const uts  = parseFloat(document.getElementById('f-uts').value);
    const uas  = parseFloat(document.getElementById('f-uas').value);

    if ([quiz, uts, uas].some(v => isNaN(v) || v < 0 || v > 100)) {
      toast('Nilai harus antara 0 – 100', 'error');
      return;
    }

    const nilaiAkhir = calcNilaiAkhir(quiz, uts, uas);
    const huruf      = nilaiToHuruf(nilaiAkhir);
    const bobot      = hurufToBobot(huruf);

    const payload = {
      // Untuk mode lokal
      id: cryptoRandomId(),
      timestamp: new Date().toISOString(),

      nama:      document.getElementById('f-nama').value.trim(),
      nim:       document.getElementById('f-nim').value.trim(),
      semester:  document.getElementById('f-semester').value,
      prodi:     document.getElementById('f-prodi').value.trim(),
      namaMK:    document.getElementById('f-mk').value.trim(),
      kodeMK:    document.getElementById('f-kodemk').value.trim(),
      sks:       parseInt(document.getElementById('f-sks').value),
      dosen:     document.getElementById('f-dosen').value.trim(),
      quiz, uts, uas,
      nilaiAkhir, huruf, bobot
    };

    // ─── LANGKAH 1: Simpan ke localStorage SEGERA ───
    saveToLocal(payload);

    // ─── LANGKAH 2: Update state allData LANGSUNG (tanpa menunggu loadData) ───
    // Ini memastikan dashboard LANGSUNG terupdate seketika
    allData.push(mapRowToData(payload));
    filteredData = [...allData];

    // ─── LANGKAH 3: Re-render dashboard & tabel SEGERA ───
    renderDashboard();
    renderMainTable();

    // ─── LANGKAH 4: Notifikasi tab lain ───
    notifyDataChanged();

    // ─── LANGKAH 5: Jika mode sheets, kirim ke Google Sheets di background ───
    if (DATA_MODE === 'sheets') {
      if (!API_URL || String(API_URL).trim().length === 0) {
        toast('❌ URL Apps Script belum terkonfigurasi. Setel di menu API Setup.', 'error');
        return;
      }
      const { id, timestamp, ...payloadSheets } = payload;

      // Tambah parameter anti-cache
      const nonce = Date.now();
      payloadSheets._clientNonce = nonce;

      try {
        await postToSheets({ action: 'addGrade', ...payloadSheets });

        // Tunggu dan retry getGrades beberapa kali agar appendRow tersinkron
        // (Google Sheets kadang butuh beberapa ratus ms hingga beberapa detik)
        let loaded = false;
        for (let i = 0; i < 5; i++) {
          try {
            await new Promise(r => setTimeout(r, 650));
            await loadData();
            loaded = true;
            break;
          } catch (_) {}
        }
        if (!loaded) {
          await loadData();
        }
      } catch (err) {
        toast('❌ Gagal POST ke Sheets: ' + (err?.message || err), 'error');
        throw err;
      }
    }

    toast(`✅ Nilai berhasil disimpan!`, 'success');

    resetForm();

    // ─── LANGKAH 6: Paksa refresh UI sekali lagi dari localStorage ───
    // Untuk memastikan dashboard, tabel entri terbaru, dan riwayat terupdate
    const freshRows = loadFromLocal();
    allData = freshRows.map(mapRowToData);
    filteredData = [...allData];
    renderDashboard();
    renderMainTable();

  } catch (err) {
    toast('❌ Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Simpan Nilai`;
  }
}



function resetForm() {
  document.getElementById('grade-form').reset();
  updatePreview();
}

// ── LOKAL HELPERS ──────────────────────────────
function cryptoRandomId() {
  // cukup untuk identitas lokal
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'id-' + Math.random().toString(16).slice(2) + '-' + Date.now();
}

function loadFromLocal() {
  try {
    const raw = localStorage.getItem(LS_GRADES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch (_) {
    return [];
  }
}

function saveToLocal(payload) {
  const cur = loadFromLocal();
  cur.push(payload);
  try {
    localStorage.setItem(LS_GRADES_KEY, JSON.stringify(cur));
  } catch (e) {
    toast('❌ Gagal menyimpan ke localStorage (storage penuh/terblokir).', 'error');
  }
}

function deleteFromLocal(id) {
  const cur = loadFromLocal();
  const next = cur.filter(x => String(x.id) !== String(id));
  localStorage.setItem(LS_GRADES_KEY, JSON.stringify(next));
  // Notifikasi tab lain bahwa data berubah
  notifyDataChanged();
}

// ── LOAD DATA ──────────────────────────────────
let realtimeTimer = null;
let lastRealtimeNonce = null;

function startRealtimeSync() {
  // Hindari multiple interval saat reload/lihat ulang
  if (realtimeTimer) clearInterval(realtimeTimer);

  // Interval polling: setiap 3 detik cek data terbaru dari localStorage
  // Ini menjaga dashboard tetap sinkron meskipun BroadcastChannel tidak tersedia
  realtimeTimer = setInterval(async () => {
    try {
      if (!isAuthed()) return;
      await loadData();
    } catch (_) {
      // jangan spam toast; cukup diam
    }
  }, 3000);
}

function stopRealtimeSync() {
  if (realtimeTimer) clearInterval(realtimeTimer);
  realtimeTimer = null;
}

// helper: tetap kompatibel jika ada pemanggilan lama
async function _noop() {}

function startRealtimeSyncDeprecated() {
  // (placeholder) tidak dipakai
}

// ── SYNC UI (wajib ada agar dashboard selalu update) ─────────────
function refreshUIFromLatestData() {
  // 1) untuk mode local: langsung loadData (langsung dari localStorage)
  // 2) untuk mode sheets: lakukan loadData beberapa kali (Sheets append bisa delay)
  // Catatan: refresh ini harus benar-benar mem-render dashboard & riwayat
  // agar pengguna melihat perubahan langsung, meskipun tab saat ini bukan dashboard.
  return (async () => {
    if (DATA_MODE === 'local') {
      await loadData();
      renderDashboard();
      renderMainTable();
      return;
    }

    // DATA_MODE === 'sheets'
    let ok = false;
    for (let i = 0; i < 6; i++) {
      try {
        await new Promise(r => setTimeout(r, 450));
        await loadData();
        ok = true;
        break;
      } catch (_) {}
    }
    if (!ok) await loadData();

    renderDashboard();
    renderMainTable();
  })();
}



async function loadData() {
  try {
    if (DATA_MODE === 'local') {
      const rows = loadFromLocal();
      allData = rows.map(mapRowToData);
    } else {
      if (!API_URL) {
        toast('❌ Mode sheets dinonaktifkan. URL Google Sheets belum terkonfigurasi.', 'error');
        allData = [];
      } else {
        const nonce = Date.now();
        const res = await fetch(API_URL + '?action=getGrades&_nonce=' + nonce);
        const json = await res.json();
        if (json.success) {
          allData = json.data.map(mapRowToData);
        } else {
          allData = [];
        }
      }
    }
  } catch (err) {
    toast('❌ Gagal memuat data: ' + err.message, 'error');
    console.warn('Gagal load data:', err.message);
    allData = [];
  }

  filteredData = [...allData];
  // render ulang setelah data berubah
  renderDashboard();
  renderMainTable();
}



// ── GOOGLE SHEETS POST ─────────────────────────
async function postToSheets(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  // Debug lebih jelas saat gagal simpan
  let text = '';
  try {
    text = await res.text();
  } catch (_) {}

  // Coba parsing JSON jika memungkinkan
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }

  if (!res.ok) {
    const detail = json?.error ? json.error : (text ? text.slice(0, 500) : '');
    throw new Error(`HTTP ${res.status} ${res.statusText}${detail ? ' - ' + detail : ''}`);
  }

  if (!json || json.success === undefined || !json.success) {
    const detail = json?.error ? json.error : (text ? text.slice(0, 500) : 'Server returned empty/invalid response');
    throw new Error(detail);
  }

  return json;
}

// ── ANIMATED COUNTER ──────────────────────────
// Animasi angka naik/turun di stat card untuk efek real-time
function animateStatValue(el, newValue, isFloat = false) {
  if (!el) return;
  const currentText = el.textContent;
  const currentValue = isFloat ? parseFloat(currentText) : parseInt(currentText);
  
  if (isNaN(currentValue) || currentText === '–') {
    el.textContent = isFloat ? newValue.toFixed(1) : newValue;
    el.classList.add('stat-updated');
    setTimeout(() => el.classList.remove('stat-updated'), 600);
    return;
  }
  
  if (currentValue === (isFloat ? parseFloat(newValue.toFixed(1)) : newValue)) return;
  
  // Animasi counting
  const diff = newValue - currentValue;
  const steps = Math.min(Math.abs(diff) * 2, 20);
  const duration = 400; // ms
  const stepTime = duration / steps;
  let step = 0;
  
  el.classList.add('stat-updated');
  
  const counter = setInterval(() => {
    step++;
    const progress = step / steps;
    // easeOutCubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const val = currentValue + diff * eased;
    el.textContent = isFloat ? val.toFixed(1) : Math.round(val);
    
    if (step >= steps) {
      clearInterval(counter);
      el.textContent = isFloat ? newValue.toFixed(1) : newValue;
      setTimeout(() => el.classList.remove('stat-updated'), 300);
    }
  }, stepTime);
}

// ── DASHBOARD ─────────────────────────────────
function renderDashboard() {
  // Stats
  const nims = [...new Set(allData.map(d => d.nim).filter(Boolean))];
  const statTotal = document.getElementById('stat-total');
  animateStatValue(statTotal, nims.length);

  const mks = [...new Set(allData.map(d => d.kodeMK).filter(Boolean))];
  const statMk = document.getElementById('stat-mk');
  animateStatValue(statMk, mks.length);

  const dosens = [...new Set(allData
    .map(d => (d.dosen || '').trim())
    .filter(Boolean)
  )];
  const statDosen = document.getElementById('stat-dosen');
  animateStatValue(statDosen, dosens.length);

  if (allData.length > 0) {
    const maxNilai = Math.max(...allData.map(d => d.nilaiAkhir));
    const statTertinggi = document.getElementById('stat-tertinggi');
    animateStatValue(statTertinggi, maxNilai, true);
  } else {
    const statTertinggi = document.getElementById('stat-tertinggi');
    if (statTertinggi) statTertinggi.textContent = '0';
  }

  // Recent table (5 terbaru)
  const recent = [...allData].reverse().slice(0, 5);
  const tbody  = document.getElementById('recent-tbody');
  if (!tbody) return;

  if (recent.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Belum ada data. <a href="#" onclick="showTab('input');return false;">Input nilai pertama →</a></td></tr>`;
    return;
  }
  tbody.innerHTML = recent.map((r, idx) => `
    <tr class="row-animate" style="animation-delay:${idx * 50}ms">
      <td><strong>${esc(r.nama)}</strong></td>
      <td><code style="font-size:0.82rem;color:var(--text-secondary)">${esc(r.nim)}</code></td>
      <td>${esc(r.namaMK)}</td>
      <td>${r.quiz}</td>
      <td>${r.uts}</td>
      <td>${r.uas}</td>
      <td><strong>${r.nilaiAkhir.toFixed(2)}</strong></td>
      <td><span class="grade-badge ${gradeClass(r.huruf)}">${esc(r.huruf)}</span></td>
    </tr>
  `).join('');
}


// ── MAIN TABLE ─────────────────────────────────
function renderMainTable() {
  const tbody = document.getElementById('main-tbody');
  if (!tbody) return;

  if (filteredData.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="12">${allData.length === 0 ? 'Belum ada data nilai.' : 'Tidak ada data yang cocok dengan filter.'}</td></tr>`;
    document.getElementById('row-count').textContent = '0 data ditemukan';
    return;
  }

  tbody.innerHTML = filteredData.map(r => `
    <tr>
      <td><strong>${esc(r.nama)}</strong><br><small style="color:var(--text-muted)">${esc(r.prodi)}</small></td>
      <td><code style="font-size:0.82rem">${esc(r.nim)}</code></td>
      <td><span style="background:rgba(124,111,247,0.1);color:var(--primary-light);padding:3px 10px;border-radius:20px;font-size:0.78rem;font-weight:600">Sem ${esc(r.semester)}</span></td>
      <td>${esc(r.namaMK)}<br><small style="color:var(--text-muted)">${esc(r.kodeMK)}</small></td>
      <td style="text-align:center">${r.sks}</td>
      <td style="font-size:0.82rem">${esc(r.dosen)}</td>
      <td style="text-align:center">${r.quiz}</td>
      <td style="text-align:center">${r.uts}</td>
      <td style="text-align:center">${r.uas}</td>
      <td style="text-align:center"><strong style="font-size:1rem">${r.nilaiAkhir.toFixed(2)}</strong></td>
      <td style="text-align:center"><span class="grade-badge ${gradeClass(r.huruf)}">${esc(r.huruf)}</span></td>
      <td>
        <button class="action-btn" onclick="askDelete('${r.id}')" title="Hapus">
          <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M19 6L18 20a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </td>
    </tr>
  `).join('');

  document.getElementById('row-count').textContent = filteredData.length + ' data ditemukan';
}

// ── FILTER & SORT ──────────────────────────────
function filterTable() {
  const q   = (document.getElementById('search-input').value || '').toLowerCase();
  const sem = document.getElementById('filter-semester').value;
  const hur = document.getElementById('filter-huruf').value;

  filteredData = allData.filter(r => {
    const matchQ = !q || [r.nama, r.nim, r.namaMK, r.kodeMK, r.dosen].some(v => v.toLowerCase().includes(q));
    const matchS = !sem || r.semester === sem;
    const matchH = !hur || r.huruf === hur;
    return matchQ && matchS && matchH;
  });

  if (sortKey) applySort();
  renderMainTable();
}

function sortTable(key) {
  if (sortKey === key) { sortAsc = !sortAsc; }
  else { sortKey = key; sortAsc = true; }
  applySort();
  renderMainTable();
}

function applySort() {
  filteredData.sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });
}

// ── DELETE ─────────────────────────────────────
function askDelete(id) {
  pendingDeleteId = id;
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
  pendingDeleteId = null;
}
async function confirmDelete() {
  if (!pendingDeleteId) return;
  try {
    if (DATA_MODE === 'local') {
      deleteFromLocal(pendingDeleteId);
      // Langsung hapus dari allData untuk update instan
      allData = allData.filter(x => String(x.id) !== String(pendingDeleteId));
      filteredData = [...allData];
      renderDashboard();
      renderMainTable();
      notifyDataChanged();
    } else {
      if (!API_URL) throw new Error('API URL belum terkonfigurasi');
      await postToSheets({ action: 'deleteGrade', id: pendingDeleteId });
      // Pastikan UI selalu pakai data terbaru
      await refreshUIFromLatestData();
    }

    toast('🗑️ Data berhasil dihapus', 'info');
    closeModal();
  } catch (err) {
    toast('❌ Gagal menghapus: ' + err.message, 'error');
  }
}


// ── PROFIL MAHASISWA ───────────────────────────
function getUniqueStudents() {
  // unik berdasarkan NIM
  const map = new Map();
  allData.forEach(r => {
    const nim = (r.nim || '').trim();
    if (!nim) return;
    if (!map.has(nim)) {
      map.set(nim, {
        nim,
        nama: r.nama || '-',
        prodi: r.prodi || '-',
      });
    }
  });
  return [...map.values()];
}

function resetMahasiswaProfile() {
  const profileEl = document.getElementById('student-profile');
  const emptyEl   = document.getElementById('nim-empty');
  const qInput    = document.getElementById('search-mahasiswa');
  const btnReset  = document.getElementById('reset-student-btn');
  const autoList  = document.getElementById('auto-mahasiswa');

  if (profileEl) profileEl.className = 'student-profile-hidden';
  if (emptyEl) { emptyEl.style.display = 'flex'; emptyEl.innerHTML = emptyEl.dataset.emptyHtml || emptyEl.innerHTML; }

  if (qInput) qInput.value = '';

  if (btnReset) btnReset.style.display = 'none';
  if (autoList) { autoList.innerHTML = ''; autoList.style.display = 'none'; }
}



function clearAutocomplete(listEl) {
  if (!listEl) return;
  listEl.innerHTML = '';
  listEl.style.display = 'none';
}

function selectStudentByNIM(nim) {
  const qEl = document.getElementById('search-mahasiswa');
  if (qEl) qEl.value = nim;

  // isi & tampilkan profil
  searchByNIM(nim);

  const autoList = document.getElementById('auto-mahasiswa');
  clearAutocomplete(autoList);
}

// Autocomplete: 1 input untuk nama/NIM (tampilkan SEMUA yang cocok)
function searchByMahasiswa() {
  const qEl = document.getElementById('search-mahasiswa');
  const q = (qEl ? qEl.value : '').trim();

  const profileEl = document.getElementById('student-profile');
  const emptyEl = document.getElementById('nim-empty');
  const btnReset = document.getElementById('reset-student-btn');
  const autoList = document.getElementById('auto-mahasiswa');

  if (!q) {
    if (profileEl) profileEl.className = 'student-profile-hidden';
    if (emptyEl) emptyEl.style.display = 'flex';
    if (btnReset) btnReset.style.display = 'none';
    if (autoList) { autoList.innerHTML = ''; autoList.style.display = 'none'; }
    return;
  }

  const query = q.toLowerCase();
  const students = getUniqueStudents();

  // tampilkan semua kecocokan (nama atau nim mengandung query)
  const matches = students.filter(s => {
    const nama = (s.nama || '').toLowerCase();
    const nim = (s.nim || '').toLowerCase();
    return nama.includes(query) || nim.includes(query);
  });

  if (matches.length === 0) {
    if (profileEl) profileEl.className = 'student-profile-hidden';
    if (emptyEl) {
      emptyEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="64" height="64" opacity="0.3"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><p>Mahasiswa dengan kata "<strong>${esc(q)}</strong>" tidak ditemukan.</p>`;
      emptyEl.style.display = 'flex';
    }
    if (autoList) { autoList.innerHTML = ''; autoList.style.display = 'none'; }
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (btnReset) btnReset.style.display = 'inline-flex';

  // dropdown
  if (autoList) {
    autoList.innerHTML = matches.map(s => `
      <li onclick="selectStudentByNIM('${esc(s.nim)}')">
        <div>
          <span style="color: var(--primary-light); font-weight: 950; font-size: 1rem;">${esc(s.nama)}</span>
        </div>
        <small style="color: var(--text-secondary); font-weight: 750;">${esc(s.nim)} — ${esc(s.prodi)}</small>
      </li>
    `).join('');
    autoList.style.display = 'block';
  }

  // bila mau langsung tampil profil saat mengetik, ambil yang pertama
  const chosenNim = String(matches[0].nim || '').trim();
  if (chosenNim) {
    const records = allData.filter(r => String(r.nim || '').trim() === chosenNim);
    renderStudentProfile(records);
  }
}

// tetap pakai renderStudentProfile yang sudah ada
function searchByNIM(qOverride) {
  const qEl = document.getElementById('search-mahasiswa');
  const q = (qOverride !== undefined ? String(qOverride) : (qEl ? qEl.value : '')).trim();

  const profileEl = document.getElementById('student-profile');
  const emptyEl = document.getElementById('nim-empty');

  if (!q) {
    if (profileEl) profileEl.className = 'student-profile-hidden';
    if (emptyEl) {
      emptyEl.innerHTML = emptyEl.dataset.emptyHtml || emptyEl.innerHTML;
      emptyEl.style.display = 'flex';
    }
    return;
  }

  const query = q.toLowerCase();
  const records = allData.filter(r => (r.nim || '').toLowerCase().includes(query));

  if (records.length === 0) {
    if (profileEl) profileEl.className = 'student-profile-hidden';
    if (emptyEl) {
      emptyEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="64" height="64" opacity="0.3"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><p>Mahasiswa dengan NIM "<strong>${esc(q)}</strong>" tidak ditemukan.</p>`;
      emptyEl.style.display = 'flex';
    }
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  const firstNim = String(records[0]?.nim || '').trim();
  const safe = firstNim
    ? records.filter(r => String(r.nim || '').trim() === firstNim)
    : records;

  renderStudentProfile(safe);
}

function renderStudentProfile(records) {

  const profileEl = document.getElementById('student-profile');
  const sample    = records[0];

  // reset & ringkas daftar autocomplete setelah terpilih
  const autoNim  = document.getElementById('auto-mahasiswa-nim');
  const autoNama = document.getElementById('auto-mahasiswa-nama');
  const btnReset  = document.getElementById('reset-student-btn');
  if (autoNim) autoNim.style.display = 'none';
  if (autoNama) autoNama.style.display = 'none';
  if (btnReset) btnReset.style.display = 'inline-flex';



  // Kelompokkan per mahasiswa (berdasarkan NIM) agar aman saat query mengembalikan banyak record
  const nimKey = (sample.nim || '').trim();
  const safeRecords = nimKey
    ? records.filter(r => String(r.nim || '').trim() === nimKey)
    : records;

  // Kelompokkan per semester untuk tampilan
  const bySemester = {};
  safeRecords.forEach(r => {
    const key = 'Semester ' + r.semester;
    if (!bySemester[key]) bySemester[key] = [];
    bySemester[key].push(r);
  });

  // Hitung IPK kumulatif weighted by SKS:
  // IPK = sum(bobot * SKS) / sum(SKS)
  const totalSks = safeRecords.reduce((s, r) => s + (Number(r.sks) || 0), 0);
  const totalMutu = safeRecords.reduce((s, r) => s + (Number(r.bobot) || 0) * (Number(r.sks) || 0), 0);
  const ipk = totalSks > 0 ? totalMutu / totalSks : 0;


  // IPS per semester
  const semesters = Object.entries(bySemester).sort();
  const ipsBlocks = semesters.map(([sem, recs]) => {
    const tm = recs.reduce((s, r) => s + r.bobot * r.sks, 0);
    const ts = recs.reduce((s, r) => s + r.sks, 0);
    const ips = ts > 0 ? tm / ts : 0;
    const rows = recs.map(r => `
      <tr>
        <td>${esc(r.namaMK)}</td>
        <td style="text-align:center">${esc(r.kodeMK)}</td>
        <td style="text-align:center">${r.sks}</td>
        <td style="text-align:center">${r.quiz} / ${r.uts} / ${r.uas}</td>
        <td style="text-align:center"><strong>${r.nilaiAkhir.toFixed(2)}</strong></td>
        <td style="text-align:center"><span class="grade-badge ${gradeClass(r.huruf)}">${esc(r.huruf)}</span></td>
        <td style="text-align:center">${r.bobot.toFixed(1)}</td>
      </tr>
    `).join('');
    return `
      <div class="semester-section">
        <div class="semester-title">${sem} &nbsp;|&nbsp; <span style="color:var(--secondary)">IPS: ${ips.toFixed(2)}</span></div>
        <div class="card" style="padding:0">
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Mata Kuliah</th><th>Kode</th><th>SKS</th><th>Quiz/UTS/UAS</th><th>Nilai</th><th>Huruf</th><th>Bobot</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const uniqueStudents = [...new Map(records.map(r => [r.nim, r])).values()];
  const student = uniqueStudents[0] || sample;

  profileEl.innerHTML = `
    <div class="profile-header-card">
      <div class="profile-avatar-big">${(student.nama || '?').charAt(0).toUpperCase()}</div>
      <div class="profile-info">
        <h2 style="color: var(--text-primary); font-weight: 900; font-size: 1.55rem;">${esc(student.nama)}</h2>
        <p style="color: var(--text-secondary); font-size: 0.95rem; font-weight: 650;">NIM: ${esc(student.nim)} &nbsp;|&nbsp; ${esc(student.prodi)}</p>
      </div>
    </div>



    <div class="ipk-ips-grid">
      <div class="ipk-ips-card">
        <div class="ipk-ips-label">IPK Kumulatif</div>
        <div class="ipk-ips-value">${ipk.toFixed(2)}</div>
        <div class="ipk-ips-sub">${predikat(ipk)}</div>
      </div>
      <div class="ipk-ips-card">
        <div class="ipk-ips-label">Total SKS</div>
        <div class="ipk-ips-value">${totalSks}</div>
        <div class="ipk-ips-sub">SKS ditempuh</div>
      </div>
      <div class="ipk-ips-card">
        <div class="ipk-ips-label">Mata Kuliah</div>
        <div class="ipk-ips-value">${records.length}</div>
        <div class="ipk-ips-sub">MK diinput</div>
      </div>
      <div class="ipk-ips-card">
        <div class="ipk-ips-label">Semester</div>
        <div class="ipk-ips-value">${semesters.length}</div>
        <div class="ipk-ips-sub">Semester ditempuh</div>
      </div>
    </div>

    ${ipsBlocks}
  `;
  profileEl.className = 'student-profile-visible';
}

// ── EXPORT CSV ─────────────────────────────────
function exportCSV() {
  if (filteredData.length === 0) { toast('Tidak ada data untuk diekspor', 'error'); return; }
  const headers = ['Nama','NIM','Semester','Program Studi','Mata Kuliah','Kode MK','SKS','Dosen','Quiz','UTS','UAS','Nilai Akhir','Huruf','Bobot'];
  const rows = filteredData.map(r => [
    r.nama, r.nim, 'Semester '+r.semester, r.prodi, r.namaMK, r.kodeMK, r.sks, r.dosen,
    r.quiz, r.uts, r.uas, r.nilaiAkhir.toFixed(2), r.huruf, r.bobot.toFixed(1)
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'nilai-mahasiswa.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('📄 CSV berhasil diekspor!', 'success');
}

// ── SAVE API URL ───────────────────────────────
async function saveApiUrl() {
  const val = document.getElementById('api-url-input').value.trim();
  const statusEl = document.getElementById('connection-status');
  if (!val || !val.startsWith('https://script.google.com')) {
    statusEl.className = 'conn-status conn-err';
    statusEl.textContent = '❌ URL tidak valid. Harus dimulai dengan https://script.google.com';
    return;
  }
  statusEl.className = 'conn-status';
  statusEl.textContent = '⏳ Mengecek koneksi…';
  try {
    const res  = await fetch(val + '?action=getGrades');
    const json = await res.json();
    if (json.success !== undefined) {
      API_URL = val;
      localStorage.setItem('sinilai_api_url', val);

      // Setelah URL tersimpan, switch ke mode sheets
      DATA_MODE = 'sheets';
      localStorage.setItem('sinilai_data_mode', DATA_MODE);

      statusEl.className = 'conn-status conn-ok';
      statusEl.textContent = '✅ Terhubung! Database Google Sheets siap digunakan.';
      await loadData();
      toast('✅ Terhubung!', 'success');
    } else {
      throw new Error('Respons tidak valid');
    }
  } catch (err) {
    statusEl.className = 'conn-status conn-err';
    statusEl.textContent = '❌ Gagal terhubung: ' + err.message + '. Pastikan Apps Script sudah di-deploy dengan akses "Anyone".';
  }
}


// ── COPY CODE ─────────────────────────────────
function copyCode(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent)
    .then(() => toast('📋 Kode berhasil disalin!', 'success'))
    .catch(() => toast('Gagal menyalin kode', 'error'));
}

// ── TOAST ──────────────────────────────────────
let toastTimer = null;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, 3500);
}

// ── AUTOCOMPLETE (MASTER DATA) ─────────────────
function handleInputSearch(type) {
  const inputEl = document.getElementById('f-' + type);
  const listEl  = document.getElementById('auto-' + type);
  if (!inputEl || !listEl) return;
  
  const val = inputEl.value.trim().toLowerCase();
  if (!val) {
    listEl.classList.remove('show');
    return;
  }

  let matches = [];
  if (type === 'nama') {
    const seen = new Set();
    allData.forEach(d => {
      if (!seen.has(d.nim) && d.nama.toLowerCase().includes(val)) {
        seen.add(d.nim); matches.push(d);
      }
    });
  }
  else if (type === 'nim') {
    const seen = new Set();
    allData.forEach(d => {
      if (!seen.has(d.nim) && d.nim.toLowerCase().includes(val)) {
        seen.add(d.nim); matches.push(d);
      }
    });
  }
  else if (type === 'mk') {
    const seen = new Set();
    allData.forEach(d => {
      if (!seen.has(d.kodeMK) && d.namaMK.toLowerCase().includes(val)) {
        seen.add(d.kodeMK); matches.push(d);
      }
    });
  }
  else if (type === 'dosen') {
    const seen = new Set();
    allData.forEach(d => {
      if (!seen.has(d.dosen) && d.dosen.toLowerCase().includes(val)) {
        seen.add(d.dosen); matches.push(d);
      }
    });
  }

  // Ambil max 5 hasil
  matches = matches.slice(0, 5);

  if (matches.length === 0) {
    listEl.classList.remove('show');
    return;
  }

  listEl.innerHTML = matches.map(d => {
    if (type === 'nama' || type === 'nim') {
      return `<li onmousedown="selectAutoMahasiswa('${esc(d.nama)}', '${esc(d.nim)}', '${esc(d.semester)}', '${esc(d.prodi)}')">
                ${esc(d.nama)} <small>${esc(d.nim)} - ${esc(d.prodi)}</small>
              </li>`;
    } else if (type === 'mk') {
      return `<li onmousedown="selectAutoMK('${esc(d.namaMK)}', '${esc(d.kodeMK)}', '${esc(d.sks)}', '${esc(d.dosen)}')">
                ${esc(d.namaMK)} <small>${esc(d.kodeMK)} (${d.sks} SKS)</small>
              </li>`;
    } else if (type === 'dosen') {
      return `<li onmousedown="selectAutoDosen('${esc(d.dosen)}')">
                ${esc(d.dosen)}
              </li>`;
    }
  }).join('');
  
  hideAllAutocomplete(); // Sembunyikan yang lain
  listEl.classList.add('show');
}

function selectAutoMahasiswa(nama, nim, sem, prodi) {
  document.getElementById('f-nama').value = nama;
  document.getElementById('f-nim').value = nim;
  document.getElementById('f-semester').value = sem;
  document.getElementById('f-prodi').value = prodi;
  hideAllAutocomplete();
  updatePreview();
}

function selectAutoMK(namaMK, kodeMK, sks, dosen) {
  document.getElementById('f-mk').value = namaMK;
  document.getElementById('f-kodemk').value = kodeMK;
  document.getElementById('f-sks').value = sks;
  if (!document.getElementById('f-dosen').value) {
    document.getElementById('f-dosen').value = dosen;
  }
  hideAllAutocomplete();
  updatePreview();
}

function selectAutoDosen(dosen) {
  document.getElementById('f-dosen').value = dosen;
  hideAllAutocomplete();
  updatePreview();
}

function hideAllAutocomplete() {
  document.querySelectorAll('.autocomplete-list').forEach(el => el.classList.remove('show'));
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.autocomplete-wrapper')) {
    hideAllAutocomplete();
  }
});

// ── ESCAPE HTML ────────────────────────────────
function esc(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

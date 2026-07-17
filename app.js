/* =============================================
   SiNilai – app.js
   Logic utama: kalkulasi nilai, UI, Google Sheets
   ============================================= */

'use strict';

// ── STATE ──────────────────────────────────────
let allData = [];      // semua data dari Google Sheets / localStorage
let filteredData = [];  // data setelah filter
let sortKey = null;
let sortAsc = true;
let pendingDeleteId = null;

// Mode data: Diubah menjadi 'sheets' secara default agar selalu terhubung ke Google Sheets
const storedMode = localStorage.getItem('sinilai_data_mode');
let DATA_MODE = storedMode || 'sheets';
if (storedMode !== 'local' && storedMode !== 'sheets') DATA_MODE = 'sheets';
localStorage.setItem('sinilai_data_mode', DATA_MODE);

// Ambil API URL dari localStorage (Pastikan Apps Script Anda sudah di-deploy dengan izin "Anyone")
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwFeWNvnlwSLrCVDV57VGqNKPVfwTo37CgaOZhlKzGqvvr9Jn_z8mLdGCNY_XBbq5cV/exec';
let API_URL = localStorage.getItem('sinilai_api_url') || DEFAULT_API_URL;

// Tetap simpan fallback localStorage key untuk sinkronisasi antar tab
const LS_GRADES_KEY = 'sinilai_grades_v1';
if (!localStorage.getItem(LS_GRADES_KEY)) {
  localStorage.setItem(LS_GRADES_KEY, JSON.stringify([]));
}

// ── BROADCAST CHANNEL (real-time cross-tab sync) ──────────────
let broadcastChannel = null;
try {
  broadcastChannel = new BroadcastChannel('sinilai_realtime_sync');
  broadcastChannel.onmessage = async (event) => {
    if (!isAuthed()) return;
    const msg = event.data;
    if (msg && msg.type === 'DATA_CHANGED') {
      if (DATA_MODE === "sheets") {
        await loadData();
      } else {
        const rows = loadFromLocal();
        allData = rows.map(mapRowToData);
        filteredData = [...allData];
        renderDashboard();
        renderMainTable();
      }
    }
  };
} catch (_) {
  // Fallback ke storage event jika browser lama
}

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
const LS_AUTH_KEY = 'sinilai_logged_in';

function debugAuthState(username, password) {
  try {
    console.debug('[SiNilai][auth]', {
      username,
      passProvided: !!password,
      authedBefore: isAuthed(),
    });
  } catch (_) {}
}

function isAuthed() {
  const v = localStorage.getItem(LS_AUTH_KEY);
  return v === 'true' || v === true;
}

function setAuthed(v) {
  try {
    localStorage.setItem(LS_AUTH_KEY, v ? 'true' : 'false');
  } catch (e) {}
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

  if (!authed) {
    const errEl = document.getElementById('login-error');
    if (errEl) errEl.style.display = 'none';
  }
}

function handleLogin(e) {
  e.preventDefault();
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

  if (username === AUTH_USER && password === AUTH_PASS) {
    setAuthed(true);
    try { showTab('dashboard'); } catch (_) {}
    toast('✅ Login berhasil!', 'success');
    loadData().then(() => {
      renderDashboard();
      renderMainTable();
      startRealtimeSync();
    });
    document.getElementById('main-content')?.focus?.();
    return;
  }

  if (errEl) {
    errEl.textContent = 'Username atau password salah.';
    errEl.style.display = 'block';
  }
  toast('❌ Login gagal', 'error');
}

function logout() {
  setAuthed(false);
  try {
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  } catch (_) {}
  toast('👋 Logout berhasil', 'info');
}

function fillDemoLogin() {
  const u = document.getElementById('login-username');
  const p = document.getElementById('login-password');
  if (u) u.value = AUTH_USER;
  if (p) p.value = AUTH_PASS;
}

// ── INIT ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyAuthUI();

  const emptyEl = document.getElementById('nim-empty');
  if (emptyEl && !emptyEl.dataset.emptyHtml) {
    emptyEl.dataset.emptyHtml = emptyEl.innerHTML;
  }

  const urlInput = document.getElementById('api-url-input');
  if (urlInput && DATA_MODE === 'sheets') {
    if (API_URL) urlInput.value = API_URL;
  }

  window.addEventListener('storage', (ev) => {
    if (!ev || ev.key !== LS_GRADES_KEY) return;
    if (!isAuthed()) return;
    if (DATA_MODE === 'local') {
      const rows = loadFromLocal();
      allData = rows.map(mapRowToData);
      filteredData = [...allData];
      renderDashboard();
      renderMainTable();
    }
  });

  document.getElementById('confirm-delete-btn')?.addEventListener('click', confirmDelete);

  if (isAuthed()) {
    loadData()
      .then(() => {
        renderDashboard();
        renderMainTable();
        startRealtimeSync();
        showTab('dashboard');

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

  const avatar = document.getElementById('prev-avatar');
  avatar.textContent = nama ? nama.charAt(0).toUpperCase() : '?';

  document.getElementById('prev-nama').textContent = nama || 'Nama Mahasiswa';
  document.getElementById('prev-nim').textContent  = nim ? 'NIM: ' + nim : 'NIM: –';
  document.getElementById('prev-mk').textContent   = mk ? 'Mata Kuliah: ' + mk : 'Mata Kuliah: –';
  document.getElementById('prev-dosen').textContent = dosen ? 'Dosen: ' + dosen : 'Dosen: –';

  const quiz = parseFloat(quizRaw);
  const uts  = parseFloat(utsRaw);
  const uas  = parseFloat(uasRaw);

  document.getElementById('prev-quiz').textContent = !isNaN(quiz) ? quiz.toFixed(0) : '–';
  document.getElementById('prev-uts').textContent  = !isNaN(uts)  ? uts.toFixed(0)  : '–';
  document.getElementById('prev-uas').textContent  = !isNaN(uas)  ? uas.toFixed(0)  : '–';

  updateBar('bar-quiz', quiz);
  updateBar('bar-uts',  uts);
  updateBar('bar-uas',  uas);

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

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;margin:0;border-width:2px;display:inline-block;vertical-align:middle"></div> Menyimpan…';

  try {
    const quiz = parseFloat(document.getElementById('f-quiz').value);
    const uts  = parseFloat(document.getElementById('f-uts').value);
    const uas  = parseFloat(document.getElementById('f-uas').value);

    if ([quiz, uts, uas].some(v => isNaN(v) || v < 0 || v > 100)) {
      toast('Nilai harus antara 0 – 100', 'error');
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Simpan Nilai`;
      return;
    }

    const nilaiAkhir = calcNilaiAkhir(quiz, uts, uas);
    const huruf      = nilaiToHuruf(nilaiAkhir);
    const bobot      = hurufToBobot(huruf);

    const payload = {
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

    // Update UI lokal instan agar user tidak menunggu loading kosong
    saveToLocal(payload);
    allData.push(mapRowToData(payload));
    filteredData = [...allData];
    renderDashboard();
    renderMainTable();
    notifyDataChanged();

    // Jalankan pengiriman ke Google Sheets
    if (DATA_MODE === 'sheets') {
      if (!API_URL || String(API_URL).trim().length === 0) {
        toast('❌ URL Apps Script belum terkonfigurasi. Setel di menu API Setup.', 'error');
        return;
      }
      const { id, timestamp, ...payloadSheets } = payload;
      const nonce = Date.now();
      payloadSheets._clientNonce = nonce;

      try {
        await postToSheets({ action: 'addGrade', ...payloadSheets });
        
        // Coba sinkronisasi ulang data terbaru dari Sheets secara berkala
        let loaded = false;
        for (let i = 0; i < 5; i++) {
          try {
            await new Promise(r => setTimeout(r, 650));
            await loadData();
            loaded = true;
            break;
          } catch (_) {}
        }
        if (!loaded) await loadData();
      } catch (err) {
        toast('❌ Gagal POST ke Sheets: ' + (err?.message || err), 'error');
        throw err;
      }
    }

    toast(`✅ Nilai berhasil disimpan!`, 'success');
    resetForm();

    // Pastikan UI terefresh total
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
    toast('❌ Gagal menyimpan ke penyimpanan lokal.', 'error');
  }
}

function deleteFromLocal(id) {
  const cur = loadFromLocal();
  const next = cur.filter(x => String(x.id) !== String(id));
  localStorage.setItem(LS_GRADES_KEY, JSON.stringify(next));
  notifyDataChanged();
}

// ── LOAD DATA ──────────────────────────────────
let realtimeTimer = null;

function startRealtimeSync() {
  if (realtimeTimer) clearInterval(realtimeTimer);
  // Polling data per 3 detik dari API Google Sheets agar visual sinkron
  realtimeTimer = setInterval(async () => {
    try {
      if (!isAuthed()) return;
      await loadData();
    } catch (_) {}
  }, 3000);
}

function stopRealtimeSync() {
  if (realtimeTimer) clearInterval(realtimeTimer);
  realtimeTimer = null;
}

async function refreshUIFromLatestData() {
  if (DATA_MODE === 'local') {
    await loadData();
    renderDashboard();
    renderMainTable();
    return;
  }

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
}

async function loadData() {
  try {
    if (DATA_MODE === 'local') {
      const rows = loadFromLocal();
      allData = rows.map(mapRowToData);
    } else {
      if (!API_URL) {
        toast('❌ Mode sheets aktif namun URL Google Sheets kosong.', 'error');
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
    toast('❌ Gagal memuat data dari Sheets: ' + err.message, 'error');
    console.warn('Gagal load data:', err.message);
    allData = [];
  }

  filteredData = [...allData];
  renderDashboard();
  renderMainTable();
}

// ── GOOGLE SHEETS POST ─────────────────────────
async function postToSheets(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  let text = '';
  try { text = await res.text(); } catch (_) {}

  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}

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
  
  const diff = newValue - currentValue;
  const steps = Math.min(Math.abs(diff) * 2, 20);
  const duration = 400;
  const stepTime = duration / steps;
  let step = 0;
  
  el.classList.add('stat-updated');
  
  const counter = setInterval(() => {
    step++;
    const progress = step / steps;
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
  const nims = [...new Set(allData.map(d => d.nim).filter(Boolean))];
  const statTotal = document.getElementById('stat-total');
  animateStatValue(statTotal, nims.length);

  const mks = [...new Set(allData.map(d => d.kodeMK).filter(Boolean))];
  const statMk = document.getElementById('stat-mk');
  animateStatValue(statMk, mks.length);

  const dosens = [...new Set(allData.map(d => (d.dosen || '').trim()).filter(Boolean))];
  const statDosen = document.getElementById('stat-dosen');
  animateStatValue(statDosen, dosens.length);

  const statTertinggi = document.getElementById('stat-tertinggi');
  if (allData.length > 0 && statTertinggi) {
    const maxNilai = Math.max(...allData.map(d => d.nilaiAkhir));
    animateStatValue(statTertinggi, maxNilai, true);
  } else if (statTertinggi) {
    statTertinggi.textContent = '0';
  }

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
      allData = allData.filter(x => String(x.id) !== String(pendingDeleteId));
      filteredData = [...allData];
      renderDashboard();
      renderMainTable();
      notifyDataChanged();
    } else {
      if (!API_URL) throw new Error('API URL belum terkonfigurasi');
      await postToSheets({ action: 'deleteGrade', id: pendingDeleteId });
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

  if (profileEl) profileEl.className = 'student-profile-hidden';
  if (emptyEl) { 
    emptyEl.style.display = 'flex'; 
    emptyEl.innerHTML = emptyEl.dataset.emptyHtml || emptyEl.innerHTML; 
  }
  if (qInput) qInput.value = '';
  if (btnReset) btnReset.style.display = 'none';
}

// Global binding untuk mempermudah pemanggilan via inline HTML
window.handleLogin = handleLogin;
window.logout = logout;
window.showTab = showTab;
window.toggleSidebar = toggleSidebar;
window.toggleTheme = toggleTheme;
window.submitGrade = submitGrade;
window.askDelete = askDelete;
window.closeModal = closeModal;
window.sortTable = sortTable;
window.filterTable = filterTable;

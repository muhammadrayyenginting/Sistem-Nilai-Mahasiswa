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

// Ambil API URL dari localStorage (default bisa diambil dari input bila kosong)
let API_URL = localStorage.getItem('sinilai_api_url') || '';

// ── INIT ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Isi & sinkronkan URL API
  // simpan template empty-state untuk reset
  const emptyEl = document.getElementById('nim-empty');
  if (emptyEl && !emptyEl.dataset.emptyHtml) {
    emptyEl.dataset.emptyHtml = emptyEl.innerHTML;
  }

  const urlInput = document.getElementById('api-url-input');
  if (urlInput) {
    // Jika localStorage kosong, pakai nilai default yang ada di input
    if (!API_URL && urlInput.value && urlInput.value.trim()) {
      API_URL = urlInput.value.trim();
      localStorage.setItem('sinilai_api_url', API_URL);
    } else if (API_URL) {
      urlInput.value = API_URL;
    }
  }

  // Muat data
  loadData();

  // Konfirmasi hapus
  document.getElementById('confirm-delete-btn').addEventListener('click', confirmDelete);
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
  e.preventDefault();
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

    if (!API_URL) {
      // Jika API belum terkonfigurasi, jangan kirim ke server
      toast('❌ API URL belum terkonfigurasi. Buka Dashboard → Koneksi Database → klik Simpan & Tes.', 'error');
      return;
    }

    // Kirim ke Google Sheets
    await postToSheets({ action: 'addGrade', ...payload });

    // Update state
    await loadData();
    toast('✅ Nilai berhasil disimpan!', 'success');
    resetForm();
    showTab('dashboard');

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

// ── LOAD DATA ──────────────────────────────────
async function loadData() {
  try {
    if (API_URL) {
      const res = await fetch(API_URL + '?action=getGrades');
      const json = await res.json();
      if (json.success) {
        allData = json.data.map(row => ({

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
        }));
      }
    } else {
      allData = getLocalData();
    }
  } catch (err) {
    // Jangan sembunyikan error kalau API sudah terkonfigurasi
    if (API_URL) {
      toast('❌ Gagal mengambil data dari Google Sheets: ' + err.message, 'error');
      console.warn('Gagal fetch Google Sheets:', err.message);
      allData = [];
    } else {
      allData = getLocalData();
    }
  }

  filteredData = [...allData];
  renderDashboard();
  renderMainTable();
}


// ── LOCAL STORAGE HELPERS ──────────────────────
function getLocalData() {
  try { return JSON.parse(localStorage.getItem('sinilai_data') || '[]'); }
  catch { return []; }
}
function setLocalData(data) {
  localStorage.setItem('sinilai_data', JSON.stringify(data));
}

// ── GOOGLE SHEETS POST ─────────────────────────
async function postToSheets(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Server error');
  return json;
}

// ── DASHBOARD ─────────────────────────────────
function renderDashboard() {
  // Stats
  const nims = [...new Set(allData.map(d => d.nim))];
  document.getElementById('stat-total').textContent = nims.length;

  const mks = [...new Set(allData.map(d => d.kodeMK))];
  document.getElementById('stat-mk').textContent = mks.length;

  if (allData.length > 0) {
    const avgAkhir = allData.reduce((s, d) => s + d.nilaiAkhir, 0) / allData.length;

    const maxNilai = Math.max(...allData.map(d => d.nilaiAkhir));

    document.getElementById('stat-tertinggi').textContent = maxNilai.toFixed(1);
  } else {
    document.getElementById('stat-tertinggi').textContent = '–';
  }


  // Recent table (5 terbaru)
  const recent = [...allData].reverse().slice(0, 5);
  const tbody  = document.getElementById('recent-tbody');
  if (recent.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Belum ada data. <a href="#" onclick="showTab('input');return false;">Input nilai pertama →</a></td></tr>`;
    return;
  }
  tbody.innerHTML = recent.map(r => `
    <tr>
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
    if (!API_URL) throw new Error('API URL belum terkonfigurasi');
    await postToSheets({ action: 'deleteGrade', id: pendingDeleteId });
    await loadData();
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
        <div style="font-weight:700">${esc(s.nama)}</div>
        <small>${esc(s.nim)} — ${esc(s.prodi)}</small>
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
        <h2>${esc(student.nama)}</h2>
        <p>NIM: ${esc(student.nim)} &nbsp;|&nbsp; ${esc(student.prodi)}</p>
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
      statusEl.className = 'conn-status conn-ok';
      statusEl.textContent = '✅ Terhubung! Database Google Sheets siap digunakan.';
      await loadData();
      toast('✅ Google Sheets terhubung!', 'success');
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

# SiNilai – Panduan Setup Google Sheets

## Deskripsi
Website ini menggunakan **Google Sheets** sebagai database gratis via **Google Apps Script** yang berfungsi sebagai REST API.

---

## Langkah-langkah Setup

### 1. Buat Google Spreadsheet
1. Buka [sheets.google.com](https://sheets.google.com)
2. Klik **"+ Kosong"** untuk membuat spreadsheet baru
3. Beri nama spreadsheet: **"Database Nilai Mahasiswa"**
4. Ganti nama sheet (tab bawah) dari *Sheet1* menjadi **Nilai**

### 2. Buka Google Apps Script
1. Di menu atas, klik **Extensions → Apps Script**
2. Hapus semua kode default di editor
3. Paste kode berikut:

```javascript
const SHEET_NAME = 'Nilai';

function doGet(e) {
  const action = e.parameter.action || 'getGrades';
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAME);

  if (action === 'getGrades') {
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return jsonResponse({ success: true, data: [] });
    }
    const headers = data[0];
    const rows = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
    return jsonResponse({ success: true, data: rows });
  }
  return jsonResponse({ success: false, error: 'Unknown action' });
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAME);

  if (payload.action === 'addGrade') {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['id','timestamp','nama','nim','semester',
        'prodi','namaMK','kodeMK','sks','dosen',
        'quiz','uts','uas','nilaiAkhir','huruf','bobot']);
    }
    const id = Utilities.getUuid();
    const ts = new Date().toISOString();
    sheet.appendRow([id, ts,
      payload.nama, payload.nim, payload.semester,
      payload.prodi, payload.namaMK, payload.kodeMK,
      payload.sks, payload.dosen,
      payload.quiz, payload.uts, payload.uas,
      payload.nilaiAkhir, payload.huruf, payload.bobot]);
    return jsonResponse({ success: true, id: id });
  }

  if (payload.action === 'deleteGrade') {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(payload.id)) {
        sheet.deleteRow(i + 1);
        return jsonResponse({ success: true });
      }
    }
    return jsonResponse({ success: false, error: 'Row not found' });
  }

  return jsonResponse({ success: false, error: 'Unknown action' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### 3. Deploy sebagai Web App
1. Klik tombol **"Deploy"** → **"New deployment"**
2. Klik ikon ⚙️ di sebelah "Select type" → pilih **"Web app"**
3. Isi pengaturan:
   - **Description**: SiNilai API
   - **Execute as**: **Me** (akun Google Anda)
   - **Who has access**: **Anyone**
4. Klik **"Deploy"**
5. Jika diminta izin akun, klik **"Authorize access"** dan ikuti langkahnya
6. Salin **Web App URL** yang muncul (format: `https://script.google.com/macros/s/…/exec`)

### 4. Hubungkan ke Website
1. Buka website SiNilai
2. Klik tab **"Panduan Setup"**
3. Paste URL di kolom input
4. Klik **"Simpan & Hubungkan"**
5. Jika berhasil, akan muncul ✅ konfirmasi

---

## Mode Offline (Tanpa Google Sheets)
Jika belum setup Google Sheets, website tetap berfungsi menggunakan **localStorage** browser sebagai penyimpanan sementara. Data akan hilang jika browser dibersihkan.

---

## Struktur Kolom Google Sheets
| Kolom | Keterangan |
|-------|-----------|
| id | ID unik (UUID) |
| timestamp | Waktu input |
| nama | Nama mahasiswa |
| nim | Nomor Induk Mahasiswa |
| semester | Nomor semester |
| prodi | Program studi |
| namaMK | Nama mata kuliah |
| kodeMK | Kode mata kuliah |
| sks | Jumlah SKS |
| dosen | Nama dosen pengampu |
| quiz | Nilai quiz/tugas (0-100) |
| uts | Nilai UTS (0-100) |
| uas | Nilai UAS (0-100) |
| nilaiAkhir | Nilai akhir kalkulasi |
| huruf | Grade huruf (A s/d E) |
| bobot | Bobot nilai (0.0 s/d 4.0) |

---

## Rumus Perhitungan
```
Nilai Akhir = (Quiz × 25%) + (UTS × 35%) + (UAS × 40%)
IPS         = Σ(Bobot × SKS per semester) / Σ(SKS per semester)
IPK         = Σ(Bobot × SKS semua semester) / Σ(SKS semua semester)
```

---

## Troubleshooting
- **"Gagal terhubung"**: Pastikan deploy menggunakan "Anyone" bukan "Anyone with Google account"
- **Data tidak muncul**: Refresh halaman atau klik tombol Refresh di tab Riwayat
- **Perubahan kode tidak aktif**: Buat deployment baru (Deploy → New deployment), jangan gunakan "Manage deployments"

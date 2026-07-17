/* =============================================
   _force_window_expose.js
   Fallback: memastikan semua fungsi tersedia 
   di scope global window.
   ============================================= */

// Verifikasi bahwa semua fungsi kritis sudah terdaftar di window
(function verifyGlobals() {
  const requiredFns = [
    'handleLogin', 'logout', 'showTab', 'toggleSidebar',
    'toggleTheme', 'submitGrade', 'resetForm', 'updatePreview',
    'loadData', 'filterTable', 'sortTable', 'exportCSV',
    'askDelete', 'closeModal', 'confirmDelete',
    'searchByMahasiswa', 'searchByNIM', 'selectStudentByNIM',
    'resetMahasiswaProfile', 'handleInputSearch',
    'selectAutoMahasiswa', 'selectAutoMK', 'selectAutoDosen',
    'saveApiUrl', 'copyCode'
  ];

  requiredFns.forEach(fn => {
    if (typeof window[fn] !== 'function') {
      console.warn(`[SiNilai] Fungsi global "${fn}" belum terdaftar di window.`);
    }
  });
})();

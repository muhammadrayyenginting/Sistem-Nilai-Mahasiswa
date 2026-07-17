/* =============================================
   attach-globals.js
   Meng-expose semua fungsi ke window supaya
   inline onclick/onsubmit di HTML bisa memanggil.
   ============================================= */

// Auth
window.handleLogin = handleLogin;
window.logout = logout;
window.fillDemoLogin = fillDemoLogin;

// Navigation
window.showTab = showTab;
window.toggleSidebar = toggleSidebar;
window.closeSidebarMobile = closeSidebarMobile;

// Theme
window.toggleTheme = toggleTheme;

// Form & Input
window.submitGrade = submitGrade;
window.resetForm = resetForm;
window.updatePreview = updatePreview;

// Data
window.loadData = loadData;
window.filterTable = filterTable;
window.sortTable = sortTable;
window.exportCSV = exportCSV;

// Delete
window.askDelete = askDelete;
window.closeModal = closeModal;
window.confirmDelete = confirmDelete;

// Profil Mahasiswa
window.searchByMahasiswa = searchByMahasiswa;
window.searchByNIM = searchByNIM;
window.selectStudentByNIM = selectStudentByNIM;
window.resetMahasiswaProfile = resetMahasiswaProfile;

// Autocomplete
window.handleInputSearch = handleInputSearch;
window.selectAutoMahasiswa = selectAutoMahasiswa;
window.selectAutoMK = selectAutoMK;
window.selectAutoDosen = selectAutoDosen;

// API Setup & Mode
window.saveApiUrl = saveApiUrl;
window.switchToLocal = switchToLocal;
window.migrateLocalToSheets = migrateLocalToSheets;
window.updateDataModeUI = updateDataModeUI;
window.copyCode = copyCode;

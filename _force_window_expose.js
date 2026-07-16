(function(){
  // Force expose functions so inline onclick/onsubmit works reliably
  function expose(name){
    try{
      if(typeof window[name] !== 'undefined') return;
    }catch(e){}
  }

  // Only expose if functions exist in current scope
  const map = {
    handleLogin: typeof handleLogin !== 'undefined' ? handleLogin : null,
    logout: typeof logout !== 'undefined' ? logout : null,
    showTab: typeof showTab !== 'undefined' ? showTab : null,
    toggleTheme: typeof toggleTheme !== 'undefined' ? toggleTheme : null,
    toggleSidebar: typeof toggleSidebar !== 'undefined' ? toggleSidebar : null,
    saveApiUrl: typeof saveApiUrl !== 'undefined' ? saveApiUrl : null,
    submitGrade: typeof submitGrade !== 'undefined' ? submitGrade : null,
    resetForm: typeof resetForm !== 'undefined' ? resetForm : null,
    exportCSV: typeof exportCSV !== 'undefined' ? exportCSV : null,
    loadData: typeof loadData !== 'undefined' ? loadData : null,
    confirmDelete: typeof confirmDelete !== 'undefined' ? confirmDelete : null,
    askDelete: typeof askDelete !== 'undefined' ? askDelete : null,
    closeModal: typeof closeModal !== 'undefined' ? closeModal : null,
    filterTable: typeof filterTable !== 'undefined' ? filterTable : null,
    sortTable: typeof sortTable !== 'undefined' ? sortTable : null,
    updatePreview: typeof updatePreview !== 'undefined' ? updatePreview : null,
    handleInputSearch: typeof handleInputSearch !== 'undefined' ? handleInputSearch : null,
    selectAutoMahasiswa: typeof selectAutoMahasiswa !== 'undefined' ? selectAutoMahasiswa : null,
    selectAutoMK: typeof selectAutoMK !== 'undefined' ? selectAutoMK : null,
    selectAutoDosen: typeof selectAutoDosen !== 'undefined' ? selectAutoDosen : null,
    hideAllAutocomplete: typeof hideAllAutocomplete !== 'undefined' ? hideAllAutocomplete : null,
    resetMahasiswaProfile: typeof resetMahasiswaProfile !== 'undefined' ? resetMahasiswaProfile : null,
    searchByMahasiswa: typeof searchByMahasiswa !== 'undefined' ? searchByMahasiswa : null,
    searchByNIM: typeof searchByNIM !== 'undefined' ? searchByNIM : null,
    renderStudentProfile: typeof renderStudentProfile !== 'undefined' ? renderStudentProfile : null,
    selectStudentByNIM: typeof selectStudentByNIM !== 'undefined' ? selectStudentByNIM : null,
    copyCode: typeof copyCode !== 'undefined' ? copyCode : null,
    toast: typeof toast !== 'undefined' ? toast : null
  };

  Object.keys(map).forEach(k => {
    const v = map[k];
    if (typeof v === 'function') window[k] = v;
  });
})();


(function(){
  // This runs AFTER app.js is loaded.
  // Expose inline handlers used by index.html.
  try { window.handleLogin = window.handleLogin || null; } catch(e) {}
  // If functions already exist as globals in app.js module scope, these assignments will fail silently.
  // However, we can reliably expose them only if they exist on window.

  const names = [
    'handleLogin','logout','showTab','toggleTheme','toggleSidebar',
    'saveApiUrl','submitGrade','resetForm','exportCSV','loadData'
  ];

  names.forEach(n => {
    if (typeof window[n] === 'undefined' || window[n] === null) {
      try {
        // app.js is loaded as classic script; functions declared in its top-level should be global.
        // This wrapper is mostly for safety.
        window[n] = window[n];
      } catch(e) {}
    }
  });
})();


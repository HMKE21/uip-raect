/* Redirect target of the OneDrive pop-up (see src/lib/cloud/microsoft.js). External file because the CSP only allows script-src 'self'. */
(function () {
  try { if (window.opener) window.opener.postMessage({ type: 'uip-ms-auth', search: window.location.search }, window.location.origin); } catch (e) { /* opener gone */ }
  setTimeout(function () { window.close(); }, 150);
})();

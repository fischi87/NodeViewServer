// device.js – erkennt Handy / Tablet / PC und setzt <html data-device="...">.
// Wird synchron im <head> geladen, damit die richtige Darstellung ohne Flackern erscheint.
// Der Nutzer kann die Erkennung in den Einstellungen überschreiben (Auto / Handy / PC).
(function () {
  var KEY = 'viewMode'; // 'auto' | 'mobile' | 'desktop'

  function stored() {
    try { return localStorage.getItem(KEY) || 'auto'; } catch (_) { return 'auto'; }
  }

  function detect() {
    var w = window.innerWidth;
    var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    // kürzere Bildschirmkante: erkennt Handys auch im Querformat
    var shortSide = Math.min(screen.width || w, screen.height || w);

    if (w <= 720 || (coarse && shortSide < 600)) return 'mobile';
    if ((coarse && w <= 1100) || w <= 900) return 'tablet';
    return 'desktop';
  }

  function apply() {
    var mode = stored();
    var device = mode === 'mobile' || mode === 'desktop' ? mode : detect();
    var root = document.documentElement;
    if (root.dataset.device !== device) root.dataset.device = device;
    root.dataset.viewMode = mode;
  }

  window.NVS = window.NVS || {};
  window.NVS.getViewMode = stored;
  window.NVS.setViewMode = function (mode) {
    try { localStorage.setItem(KEY, mode); } catch (_) { /* ignorieren */ }
    apply();
  };

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
})();

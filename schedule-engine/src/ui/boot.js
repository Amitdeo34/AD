/* Schedule Engine - ui/boot.js : wiring & start-up */
(function () {
  'use strict';
  const { S, $, $$ } = UI;

  function init() {
    let theme = 'kpmg';
    try { theme = localStorage.getItem('se.theme') || 'kpmg'; } catch (e) { /* ignore */ }
    $('#themeSel').value = theme;
    UI.setTheme(theme);
    $('#themeSel').onchange = () => UI.setTheme($('#themeSel').value);
    UI.buildRibbon();
    UI.bindSide();
    UI.grid.bind();
    UI.gantt.bind();
    $$('#vtabs button[data-view]').forEach((b) => { b.onclick = () => { if (S.P) UI.setView(b.dataset.view); }; });
    $('#ddChip').onclick = () => { if (S.P) UI.dataDateDialog(); };
    $('#schedChip').onclick = () => { if (S.P && !S.P.settings.scheduled) UI.runSchedule(); };
    $('#schedChip').style.cursor = 'pointer';
    $('#helpBtn').onclick = () => UI.help();
    const ask = $('#ask');
    ask.addEventListener('keydown', (e) => { if (e.key === 'Enter' && S.P) UI.doAsk(ask.value); if (e.key === 'Escape') { ask.value = ''; if (S.P && S.ask) UI.doAsk(''); ask.blur(); } });
    ask.addEventListener('search', () => { if (S.P && !ask.value) UI.doAsk(''); });
    $('#fileIn').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) UI.io.openFile(f, e.target.dataset.mode); });
    document.addEventListener('dragover', (e) => { if (S.P) e.preventDefault(); });
    document.addEventListener('drop', (e) => { if (!S.P) return; e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) UI.io.openFile(f); });
    document.addEventListener('keydown', (e) => {
      const inField = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
      const k = e.key.toLowerCase();
      if (e.key === 'F9') { e.preventDefault(); if (S.P) UI.runSchedule(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); if (S.P) UI.io.saveProject(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'o') { e.preventDefault(); UI.io.pickFile(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'e') { e.preventDefault(); if (S.P) UI.io.exportDialog(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'f') { e.preventDefault(); ask.focus(); ask.select(); return; }
      if (inField) return;
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (S.P) UI.undo(); }
      if ((e.ctrlKey || e.metaKey) && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); if (S.P) UI.redo(); }
    });
    window.addEventListener('beforeunload', () => { if (S.P) UI.io.autosave(); });
    try { const v = localStorage.getItem('se.view'); if (v && v !== 'gantt') S.view = v; } catch (e) { /* ignore */ }
    if (typeof pdfjsLib !== 'undefined' && !(globalThis.pdfjsWorker && globalThis.pdfjsWorker.WorkerMessageHandler)) {
      try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js'; } catch (e) { /* ignore */ }
    }
    UI.io.renderWelcome();
    // views other than gantt start hidden
    $$('.view').forEach((el) => { el.hidden = el.id !== 'view-' + S.view; });
    $$('#vtabs button[data-view]').forEach((b) => b.setAttribute('aria-selected', b.dataset.view === S.view ? 'true' : 'false'));
    if (/[#&]demo\b/.test(location.hash)) UI.io.loadDemo();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

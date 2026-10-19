// Aplica o tema salvo antes da primeira pintura (evita piscar o tema errado).
// Script clássico e bloqueante no <head>; a lógica completa fica em js/theme.js.
(function () {
    var pref = 'system';
    try { pref = localStorage.getItem('caramelotex.theme') || 'system'; } catch (e) { /* sem storage */ }
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();

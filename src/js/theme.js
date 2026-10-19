/**
 * theme.js - Fontes embutidas e tema claro/escuro (segue o Windows por padrão).
 * Importado por todas as páginas.
 */
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '../styles/theme.css';

const KEY = 'caramelotex.theme';
const ORDER = ['system', 'light', 'dark'];
const LABELS = { system: 'Tema: igual ao Windows', light: 'Tema: claro', dark: 'Tema: escuro' };
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePref() {
    try {
        return localStorage.getItem(KEY) || 'system';
    } catch {
        return 'system';
    }
}

function apply(pref) {
    const dark = pref === 'dark' || (pref === 'system' && media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** Alterna sistema -> claro -> escuro e devolve o rótulo da nova escolha. */
export function cycleTheme() {
    const next = ORDER[(ORDER.indexOf(getThemePref()) + 1) % ORDER.length];
    try {
        localStorage.setItem(KEY, next);
    } catch { /* sem storage: vale só nesta sessão */ }
    apply(next);
    return LABELS[next];
}

export function themeLabel() {
    return LABELS[getThemePref()];
}

media.addEventListener('change', () => {
    if (getThemePref() === 'system') apply('system');
});

apply(getThemePref());

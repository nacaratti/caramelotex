/**
 * updater.js - Avisa quando há uma versão nova do CarameloTeX.
 *
 * Consulta a release mais recente na API pública do GitHub (uma vez por
 * sessão, se a opção estiver ligada) e compara com a versão instalada. Se
 * houver versão nova, mostra um aviso no canto da janela; o botão "Baixar"
 * abre o download do instalador no navegador, e a pessoa instala quando quiser.
 */
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { el, openDialog } from './dialogs.js';

const PREF = 'caramelotex.autoUpdate';
const CHECKED = 'caramelotex.updateChecked';
const DISMISSED = 'caramelotex.updateDismissed';
const LATEST_API = 'https://api.github.com/repos/nacaratti/caramelotex/releases/latest';
const INSTALLER = 'CarameloTeX-setup-x64.exe';

function read(storage, key) {
    try {
        return storage.getItem(key);
    } catch {
        return null;
    }
}

function write(storage, key, value) {
    try {
        storage.setItem(key, value);
    } catch { /* sem storage */ }
}

export function autoUpdateEnabled() {
    return read(localStorage, PREF) !== 'off';
}

export function setAutoUpdate(enabled) {
    write(localStorage, PREF, enabled ? 'on' : 'off');
}

/** "0.3.10" > "0.3.9": compara número a número. */
function isNewer(candidate, current) {
    const a = candidate.split('.').map(n => parseInt(n, 10) || 0);
    const b = current.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    }
    return false;
}

/**
 * Consulta o GitHub. Devolve { version, notesUrl, downloadUrl } se houver
 * versão mais nova que a instalada, ou null.
 */
export async function findUpdate() {
    const response = await fetch(LATEST_API, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`GitHub respondeu ${response.status}`);
    const release = await response.json();
    const version = String(release.tag_name || '').replace(/^v/, '');
    const current = await getVersion();
    if (!version || !isNewer(version, current)) return null;
    const asset = (release.assets || []).find(a => a.name === INSTALLER);
    return {
        version,
        notesUrl: release.html_url,
        downloadUrl: asset ? asset.browser_download_url : release.html_url,
    };
}

let card = null;

/** Mostra o aviso de versão nova no canto da janela. */
export function showUpdateCard(update) {
    card?.remove();
    const notes = el('button', { class: 'update-link', type: 'button', text: 'Ver novidades' });
    const download = el('button', { class: 'btn btn-primary', type: 'button', text: 'Baixar' });
    const later = el('button', { class: 'btn', type: 'button', text: 'Depois' });
    const text = el('p', {
        class: 'update-text',
        text: `A versão ${update.version} do CarameloTeX está disponível. Baixe e instale por cima da atual; seus projetos e configurações continuam.`,
    });
    card = el('div', { class: 'update-card', role: 'status', 'aria-live': 'polite' }, [
        el('div', { class: 'update-icon', 'aria-hidden': 'true' }),
        el('div', { class: 'update-body' }, [
            el('p', { class: 'update-title', text: 'Nova versão disponível' }),
            text,
            notes,
            el('div', { class: 'update-actions' }, [later, download]),
        ]),
    ]);
    card.querySelector('.update-icon').innerHTML =
        '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/></svg>';

    const close = () => {
        write(sessionStorage, DISMISSED, update.version);
        card.remove();
        card = null;
    };
    notes.addEventListener('click', () => openUrl(update.notesUrl).catch(() => {}));
    later.addEventListener('click', close);
    download.addEventListener('click', () => {
        openUrl(update.downloadUrl).catch(() => {});
        text.textContent = 'O download começou no navegador. Quando terminar, feche o CarameloTeX e abra o instalador.';
        download.remove();
        later.textContent = 'Fechar';
    });
    document.body.appendChild(card);
}

/** Janela "Atualizações": versão atual, liga/desliga e "Procurar agora". */
export async function openUpdateSettings() {
    const version = await getVersion().catch(() => '?');
    const toggle = el('input', { type: 'checkbox', class: 'mt-1' });
    toggle.checked = autoUpdateEnabled();
    toggle.addEventListener('change', () => setAutoUpdate(toggle.checked));
    const result = el('p', { class: 'text-sm text-muted', text: '' });
    const checkNow = el('button', { class: 'btn', type: 'button', text: 'Procurar agora' });
    checkNow.addEventListener('click', async () => {
        checkNow.disabled = true;
        result.textContent = 'Procurando...';
        try {
            const update = await findUpdate();
            if (update) {
                result.textContent = `A versão ${update.version} está disponível.`;
                showUpdateCard(update);
            } else {
                result.textContent = 'Você já está na versão mais recente.';
            }
        } catch (e) {
            result.textContent = 'Não foi possível consultar as versões agora. Tente mais tarde.';
            console.warn(e);
        } finally {
            checkNow.disabled = false;
        }
    });

    openDialog({
        title: 'Atualizações',
        confirmLabel: 'Fechar',
        cancelLabel: null,
        body: [
            el('p', { class: 'text-sm', text: `Você está usando o CarameloTeX ${version}.` }),
            el('label', { class: 'flex items-start gap-2 text-sm cursor-pointer' }, [
                toggle,
                el('span', {}, [
                    el('span', { class: 'block font-medium', text: 'Avisar quando houver versão nova' }),
                    el('span', {
                        class: 'block text-xs text-muted',
                        text: 'Ao abrir, o CarameloTeX consulta a página de versões no GitHub. Nada é baixado sem você pedir, e nenhum dado seu ou dos seus documentos é enviado.',
                    }),
                ]),
            ]),
            el('div', { class: 'flex items-center gap-3' }, [checkNow, result]),
        ],
    });
}

/**
 * Procura versão nova ao abrir (uma vez por sessão, se a opção estiver
 * ligada) e mostra o aviso. Erros de rede são ignorados em silêncio.
 */
export async function startUpdateCheck() {
    if (!autoUpdateEnabled() || read(sessionStorage, CHECKED) === 'none') return;
    try {
        const update = await findUpdate();
        if (!update) {
            write(sessionStorage, CHECKED, 'none');
            return;
        }
        write(sessionStorage, CHECKED, update.version);
        if (read(sessionStorage, DISMISSED) === update.version) return;
        showUpdateCard(update);
    } catch (e) {
        console.warn('Não foi possível procurar atualizações:', e);
    }
}

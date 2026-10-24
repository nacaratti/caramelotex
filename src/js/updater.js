/**
 * updater.js - Procura versões novas do CarameloTeX (plugin updater do Tauri)
 * e mostra um aviso no canto da janela para reiniciar e atualizar.
 *
 * A consulta é um arquivo pequeno (latest.json) na página de releases do
 * GitHub, feita uma vez por sessão e só se a opção estiver ligada. O
 * instalador baixado é conferido pela assinatura do atualizador.
 */
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { el, openDialog } from './dialogs.js';

const PREF = 'caramelotex.autoUpdate';
const CHECKED = 'caramelotex.updateChecked';
const DISMISSED = 'caramelotex.updateDismissed';
const RELEASES_URL = 'https://github.com/nacaratti/caramelotex/releases';

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

export function currentVersion() {
    return getVersion();
}

/** Consulta o GitHub. Devolve o objeto de atualização ou null. */
export async function findUpdate() {
    return check({ timeout: 15000 });
}

let card = null;

/**
 * Mostra o aviso de atualização.
 * @param {object} update - resultado do check()
 * @param {() => Promise<void>} [beforeInstall] - ex.: salvar o projeto aberto
 */
export function showUpdateCard(update, beforeInstall) {
    card?.remove();
    const title = el('p', { class: 'update-title', text: 'Atualização disponível' });
    const text = el('p', { class: 'update-text', text: `A versão ${update.version} do CarameloTeX está pronta para instalar.` });
    const notes = el('button', { class: 'update-link', type: 'button', text: 'Ver novidades' });
    const progress = el('div', { class: 'update-progress hidden' }, el('div', { class: 'update-progress-bar' }));
    const install = el('button', { class: 'btn btn-primary', type: 'button', text: 'Reiniciar e atualizar' });
    const later = el('button', { class: 'btn', type: 'button', text: 'Depois' });
    const actions = el('div', { class: 'update-actions' }, [later, install]);
    card = el('div', { class: 'update-card', role: 'status', 'aria-live': 'polite' }, [
        el('div', { class: 'update-icon', 'aria-hidden': 'true' }),
        el('div', { class: 'update-body' }, [title, text, notes, progress, actions]),
    ]);
    card.querySelector('.update-icon').innerHTML =
        '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/></svg>';

    notes.addEventListener('click', () => openUrl(`${RELEASES_URL}/tag/v${update.version}`).catch(() => {}));
    later.addEventListener('click', () => {
        write(sessionStorage, DISMISSED, update.version);
        card.remove();
        card = null;
    });
    install.addEventListener('click', async () => {
        install.disabled = true;
        later.disabled = true;
        notes.classList.add('hidden');
        progress.classList.remove('hidden');
        const bar = progress.firstChild;
        let total = 0;
        let received = 0;
        try {
            if (beforeInstall) await beforeInstall();
            text.textContent = 'Baixando a atualização...';
            await update.downloadAndInstall((event) => {
                if (event.event === 'Started') total = event.data.contentLength || 0;
                if (event.event === 'Progress') {
                    received += event.data.chunkLength;
                    if (total) {
                        const pct = Math.min(100, Math.round((received / total) * 100));
                        bar.style.width = `${pct}%`;
                        text.textContent = `Baixando a atualização... ${pct}%`;
                    }
                }
                if (event.event === 'Finished') text.textContent = 'Instalando e reiniciando...';
            });
            // No Windows o instalador fecha o app sozinho; nos outros, reinicia
            await relaunch();
        } catch (e) {
            console.error('Falha na atualização:', e);
            title.textContent = 'Não foi possível atualizar';
            text.textContent = 'Verifique a internet e tente de novo, ou baixe a versão nova no site.';
            progress.classList.add('hidden');
            install.disabled = false;
            later.disabled = false;
            install.textContent = 'Tentar de novo';
        }
    });
    document.body.appendChild(card);
}

/** Janela "Atualizações": versão atual, liga/desliga e "Procurar agora". */
export async function openUpdateSettings() {
    const version = await currentVersion().catch(() => '?');
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
                    el('span', { class: 'block font-medium', text: 'Procurar atualizações ao abrir o programa' }),
                    el('span', {
                        class: 'block text-xs text-muted',
                        text: 'O CarameloTeX consulta a página de versões no GitHub. Nenhum dado seu ou dos seus documentos é enviado.',
                    }),
                ]),
            ]),
            el('div', { class: 'flex items-center gap-3' }, [checkNow, result]),
        ],
    });
}

/**
 * Procura atualização ao abrir (uma vez por sessão, se a opção estiver
 * ligada) e mostra o aviso. Erros de rede são ignorados em silêncio.
 */
export async function startUpdateCheck({ beforeInstall } = {}) {
    if (!autoUpdateEnabled() || read(sessionStorage, CHECKED) === 'none') return;
    try {
        const update = await findUpdate();
        if (!update) {
            write(sessionStorage, CHECKED, 'none');
            return;
        }
        write(sessionStorage, CHECKED, update.version);
        if (read(sessionStorage, DISMISSED) === update.version) return;
        showUpdateCard(update, beforeInstall);
    } catch (e) {
        console.warn('Não foi possível procurar atualizações:', e);
    }
}

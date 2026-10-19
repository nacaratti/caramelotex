/**
 * packages-dialog.js - Janela "Pacotes LaTeX": ver o que o documento usa e o
 * que está instalado, buscar no repositório do TeX Live e instalar.
 *
 * A lista de instalados funciona offline; a busca e a instalação precisam de
 * internet (o tlmgr consulta o repositório do TeX Live).
 */
import { el, openDialog, INPUT_CLASS } from './dialogs.js';
import { StorageService } from './storage.js';

const MAX_RESULTS = 120;

// Listas guardadas durante a sessão (a do repositório demora alguns segundos)
let installedCache = null;
let remoteCache = null;

function stripComments(text) {
    return text.split('\n').map(line => line.replace(/(^|[^\\])%.*$/, '$1')).join('\n');
}

/** Pacotes e classe que o projeto pede: [{ name, file }]. */
function requestedPackages(files) {
    const found = new Map();
    for (const file of Object.values(files)) {
        if (typeof file.content !== 'string') continue;
        const text = stripComments(file.content);
        for (const m of text.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) {
            for (const name of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
                found.set(name, { name, file: `${name}.sty`, kind: 'Pacote' });
            }
        }
        for (const m of text.matchAll(/\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) {
            const name = m[1].trim();
            found.set(`cls:${name}`, { name, file: `${name}.cls`, kind: 'Classe' });
        }
    }
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function chip(text, tone) {
    return el('span', { class: `pkg-chip pkg-chip-${tone}`, text });
}

function row({ name, description, right }) {
    return el('div', { class: 'pkg-row' }, [
        el('div', { class: 'min-w-0 flex-1' }, [
            el('p', { class: 'font-mono text-sm font-medium truncate', text: name }),
            description ? el('p', { class: 'text-xs text-muted truncate', text: description, title: description }) : null,
        ]),
        el('div', { class: 'flex items-center gap-2 flex-shrink-0' }, [].concat(right)),
    ]);
}

function message(text, tone = 'muted') {
    return el('p', { class: `text-sm py-6 text-center ${tone === 'error' ? 'text-danger' : 'text-muted'}`, text });
}

/**
 * @param {object} options
 * @param {object} options.files - arquivos do projeto (com o conteúdo atual)
 * @param {(packages: string[]) => Promise<void>} options.addToPreamble
 * @param {(text: string, type?: string) => void} options.toast
 */
export function openPackagesDialog({ files, addToPreamble, toast }) {
    const summary = el('p', { class: 'text-sm text-muted', text: 'Verificando os pacotes instalados...' });
    const tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Pacotes' });
    const panel = el('div', { class: 'pkg-panel', role: 'tabpanel' });

    /** Botão que instala e depois troca para "Instalado" + "Usar no documento". */
    function installButton(name, { viaFile = null, onDone } = {}) {
        const btn = el('button', { class: 'btn pkg-install', type: 'button', text: 'Instalar' });
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Instalando...';
            try {
                const pkg = viaFile ? await StorageService.installMissingFile(viaFile) : (await StorageService.installTexPackage(name), name);
                installedCache = null;
                refreshSummary();
                if (remoteCache) {
                    const entry = remoteCache.find(p => p.name === pkg);
                    if (entry) entry.installed = true;
                }
                toast(`Pacote "${pkg}" instalado`, 'success');
                if (onDone) onDone(pkg);
                else btn.replaceWith(chip('Instalado', 'ok'), useButton(name));
            } catch (e) {
                btn.disabled = false;
                btn.textContent = 'Tentar de novo';
                toast(String(e).split('\n')[0], 'error');
            }
        });
        return btn;
    }

    function useButton(name) {
        const btn = el('button', { class: 'btn', type: 'button', text: 'Usar no documento', title: `Adiciona \\usepackage{${name}} ao preâmbulo` });
        btn.addEventListener('click', async () => {
            await addToPreamble([name]);
            btn.disabled = true;
            btn.textContent = 'Adicionado';
        });
        return btn;
    }

    // ---- Aba: neste documento ----
    async function showDocument() {
        const requested = requestedPackages(files);
        if (!requested.length) {
            panel.replaceChildren(message('O documento ainda não usa nenhum pacote (\\usepackage).'));
            return;
        }
        panel.replaceChildren(message('Verificando...'));
        let present;
        try {
            present = new Set(await StorageService.checkTexFiles(requested.map(r => r.file)));
        } catch (e) {
            panel.replaceChildren(message(String(e), 'error'));
            return;
        }
        const missing = requested.filter(r => !present.has(r.file)).length;
        panel.replaceChildren(
            el('p', { class: 'text-sm mb-2', text: missing
                ? `${missing} de ${requested.length} não ${missing === 1 ? 'está instalado' : 'estão instalados'}. A instalação precisa de internet.`
                : `Todos os ${requested.length} pacotes usados pelo documento estão instalados.` }),
            ...requested.map(r => row({
                name: r.name,
                description: r.kind === 'Classe' ? 'Classe do documento (\\documentclass)' : null,
                right: present.has(r.file)
                    ? chip('Instalado', 'ok')
                    : [chip('Faltando', 'missing'), installButton(r.name, {
                        viaFile: r.file,
                        onDone: () => showDocument(),
                    })],
            })),
        );
    }

    // ---- Aba: instalados ----
    async function showInstalled() {
        const filter = el('input', { class: INPUT_CLASS, type: 'search', placeholder: 'Filtrar pelos instalados', 'aria-label': 'Filtrar pacotes instalados' });
        const list = el('div', { class: 'pkg-list' });
        panel.replaceChildren(filter, list);
        list.replaceChildren(message('Carregando...'));
        try {
            installedCache = installedCache || await StorageService.listTexPackages(false);
        } catch (e) {
            list.replaceChildren(message(String(e), 'error'));
            return;
        }
        const render = () => {
            const q = filter.value.trim().toLowerCase();
            const items = installedCache.filter(p => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
            list.replaceChildren(
                el('p', { class: 'text-xs text-muted mb-1', text: `${items.length} de ${installedCache.length} pacotes` }),
                ...items.slice(0, 300).map(p => row({ name: p.name, description: p.description, right: [] })),
            );
        };
        filter.addEventListener('input', render);
        render();
        filter.focus();
    }

    // ---- Aba: buscar e instalar ----
    async function showSearch() {
        const query = el('input', { class: INPUT_CLASS, type: 'search', placeholder: 'Nome ou assunto, em inglês (ex.: units, feynman, chemistry, abnt)', 'aria-label': 'Buscar pacotes' });
        const list = el('div', { class: 'pkg-list' });
        panel.replaceChildren(query, list);
        if (!remoteCache) {
            list.replaceChildren(message('Consultando o repositório do TeX Live (precisa de internet, leva alguns segundos)...'));
            try {
                remoteCache = await StorageService.listTexPackages(true);
            } catch (e) {
                list.replaceChildren(message('Sem acesso ao repositório. Verifique a internet e abra esta aba de novo.', 'error'));
                return;
            }
        }
        const render = () => {
            const q = query.value.trim().toLowerCase();
            if (!q) {
                list.replaceChildren(message(`${remoteCache.length.toLocaleString('pt-BR')} pacotes no repositório. Digite para buscar.`));
                return;
            }
            // Nome exato primeiro, depois nome que contém, depois descrição
            const score = (p) => p.name.toLowerCase() === q ? 0 : p.name.toLowerCase().includes(q) ? 1 : 2;
            const items = remoteCache
                .filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
                .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
            list.replaceChildren(
                el('p', { class: 'text-xs text-muted mb-1', text: items.length > MAX_RESULTS
                    ? `${items.length} resultados; mostrando os ${MAX_RESULTS} primeiros`
                    : `${items.length} ${items.length === 1 ? 'resultado' : 'resultados'}` }),
                ...items.slice(0, MAX_RESULTS).map(p => row({
                    name: p.name,
                    description: p.description,
                    right: p.installed ? [chip('Instalado', 'ok'), useButton(p.name)] : installButton(p.name),
                })),
            );
        };
        let timer = null;
        query.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(render, 150);
        });
        render();
        query.focus();
    }

    const TABS = [
        ['Neste documento', showDocument],
        ['Instalados', showInstalled],
        ['Buscar e instalar', showSearch],
    ];
    TABS.forEach(([label, show], index) => {
        const tab = el('button', { type: 'button', class: 'tab', role: 'tab', text: label });
        tab.addEventListener('click', () => {
            [...tabs.children].forEach((t, i) => t.setAttribute('aria-selected', String(i === index)));
            show();
        });
        tabs.appendChild(tab);
    });
    tabs.children[0].setAttribute('aria-selected', 'true');

    openDialog({
        title: 'Pacotes LaTeX',
        confirmLabel: 'Fechar',
        cancelLabel: null,
        wide: true,
        body: [summary, tabs, panel],
    });

    function refreshSummary() {
        StorageService.listTexPackages(false)
            .then((list) => {
                installedCache = list;
                summary.textContent = `${list.length} pacotes instalados no LaTeX embutido. Os pacotes ficam disponíveis para todos os projetos.`;
            })
            .catch((e) => {
                summary.textContent = String(e).split('\n')[0];
                summary.className = 'text-sm text-danger';
            });
    }

    showDocument();
    refreshSummary();
}

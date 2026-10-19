/**
 * projects-page.js - Tela inicial: abrir pasta, novo projeto, importar ZIP e recentes.
 */
import './theme.js';
import { StorageService } from './storage.js';
import { escapeHtml, showToast } from './ui.js';
import { cycleTheme, themeLabel } from './theme.js';

document.addEventListener('DOMContentLoaded', async () => {
    const themeBtn = document.getElementById('themeBtn');
    themeBtn.title = themeLabel();
    themeBtn.addEventListener('click', () => { themeBtn.title = cycleTheme(); });

    document.getElementById('openFolderBtn').addEventListener('click', openFolder);
    document.getElementById('importZipBtn').addEventListener('click', () => document.getElementById('zipInput').click());
    document.getElementById('zipInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) importZip(e.target.files[0]);
        e.target.value = '';
    });

    await renderProjects();
    await prepareTex();
});

async function prepareTex() {
    const status = document.getElementById('texStatus');
    const overlay = document.getElementById('setupOverlay');
    const bar = document.getElementById('setupProgress');
    try {
        const tex = await StorageService.prepareTex((done, total) => {
            overlay.classList.remove('hidden');
            bar.style.width = `${Math.round((done / total) * 100)}%`;
        });
        const labels = { bundled: 'LaTeX embutido (TinyTeX)', system: 'LaTeX do sistema', custom: 'LaTeX configurado' };
        status.textContent = tex ? labels[tex.source] || tex.source : 'Nenhum LaTeX encontrado';
        status.className = tex ? 'text-xs text-muted' : 'text-xs text-danger';
        status.title = tex ? tex.binDir : 'Reinstale o CarameloTeX ou instale o MiKTeX/TeX Live.';
    } catch (e) {
        status.textContent = 'Erro ao preparar o LaTeX';
        status.className = 'text-xs text-danger';
        status.title = String(e);
        console.error(e);
    } finally {
        overlay.classList.add('hidden');
    }
}

async function renderProjects() {
    const projects = await StorageService.listRecent();
    const list = document.getElementById('projectsList');
    const listContent = document.getElementById('projectsListContent');
    const emptyState = document.getElementById('emptyState');

    listContent.innerHTML = '';
    list.classList.toggle('hidden', projects.length === 0);
    emptyState.classList.toggle('hidden', projects.length > 0);

    projects.forEach(project => {
        const row = document.createElement('div');
        row.className = 'group flex items-center gap-4 px-4 py-3 hover:bg-hover cursor-pointer transition-colors';

        const date = new Date(project.lastOpened).toLocaleDateString('pt-BR', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        row.innerHTML = `
            <svg class="w-5 h-5 flex-shrink-0 text-accent" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 7a2 2 0 0 1 2-2h4.2l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
            <div class="min-w-0 flex-1">
                <p class="font-medium truncate project-name"></p>
                <p class="text-xs text-muted truncate project-path"></p>
            </div>
            <span class="text-xs text-muted flex-shrink-0 hidden sm:block">${escapeHtml(date)}</span>
            <div class="flex items-center flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                <button class="reveal-btn icon-btn" title="Mostrar no Explorer">
                    <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>
                    </svg>
                </button>
                <button class="remove-btn icon-btn" title="Tirar da lista (a pasta não é apagada)">
                    <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 18 18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        `;

        const h3 = row.querySelector('.project-name');
        row.tabIndex = 0;
        row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') openProject(project.path);
        });
        h3.textContent = project.name;
        const pathEl = row.querySelector('.project-path');
        pathEl.textContent = project.path;
        pathEl.title = project.path;

        row.querySelector('.reveal-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            StorageService.revealInExplorer(project.path, '').catch(err => showToast(String(err), 'error'));
        });
        row.querySelector('.remove-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            await StorageService.removeRecent(project.path);
            await renderProjects();
        });
            row.addEventListener('click', () => openProject(project.path));

        listContent.appendChild(row);
    });
}

async function openProject(path) {
    try {
        await StorageService.openProject(path);
        window.location.href = 'index.html';
    } catch (e) {
        console.error(e);
        if (confirm(`Não foi possível abrir a pasta:\n${e}\n\nRemover dos projetos recentes?`)) {
            await StorageService.removeRecent(path);
            await renderProjects();
        }
    }
}

async function openFolder() {
    const path = await StorageService.pickFolder('Abrir pasta do projeto LaTeX');
    if (path) await openProject(path);
}

async function importZip(file) {
    const name = prompt('Nome da pasta do novo projeto:', file.name.replace(/\.zip$/i, ''));
    if (!name) return;
    const parent = await StorageService.pickFolder('Onde criar a pasta do projeto?');
    if (!parent) return;

    try {
        await StorageService.createProject(parent, name, {});
        const result = await StorageService.importZip(file);
        showToast(`${result.added} arquivo(s) importado(s)`, 'success');
        window.location.href = 'index.html';
    } catch (e) {
        console.error(e);
        showToast(`Erro ao importar: ${e}`, 'error');
    }
}

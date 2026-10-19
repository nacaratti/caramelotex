/**
 * templates.js - Biblioteca de Templates LaTeX
 *
 */
import './theme.js';
import { StorageService } from './storage.js';
import { escapeHtml } from './ui.js';
import TEMPLATES from '../templates/templates.json';

// ========== TEMPLATES DATA (embutidos no app) ==========
let templates = [];

function templateMainContent(template) {
    return template.files['main.tex'] || Object.values(template.files)[0] || '';
}

// ========== RENDER FUNCTIONS ==========

function getIconSvg(iconType) {
    const icons = {
        document: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>',
        academic: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"></path>',
        book: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>',
        presentation: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path>',
        user: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>',
        mail: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>',
        currency: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
    };
    return icons[iconType] || icons.document;
}

function getCategoryLabel(category) {
    const labels = {
        academic: 'Acadêmico',
        thesis: 'Tese',
        presentation: 'Apresentação',
        professional: 'Profissional'
    };
    return labels[category] || category;
}

function renderTemplates(filteredTemplates) {
    const grid = document.getElementById('templatesGrid');
    const emptyState = document.getElementById('emptyState');

    grid.innerHTML = '';

    if (filteredTemplates.length === 0) {
        grid.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    grid.classList.remove('hidden');
    emptyState.classList.add('hidden');

    filteredTemplates.forEach(template => {
        const card = document.createElement('div');
        card.className = 'template-card card p-5 flex flex-col hover:border-accent transition-colors cursor-pointer';
        card.dataset.templateId = template.id;

        const tags = Array.isArray(template.tags) ? template.tags : [];

        card.innerHTML = `
            <div class="flex items-start justify-between mb-4">
                <svg class="w-8 h-8 text-accent-strong" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    ${getIconSvg(template.icon)}
                </svg>
                <span class="text-xs text-muted">${escapeHtml(getCategoryLabel(template.category))}</span>
            </div>
            <h3 class="font-semibold mb-1">${escapeHtml(template.name)}</h3>
            <p class="text-sm text-muted mb-4 flex-1">${escapeHtml(template.description || '')}</p>
            <p class="text-xs text-muted mb-4">${tags.slice(0, 3).map(escapeHtml).join(', ')}</p>
            <div class="flex gap-2">
                <button class="preview-btn btn flex-1 justify-center">Ver código</button>
                <button class="use-btn btn btn-primary flex-1 justify-center">Usar</button>
            </div>
        `;

        // Event listeners
        card.querySelector('.preview-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            showPreview(template);
        });

        card.querySelector('.use-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            useTemplate(template);
        });

        card.addEventListener('click', () => showPreview(template));

        grid.appendChild(card);
    });
}

// ========== MODAL FUNCTIONS ==========

let currentPreviewTemplate = null;

function showPreview(template) {
    currentPreviewTemplate = template;

    document.getElementById('modalTitle').textContent = template.name;
    document.getElementById('modalCode').textContent = templateMainContent(template);
    document.getElementById('previewModal').classList.remove('hidden');
}

function hidePreview() {
    document.getElementById('previewModal').classList.add('hidden');
    currentPreviewTemplate = null;
}

async function useTemplate(template) {
    const name = prompt('Nome da pasta do novo projeto:', template.name);
    if (!name) return;
    const parent = await StorageService.pickFolder('Onde criar a pasta do projeto?');
    if (!parent) return;

    try {
        await StorageService.createProject(parent, name, template.files);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Erro ao criar projeto:', error);
        alert(`Erro ao criar projeto:\n${error}`);
    }
}

function copyCode() {
    if (!currentPreviewTemplate) return;

    navigator.clipboard.writeText(templateMainContent(currentPreviewTemplate)).then(() => {
        const btn = document.getElementById('copyCodeBtn');
        const originalText = btn.innerHTML;
        btn.textContent = 'Copiado';
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
    });
}

// ========== FILTER FUNCTIONS ==========

let currentCategory = 'all';
let searchQuery = '';

function filterTemplates() {
    let filtered = templates;

    // Filter by category
    if (currentCategory !== 'all') {
        filtered = filtered.filter(t => t.category === currentCategory);
    }

    // Filter by search query
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(t => {
            const tags = Array.isArray(t.tags) ? t.tags : [];
            return t.name.toLowerCase().includes(query) ||
                (t.description && t.description.toLowerCase().includes(query)) ||
                tags.some(tag => tag.toLowerCase().includes(query));
        });
    }

    renderTemplates(filtered);
}

// ========== INITIALIZATION ==========

document.addEventListener('DOMContentLoaded', () => {
    templates = TEMPLATES;
    renderTemplates(templates);

    // Category buttons
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            filterTemplates();
        });
    });

    // Search input
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchQuery = e.target.value;
        filterTemplates();
    });

    // Modal events
    document.getElementById('closeModal').addEventListener('click', hidePreview);
    document.getElementById('previewModal').addEventListener('click', (e) => {
        if (e.target.id === 'previewModal') hidePreview();
    });
    document.getElementById('copyCodeBtn').addEventListener('click', copyCode);
    document.getElementById('useTemplateBtn').addEventListener('click', () => {
        if (currentPreviewTemplate) {
            hidePreview();
            useTemplate(currentPreviewTemplate);
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hidePreview();
    });
});

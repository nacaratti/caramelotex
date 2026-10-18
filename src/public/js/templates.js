/**
 * templates.js - Biblioteca de Templates LaTeX
 *
 * Depende de: supabase.js, admin.js (TemplateService)
 */

// ========== TEMPLATES DATA (carregado do Supabase) ==========
let templates = [];
let templatesLoaded = false;

/**
 * Carrega os templates do Supabase
 * @returns {Promise<Array>} Lista de templates
 */
async function fetchTemplates() {
    try {
        // Usa o TemplateService do admin.js
        if (typeof TemplateService !== 'undefined') {
            templates = await TemplateService.listTemplates();
        } else {
            // Fallback: busca direta do Supabase
            const { data, error } = await supabase
                .from('templates')
                .select('*')
                .eq('is_active', true)
                .order('name', { ascending: true });

            if (error) {
                console.error('Erro ao carregar templates:', error.message);
                templates = [];
            } else {
                templates = data || [];
            }
        }

        templatesLoaded = true;
        console.log(`✅ ${templates.length} template(s) carregado(s)`);
        return templates;
    } catch (e) {
        console.error('Erro ao buscar templates:', e);
        templates = [];
        templatesLoaded = true;
        return templates;
    }
}

// ========== RENDER FUNCTIONS ==========

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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
        academic: 'Academico',
        thesis: 'Teses',
        presentation: 'Apresentacoes',
        professional: 'Profissional'
    };
    return labels[category] || category;
}

function getCategoryColor(category) {
    const colors = {
        academic: 'bg-blue-500',
        thesis: 'bg-purple-500',
        presentation: 'bg-orange-500',
        professional: 'bg-green-500'
    };
    return colors[category] || 'bg-gray-500';
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
        card.className = 'template-card bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-latex-green cursor-pointer';
        card.dataset.templateId = template.id;

        // Garante que tags é um array
        const tags = Array.isArray(template.tags) ? template.tags : [];

        card.innerHTML = `
            <div class="flex items-start justify-between mb-4">
                <div class="p-3 bg-latex-gray rounded-lg">
                    <svg class="w-8 h-8 text-latex-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        ${getIconSvg(template.icon)}
                    </svg>
                </div>
                <span class="text-xs px-2 py-1 rounded ${getCategoryColor(template.category)} text-white">
                    ${escapeHtml(getCategoryLabel(template.category))}
                </span>
            </div>
            <h3 class="text-lg font-bold text-gray-200 mb-2">${escapeHtml(template.name)}</h3>
            <p class="text-sm text-gray-400 mb-4 line-clamp-2">${escapeHtml(template.description || '')}</p>
            <div class="flex flex-wrap gap-1 mb-4">
                ${tags.slice(0, 3).map(tag =>
                    `<span class="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded">${escapeHtml(tag)}</span>`
                ).join('')}
            </div>
            <div class="flex gap-2">
                <button class="preview-btn flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-sm font-medium transition-colors">
                    Visualizar
                </button>
                <button class="use-btn flex-1 bg-latex-green hover:bg-teal-600 text-white py-2 rounded text-sm font-medium transition-colors">
                    Usar
                </button>
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
    document.getElementById('modalCode').textContent = template.content;
    document.getElementById('previewModal').classList.remove('hidden');
}

function hidePreview() {
    document.getElementById('previewModal').classList.add('hidden');
    currentPreviewTemplate = null;
}

async function useTemplate(template) {
    const name = prompt('Nome do novo projeto:', template.name);
    if (!name) return;

    try {
        // Create new project with template content
        const id = await StorageService.createProject(name);

        // Save template content as main.tex
        const files = {
            'main.tex': {
                content: template.content,
                type: 'main'
            }
        };

        await StorageService.saveProject(id, name, files, 'main.tex');

        // Set as current project and redirect to editor
        StorageService.setCurrentProjectId(id);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Erro ao criar projeto:', error);
        alert('Erro ao criar projeto. Tente novamente.');
    }
}

function copyCode() {
    if (!currentPreviewTemplate) return;

    navigator.clipboard.writeText(currentPreviewTemplate.content).then(() => {
        const btn = document.getElementById('copyCodeBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Copiado!';
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

// ========== LOADING STATE ==========

function showLoadingState() {
    const grid = document.getElementById('templatesGrid');
    const emptyState = document.getElementById('emptyState');

    grid.classList.remove('hidden');
    emptyState.classList.add('hidden');

    grid.innerHTML = `
        <div class="col-span-full flex justify-center items-center py-12">
            <div class="flex items-center space-x-3 text-gray-400">
                <svg class="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Carregando templates...</span>
            </div>
        </div>
    `;
}

// ========== ADMIN LINK ==========

async function checkAdminLink() {
    try {
        const isAdmin = await AuthService.isAdmin();
        if (isAdmin) {
            // Adiciona link de admin no header se existir
            const nav = document.querySelector('nav');
            if (nav) {
                const adminLink = document.createElement('a');
                adminLink.href = 'admin.html';
                adminLink.className = 'text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1';
                adminLink.innerHTML = `
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    </svg>
                    <span>Admin</span>
                `;
                nav.insertBefore(adminLink, nav.firstChild);
            }
        }
    } catch (e) {
        // Ignora erro silenciosamente
    }
}

// ========== INITIALIZATION ==========

document.addEventListener('DOMContentLoaded', async () => {
    // Auth guard
    const session = await AuthService.requireAuth();
    if (!session) return;

    // Mostra estado de carregamento
    showLoadingState();

    // Carrega templates do Supabase
    await fetchTemplates();

    // Render initial templates
    renderTemplates(templates);

    // Verifica se é admin para mostrar link
    checkAdminLink();

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

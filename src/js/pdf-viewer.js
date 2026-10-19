/**
 * pdf-viewer.js - Visualizador de PDF com renderização sob demanda.
 *
 * Só as páginas perto da área visível são desenhadas (IntersectionObserver);
 * as distantes têm o canvas liberado. A posição de leitura é preservada ao
 * recarregar o PDF depois de uma compilação, e o zoom pode ser "ajustar à
 * largura" ou uma escala fixa. Coordenadas trocadas com o SyncTeX estão em
 * pixels CSS, com `scale` = pixels CSS por ponto PDF.
 */
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const SIDE_PADDING = 40;   // px de folga no "ajustar à largura"
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;

export function createPdfViewer({ container, pagesEl, placeholderEl, onZoomChange, onPageClick }) {
    let doc = null;
    let pages = [];          // { num, wrapper, canvas, baseWidth, baseHeight, renderTask, renderedScale }
    let scale = 1;
    let fitWidth = true;
    let observer = null;
    let loadToken = 0;

    function computeFitScale() {
        if (!pages.length) return scale;
        const widest = Math.max(...pages.map(p => p.baseWidth));
        const available = Math.max(200, container.clientWidth - SIDE_PADDING);
        return Math.min(MAX_SCALE, Math.max(MIN_SCALE, available / widest));
    }

    /** Página e fração vertical no topo da área visível (para restaurar a posição). */
    function captureAnchor() {
        if (!pages.length) return null;
        const top = container.scrollTop;
        for (const page of pages) {
            const start = page.wrapper.offsetTop;
            const end = start + page.wrapper.offsetHeight;
            if (end > top) {
                return { num: page.num, fraction: Math.max(0, (top - start) / page.wrapper.offsetHeight) };
            }
        }
        return { num: pages[pages.length - 1].num, fraction: 0 };
    }

    function restoreAnchor(anchor) {
        if (!anchor) return;
        const page = pages[Math.min(anchor.num, pages.length) - 1];
        if (page) container.scrollTop = page.wrapper.offsetTop + anchor.fraction * page.wrapper.offsetHeight;
    }

    function sizeWrapper(page) {
        page.wrapper.style.width = `${Math.floor(page.baseWidth * scale)}px`;
        page.wrapper.style.height = `${Math.floor(page.baseHeight * scale)}px`;
    }

    function releasePage(page) {
        if (page.renderTask) page.renderTask.cancel();
        page.renderTask = null;
        if (page.canvas) {
            page.canvas.width = 0;
            page.canvas.height = 0;
            page.canvas.remove();
            page.canvas = null;
        }
        page.renderedScale = null;
    }

    async function renderPage(page) {
        if (!doc || page.renderedScale === scale) return;
        const token = loadToken;
        const pdfPage = await doc.getPage(page.num);
        if (token !== loadToken) return;

        const ratio = window.devicePixelRatio || 1;
        const viewport = pdfPage.getViewport({ scale: scale * ratio });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        if (page.renderTask) page.renderTask.cancel();
        const task = pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport });
        page.renderTask = task;
        try {
            await task.promise;
        } catch (err) {
            if (err && err.name === 'RenderingCancelledException') return;
            throw err;
        }
        if (token !== loadToken || page.renderTask !== task) return;

        // Troca o canvas só depois de pronto, para não piscar em branco
        if (page.canvas) page.canvas.remove();
        page.wrapper.appendChild(canvas);
        page.canvas = canvas;
        page.renderTask = null;
        page.renderedScale = scale;
    }

    function observe() {
        if (observer) observer.disconnect();
        observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const page = pages[Number(entry.target.dataset.pageNum) - 1];
                if (!page) continue;
                if (entry.isIntersecting) {
                    renderPage(page).catch(err => console.error(`Erro na página ${page.num}:`, err));
                } else {
                    releasePage(page);
                }
            }
        }, { root: container, rootMargin: '1200px 0px' });
        pages.forEach(page => observer.observe(page.wrapper));
    }

    /** Reaplica o zoom atual mantendo a posição de leitura. */
    function relayout(anchor = captureAnchor()) {
        if (fitWidth) scale = computeFitScale();
        pages.forEach(page => {
            sizeWrapper(page);
            if (page.renderedScale !== null && page.renderedScale !== scale) {
                page.renderedScale = -1; // força redesenho
                renderPage(page).catch(() => {});
            }
        });
        restoreAnchor(anchor);
        if (onZoomChange) onZoomChange({ scale, fitWidth });
    }

    // Ajusta ao redimensionar o painel (divisor ou janela) no modo "ajustar à largura"
    let resizeTimer = null;
    new ResizeObserver(() => {
        if (!fitWidth || !pages.length) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => relayout(), 120);
    }).observe(container);

    // Ctrl + roda do mouse = zoom
    container.addEventListener('wheel', (event) => {
        if (!event.ctrlKey || !pages.length) return;
        event.preventDefault();
        setZoom(scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });

    container.addEventListener('click', (event) => {
        if (!onPageClick) return;
        const wrapper = event.target.closest('.pdf-page-wrapper');
        if (!wrapper) return;
        const rect = wrapper.getBoundingClientRect();
        onPageClick(event, {
            pageNum: Number(wrapper.dataset.pageNum),
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            height: rect.height,
            scale,
        });
    });

    function setZoom(newScale) {
        fitWidth = false;
        const anchor = captureAnchor();
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
        relayout(anchor);
    }

    return {
        /** Carrega um PDF novo, preservando a página e a posição atuais. */
        async load(bytes) {
            const token = ++loadToken;
            const anchor = captureAnchor();
            const newDoc = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
            if (token !== loadToken) {
                newDoc.destroy();
                return;
            }

            // Mede todas as páginas (barato) para reservar o espaço de cada uma
            const sizes = [];
            for (let num = 1; num <= newDoc.numPages; num++) {
                const page = await newDoc.getPage(num);
                const viewport = page.getViewport({ scale: 1 });
                sizes.push({ width: viewport.width, height: viewport.height });
            }
            if (token !== loadToken) {
                newDoc.destroy();
                return;
            }

            const oldDoc = doc;
            pages.forEach(releasePage);
            doc = newDoc;

            const fragment = document.createDocumentFragment();
            pages = sizes.map((size, i) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'pdf-page-wrapper';
                wrapper.dataset.pageNum = String(i + 1);
                fragment.appendChild(wrapper);
                return { num: i + 1, wrapper, canvas: null, baseWidth: size.width, baseHeight: size.height, renderTask: null, renderedScale: null };
            });
            if (fitWidth) scale = computeFitScale();
            pages.forEach(sizeWrapper);

            placeholderEl.classList.add('hidden');
            pagesEl.classList.remove('hidden');
            pagesEl.replaceChildren(fragment);
            restoreAnchor(anchor);
            observe();
            if (oldDoc) oldDoc.destroy();
            if (onZoomChange) onZoomChange({ scale, fitWidth });
        },

        get numPages() {
            return doc ? doc.numPages : 0;
        },

        get scale() {
            return scale;
        },

        zoomIn() {
            setZoom(scale * 1.2);
        },

        zoomOut() {
            setZoom(scale / 1.2);
        },

        fitToWidth() {
            fitWidth = true;
            relayout();
        },

        /** Rola até um ponto da página (y em pixels CSS dentro da página). */
        scrollTo(pageNum, y) {
            const page = pages[pageNum - 1];
            if (!page) return;
            container.scrollTo({
                top: Math.max(0, page.wrapper.offsetTop + y - container.clientHeight / 3),
                behavior: 'smooth',
            });
        },

        /** Destaca brevemente um ponto da página (resultado do SyncTeX). */
        flash(pageNum, y) {
            const page = pages[pageNum - 1];
            if (!page) return;
            const marker = document.createElement('div');
            marker.className = 'pdf-sync-marker';
            marker.style.top = `${y - 14}px`;
            page.wrapper.appendChild(marker);
            setTimeout(() => marker.remove(), 1500);
        },
    };
}


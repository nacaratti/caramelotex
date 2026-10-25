/**
 * synctex-parser.js - Parser de arquivos SyncTeX para sincronização LaTeX <-> PDF
 *
 * Baseado no formato SyncTeX: https://man.archlinux.org/man/synctex.5.en
 * Coordenadas SyncTeX: origem no canto superior esquerdo, unidades em scaled points
 * Coordenadas PDF: origem no canto inferior esquerdo, unidades em pontos (72 dpi)
 */

const SyncTexParser = (function() {
    'use strict';

    /**
     * Parseia o conteúdo de um arquivo .synctex (já descomprimido)
     * @param {string} content - Conteúdo do arquivo synctex
     * @param {string} [projectRoot] - Pasta do projeto; caminhos absolutos dentro
     *   dela viram relativos (o pdflatex grava "C:/.../projeto/./main.tex")
     * @returns {Object} Dados estruturados do synctex
     */
    function parse(content, projectRoot) {
        const lines = content.split('\n');
        const rootPrefix = projectRoot
            ? projectRoot.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() + '/'
            : null;

        const result = {
            version: 1,
            inputs: {},          // tag -> {name, path}
            magnification: 1000,
            unit: 1,             // Unidade em scaled points
            xOffset: 0,
            yOffset: 0,
            pages: [],           // Array de páginas com blocos
            blockNumberLine: {}  // fileName -> {lineNum -> [blocks]}
        };

        let currentPage = null;
        let lineIndex = 0;

        // "Input:tag:caminho" aparece no preâmbulo e também no meio do conteúdo,
        // quando o TeX abre um arquivo depois (\input de capítulos, o .bbl...)
        function readInput(line) {
            const match = line.match(/^Input:(\d+):(.+)$/);
            if (!match) return;
            const tag = parseInt(match[1]);
            let path = match[2].trim();
            // Normaliza o caminho (relativo à pasta do projeto)
            path = path.replace(/\\/g, '/').replace(/\/\.\//g, '/').replace(/^\.\//, '');
            if (rootPrefix && path.toLowerCase().startsWith(rootPrefix)) {
                path = path.substring(rootPrefix.length);
            }
            result.inputs[tag] = {
                tag: tag,
                name: path.split('/').pop(),
                path: path
            };
        }

        // Parse preamble
        while (lineIndex < lines.length) {
            const line = lines[lineIndex];

            if (line.startsWith('SyncTeX Version:')) {
                result.version = parseInt(line.split(':')[1]) || 1;
            } else if (line.startsWith('Input:')) {
                readInput(line);
            } else if (line.startsWith('Magnification:')) {
                result.magnification = parseInt(line.split(':')[1]) || 1000;
            } else if (line.startsWith('Unit:')) {
                result.unit = parseInt(line.split(':')[1]) || 1;
            } else if (line.startsWith('X Offset:')) {
                result.xOffset = parseInt(line.split(':')[1]) || 0;
            } else if (line.startsWith('Y Offset:')) {
                result.yOffset = parseInt(line.split(':')[1]) || 0;
            } else if (line.startsWith('Content:')) {
                lineIndex++;
                break;
            }

            lineIndex++;
        }

        // Parse content (pages and blocks)
        let blockStack = [];

        while (lineIndex < lines.length) {
            const line = lines[lineIndex].trim();

            if (!line || line.startsWith('Postamble:')) {
                break;
            }

            // Arquivo aberto no meio do documento
            if (line.startsWith('Input:')) {
                readInput(line);
            }
            // Nova página: {pageNum ou {pageNum:x,y
            else if (line.startsWith('{')) {
                const pageMatch = line.match(/^\{(\d+)/);
                if (pageMatch) {
                    currentPage = {
                        page: parseInt(pageMatch[1]),
                        blocks: []
                    };
                    result.pages.push(currentPage);
                }
            }
            // Fim de página
            else if (line === '}') {
                currentPage = null;
            }
            // Bloco vertical (vbox): [tag,line,column,h,v,W,H,D
            else if (line.startsWith('[')) {
                const block = parseBlock(line, '[', result.inputs);
                if (block && currentPage) {
                    block.page = currentPage.page; // Adiciona número da página ao bloco
                    currentPage.blocks.push(block);
                    blockStack.push(block);
                    indexBlock(result.blockNumberLine, block);
                }
            }
            // Fim vbox
            else if (line === ']') {
                blockStack.pop();
            }
            // Bloco horizontal (hbox): (tag,line,column,h,v,W,H,D
            else if (line.startsWith('(')) {
                const block = parseBlock(line, '(', result.inputs);
                if (block && currentPage) {
                    block.page = currentPage.page; // Adiciona número da página ao bloco
                    currentPage.blocks.push(block);
                    blockStack.push(block);
                    indexBlock(result.blockNumberLine, block);
                }
            }
            // Fim hbox
            else if (line === ')') {
                blockStack.pop();
            }
            // Void vbox/hbox ou outros: v/h/x/k/g/$
            else if (/^[vhxkg$]/.test(line)) {
                const block = parseInlineBlock(line, result.inputs, currentPage);
                if (block && currentPage) {
                    currentPage.blocks.push(block);
                    indexBlock(result.blockNumberLine, block);
                }
            }

            lineIndex++;
        }

        return result;
    }

    /**
     * Lê um registro do SyncTeX. Formato (os grupos separados por ":"):
     *   [tag,linha[,coluna]:h,v:W,H,D   caixa vertical (e "(" horizontal, "v"/"h" vazias)
     *   xtag,linha[,coluna]:h,v          elemento (x, g, $), e "k...:h,v:W" para kern
     * A coluna é opcional (o pdfTeX não a grava): ler por posição fixa
     * deslocava todos os campos seguintes.
     */
    function parseRecord(line, type, inputs) {
        const groups = line.substring(1).split(':');
        const head = groups[0].split(',');
        const pos = (groups[1] || '').split(',');
        const size = (groups[2] || '').split(',');
        if (head.length < 2 || pos.length < 2) return null;

        const tag = parseInt(head[0]) || 1;
        const inputInfo = inputs[tag] || { name: 'main.tex', path: 'main.tex' };

        return {
            type,
            file: inputInfo.path,
            fileName: inputInfo.name,
            fileTag: tag,
            line: parseInt(head[1]) || 0,
            column: head.length > 2 ? parseInt(head[2]) || 0 : 0,
            h: parseCoord(pos[0]),
            v: parseCoord(pos[1]),
            width: parseCoord(size[0]),
            height: parseCoord(size[1]),
            depth: parseCoord(size[2])
        };
    }

    /** Caixa vertical ("[") ou horizontal ("("). */
    function parseBlock(line, startChar, inputs) {
        return parseRecord(line, startChar === '[' ? 'vbox' : 'hbox', inputs);
    }

    /** Caixas vazias (v, h) e elementos (x, k, g, $). */
    function parseInlineBlock(line, inputs, currentPage) {
        const block = parseRecord(line, line[0], inputs);
        if (block) block.page = currentPage ? currentPage.page : 1;
        return block;
    }

    /**
     * Parseia uma coordenada (pode ser número ou = para repetir)
     */
    function parseCoord(value) {
        if (!value || value === '=' || value === '') return 0;
        return parseInt(value) || 0;
    }

    /**
     * Indexa um bloco no índice blockNumberLine para forward sync
     */
    function indexBlock(index, block) {
        if (!block || !block.line || block.line <= 0) return;

        const fileName = block.file || 'main.tex';
        if (!index[fileName]) {
            index[fileName] = {};
        }
        if (!index[fileName][block.line]) {
            index[fileName][block.line] = [];
        }
        index[fileName][block.line].push(block);
    }

    /**
     * Forward sync: encontra blocos correspondentes a uma linha do código fonte
     * @param {Object} synctexData - Dados parseados do synctex
     * @param {string} fileName - Nome do arquivo
     * @param {number} lineNumber - Número da linha (1-indexed)
     * @returns {Array} Array de blocos encontrados
     */
    function forwardSync(synctexData, fileName, lineNumber) {
        // Encontra o índice do arquivo correto
        let fileIndex = null;
        let matchedFile = null;

        // O servidor latex-on-http renomeia main.tex para __main_document__.tex
        const isMainFile = fileName === 'main.tex' || fileName.endsWith('main.tex');

        for (const [file, lines] of Object.entries(synctexData.blockNumberLine)) {
            // Match exato
            if (file === fileName) {
                fileIndex = lines;
                matchedFile = file;
                break;
            }

            // Para arquivo principal, também busca __main_document__.tex
            if (isMainFile && file.includes('__main_document__.tex')) {
                fileIndex = lines;
                matchedFile = file;
                break;
            }

            // Match por nome base
            const baseName = fileName.split('/').pop();
            if (file.endsWith('/' + baseName) || file === baseName) {
                fileIndex = lines;
                matchedFile = file;
            }
        }

        if (!fileIndex) {
            return [];
        }

        // Tenta match exato da linha
        if (fileIndex[lineNumber]) {
            return fileIndex[lineNumber];
        }

        // Encontra linha mais próxima
        const availableLines = Object.keys(fileIndex).map(Number).sort((a, b) => a - b);

        if (availableLines.length === 0) {
            return [];
        }

        // Encontra a linha mais próxima que seja <= lineNumber (preferível) ou a mais próxima
        let closest = availableLines[0];
        for (const line of availableLines) {
            if (line <= lineNumber) {
                closest = line;
            } else {
                // Se passamos da linha, verifica se a anterior ou atual é mais próxima
                if (Math.abs(line - lineNumber) < Math.abs(closest - lineNumber)) {
                    closest = line;
                }
                break;
            }
        }

        return fileIndex[closest] || [];
    }

    /**
     * Reverse sync: encontra a linha do código fonte a partir de coordenadas no PDF
     * @param {Object} synctexData - Dados parseados do synctex
     * @param {number} pageNum - Número da página (1-indexed)
     * @param {number} x - Coordenada X em scaled points
     * @param {number} y - Coordenada Y em scaled points
     * @returns {Object|null} {file, line, column} ou null
     */
    function reverseSync(synctexData, pageNum, x, y) {
        const page = synctexData.pages.find(p => p.page === pageNum);
        if (!page) return null;

        let bestMatch = null;
        let bestDistance = Infinity;
        // Os blocos se aninham (coluna > parágrafo > linha): entre os que contêm o
        // ponto, vale o de menor área. Escolher o primeiro pegaria a coluna
        // inteira, que aponta para a linha onde a seção começou.
        let bestArea = Infinity;
        let bestBlock = null;
        // Caixas altas (mais de ~3 linhas) são contêineres (página, coluna,
        // figura): a linha delas é a de onde o bloco começou, não a do ponto.
        const maxBoxHeight = 40 * 65536 / (synctexData.unit || 1);

        for (const block of page.blocks) {
            if (!block.line || block.line <= 0) continue;
            if ((block.height || 0) + (block.depth || 0) > maxBoxHeight) continue;

            // Calcula distância do ponto ao bloco
            const blockX = block.h || 0;
            const blockY = block.v || 0;
            const blockW = block.width || 0;
            const blockH = block.height || 0;

            // Verifica se ponto está dentro do bloco
            const insideX = x >= blockX && x <= blockX + blockW;
            const insideY = y >= blockY - blockH && y <= blockY;

            let distance;
            const area = blockW * blockH;
            if (insideX && insideY) {
                distance = 0;
            } else {
                // Distância à borda do bloco (ao centro, uma linha larga pareceria
                // longe mesmo com o ponto em cima dela)
                const dx = Math.max(blockX - x, 0, x - (blockX + blockW));
                const dy = Math.max((blockY - blockH) - y, 0, y - (blockY + (block.depth || 0)));
                distance = Math.sqrt(dx * dx + dy * dy);
            }

            const better = distance < bestDistance || (distance === 0 && bestDistance === 0 && area < bestArea);
            if (better) {
                bestDistance = distance;
                bestArea = distance === 0 ? area : Infinity;
                bestBlock = block;
                bestMatch = {
                    file: block.file || 'main.tex',
                    fileName: block.fileName || 'main.tex',
                    line: block.line,
                    column: block.column || 0,
                    distance: distance
                };
            }
        }

        // Uma caixa de linha costuma trazer o número da linha em que o parágrafo
        // terminou (às vezes a linha em branco depois dele); os elementos dentro
        // dela (palavras, espaços) trazem a linha certa.
        if (bestMatch && bestBlock && bestBlock.type === 'hbox') {
            const node = nodeInRow(page, bestBlock, x);
            if (node) {
                bestMatch.file = node.file || bestMatch.file;
                bestMatch.fileName = node.fileName || bestMatch.fileName;
                bestMatch.line = node.line;
                bestMatch.column = node.column || 0;
            }
        }
        return bestMatch;
    }

    /**
     * Elemento (palavra, espaço, kern) da linha de texto `row` mais próximo de x,
     * ou null. Elementos sem largura ficam na linha de base da caixa.
     */
    function nodeInRow(page, row, x) {
        const top = (row.v || 0) - (row.height || 0);
        const bottom = (row.v || 0) + (row.depth || 0);
        let best = null;
        let bestDx = Infinity;
        for (const block of page.blocks) {
            if (block.type === 'hbox' || block.type === 'vbox' || !(block.line > 0)) continue;
            const v = block.v || 0;
            if (v < top || v > bottom) continue;
            const dx = Math.abs((block.h || 0) - x);
            if (dx < bestDx) {
                bestDx = dx;
                best = block;
            }
        }
        return best;
    }

    /**
     * Converte coordenadas SyncTeX para coordenadas de canvas PDF.js
     * @param {Object} synctexData - Dados parseados do synctex
     * @param {Object} block - Bloco com coordenadas synctex
     * @param {number} canvasHeight - Altura do canvas em pixels
     * @param {number} scale - Escala do PDF.js
     * @returns {Object} {x, y} em pixels do canvas
     */
    function synctexToCanvas(synctexData, block, canvasHeight, scale) {
        // SyncTeX armazena coordenadas que precisam ser convertidas para pontos PDF
        // O valor 'unit' do synctex indica a escala (geralmente 1 significa que os valores
        // já estão em unidades que podem ser convertidas diretamente)

        const mag = (synctexData.magnification || 1000) / 1000;
        const unit = synctexData.unit || 1;

        // Valores h e v do SyncTeX
        // Em arquivos synctex modernos, os valores já estão em uma escala que
        // quando multiplicada por unit e dividida por 65536, dá pontos
        const SP_PER_PT = 65536;

        // Converte SyncTeX units para pontos PDF
        const xPt = (block.h || 0) * unit / SP_PER_PT;
        const yPt = (block.v || 0) * unit / SP_PER_PT;

        // Converte pontos para pixels (PDF.js usa 72dpi como base)
        // A escala do PDF.js já está aplicada ao canvas
        const xPx = xPt * scale;
        const yPx = yPt * scale;

        return { x: xPx, y: yPx };
    }

    /**
     * Converte coordenadas de canvas PDF.js para coordenadas SyncTeX
     * @param {Object} synctexData - Dados parseados do synctex
     * @param {number} canvasX - Coordenada X em pixels do canvas
     * @param {number} canvasY - Coordenada Y em pixels do canvas
     * @param {number} canvasHeight - Altura do canvas em pixels
     * @param {number} scale - Escala do PDF.js
     * @returns {Object} {x, y} em scaled points
     */
    function canvasToSynctex(synctexData, canvasX, canvasY, canvasHeight, scale) {
        const mag = (synctexData.magnification || 1000) / 1000;
        const unit = synctexData.unit || 1;
        const SP_PER_PT = 65536;

        // Offsets
        const xOffset = (synctexData.xOffset || 0) * unit / SP_PER_PT;
        const yOffset = (synctexData.yOffset || 0) * unit / SP_PER_PT;

        // Canvas pixels -> pontos PDF
        const xPt = canvasX / scale - xOffset;
        const yPt = canvasY / scale - yOffset;

        // Pontos PDF -> scaled points
        const xSp = (xPt / mag) * SP_PER_PT / unit;
        const ySp = (yPt / mag) * SP_PER_PT / unit;

        return { x: xSp, y: ySp };
    }

    // API pública
    return {
        parse: parse,
        forwardSync: forwardSync,
        reverseSync: reverseSync,
        nodeInRow: nodeInRow,
        synctexToCanvas: synctexToCanvas,
        canvasToSynctex: canvasToSynctex
    };
})();

// Exporta para uso global
export { SyncTexParser };
export default SyncTexParser;

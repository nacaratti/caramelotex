/**
 * editor-libs.js - Bibliotecas do editor empacotadas localmente (antes via CDN).
 * Expõe os mesmos globais que os scripts em public/js esperam.
 */
import CodeMirror from 'codemirror';
import 'codemirror/mode/stex/stex.js';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import JSZip from 'jszip';
import pako from 'pako';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

window.CodeMirror = CodeMirror;
window.pdfjsLib = pdfjsLib;
window.JSZip = JSZip;
window.pako = pako;

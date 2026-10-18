//! Comandos de arquivos: um projeto é uma pasta do computador do usuário.
//!
//! O frontend abre a pasta com `open_project` e, a partir daí, todos os
//! caminhos são relativos a ela (validados por `paths::resolve_in_root`).

use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::paths::{canonical, resolve_in_root, to_rel};
use crate::AppState;

/// Pasta onde o latexmk grava PDF, log e auxiliares (sem ponto inicial: o
/// kpathsea em modo "paranoid" recusa gravar em caminhos que começam com ".").
pub const BUILD_DIR: &str = "caramelotex-build";
pub const CONFIG_FILE: &str = ".caramelotex.json";

const IGNORED_DIRS: &[&str] = &[BUILD_DIR, ".git", ".svn", ".hg", "node_modules", ".vscode", ".idea", "__pycache__"];

/// Auxiliares gerados por outros editores na pasta do projeto: não aparecem na árvore.
const AUX_SUFFIXES: &[&str] = &[
    ".aux", ".log", ".synctex.gz", ".synctex", ".fdb_latexmk", ".fls", ".out", ".toc", ".lof", ".lot",
    ".bbl", ".blg", ".bcf", ".run.xml", ".nav", ".snm", ".vrb", ".xdv", ".idx", ".ilg", ".ind",
];

const TEXT_EXTS: &[&str] = &[
    "tex", "bib", "cls", "sty", "bst", "bbx", "cbx", "lbx", "def", "cfg", "clo", "dtx", "ins", "ltx", "txt",
    "md", "csv", "tsv", "dat", "json", "yml", "yaml", "lua", "py", "r", "m", "tikz", "pgf", "asy", "mp",
    "gp", "plt", "xml", "ist", "latexmkrc",
];

/// Limites para não travar o app se o usuário abrir uma pasta enorme (ex.: C:\).
const MAX_ENTRIES: usize = 5000;
const MAX_DEPTH: usize = 12;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    path: String,
    /// "folder", "text" ou "binary"
    kind: &'static str,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    root: String,
    name: String,
    main_file: Option<String>,
    engine: String,
    files: Vec<FileEntry>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    main_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    engine: Option<String>,
}

pub fn current_root(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    state
        .project_root
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Nenhum projeto aberto".to_string())
}

fn is_text_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| TEXT_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_aux_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    AUX_SUFFIXES.iter().any(|s| lower.ends_with(s))
}

fn walk(root: &Path, dir: &Path, depth: usize, out: &mut Vec<FileEntry>) -> Result<(), String> {
    if depth > MAX_DEPTH {
        return Ok(());
    }
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("Erro ao ler {}: {e}", dir.display()))?
        .filter_map(Result::ok)
        .collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Ok(file_type) = entry.file_type() else { continue };
        // Links e junções ficam de fora para não sair da pasta do projeto.
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        let Some(rel) = to_rel(root, &path) else { continue };

        if file_type.is_dir() {
            if IGNORED_DIRS.contains(&name.as_str()) {
                continue;
            }
            out.push(FileEntry { path: rel, kind: "folder", size: 0 });
            walk(root, &path, depth + 1, out)?;
        } else if name != CONFIG_FILE && !is_aux_file(&name) {
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let kind = if is_text_file(&path) { "text" } else { "binary" };
            out.push(FileEntry { path: rel, kind, size });
        }

        if out.len() > MAX_ENTRIES {
            return Err(format!(
                "A pasta tem mais de {MAX_ENTRIES} arquivos. Escolha a pasta do documento, não uma pasta geral."
            ));
        }
    }
    Ok(())
}

fn list_files(root: &Path) -> Result<Vec<FileEntry>, String> {
    let mut files = Vec::new();
    walk(root, root, 0, &mut files)?;
    Ok(files)
}

fn read_config(root: &Path) -> ProjectConfig {
    fs::read_to_string(root.join(CONFIG_FILE))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn has_documentclass(path: &Path) -> bool {
    fs::read(path)
        .map(|bytes| {
            let text = String::from_utf8_lossy(&bytes);
            text.lines()
                .map(|l| l.split('%').next().unwrap_or(""))
                .any(|l| l.contains("\\documentclass"))
        })
        .unwrap_or(false)
}

/// Arquivo principal: o configurado, senão main.tex, senão o .tex mais raso com \documentclass.
fn detect_main_file(root: &Path, files: &[FileEntry], config: &ProjectConfig) -> Option<String> {
    if let Some(main) = &config.main_file {
        if root.join(main).is_file() {
            return Some(main.clone());
        }
    }
    let mut candidates: Vec<&FileEntry> = files
        .iter()
        .filter(|f| f.kind == "text" && f.path.to_ascii_lowercase().ends_with(".tex"))
        .collect();
    candidates.sort_by_key(|f| (f.path.matches('/').count(), f.path != "main.tex", f.path.clone()));
    candidates
        .into_iter()
        .find(|f| has_documentclass(&root.join(&f.path)))
        .map(|f| f.path.clone())
}

fn detect_engine(root: &Path, main_file: Option<&str>, config: &ProjectConfig) -> String {
    if let Some(engine) = &config.engine {
        return engine.clone();
    }
    let source = main_file
        .and_then(|m| fs::read(root.join(m)).ok())
        .map(|b| String::from_utf8_lossy(&b).into_owned())
        .unwrap_or_default();
    if source.contains("\\usepackage{fontspec}") || source.contains("{polyglossia}") || source.contains("{xeCJK}") {
        "xelatex".into()
    } else if source.contains("{luacode}") || source.contains("\\directlua") {
        "lualatex".into()
    } else {
        "pdflatex".into()
    }
}

/// Lê bytes como UTF-8; arquivos antigos em Latin-1 são convertidos byte a byte.
fn decode_text(bytes: Vec<u8>) -> String {
    match String::from_utf8(bytes) {
        Ok(s) => s.strip_prefix('\u{feff}').map(str::to_owned).unwrap_or(s),
        Err(e) => e.into_bytes().into_iter().map(char::from).collect(),
    }
}

/// Grava em um arquivo temporário e renomeia, para não corromper o original
/// se o app fechar no meio da gravação.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Erro ao criar pasta: {e}"))?;
    }
    let tmp = path.with_extension(format!(
        "{}.caramelotex-tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("")
    ));
    fs::write(&tmp, bytes).map_err(|e| format!("Erro ao gravar {}: {e}", path.display()))?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Erro ao gravar {}: {e}", path.display())
    })
}

#[tauri::command]
pub fn open_project(dir: String, state: State<'_, AppState>) -> Result<ProjectInfo, String> {
    let root = canonical(Path::new(&dir))?;
    if !root.is_dir() {
        return Err(format!("{} não é uma pasta", root.display()));
    }
    let files = list_files(&root)?;
    let config = read_config(&root);
    let main_file = detect_main_file(&root, &files, &config);
    let engine = detect_engine(&root, main_file.as_deref(), &config);
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.display().to_string());

    *state.project_root.lock().unwrap() = Some(root.clone());

    Ok(ProjectInfo { root: root.display().to_string(), name, main_file, engine, files })
}

#[tauri::command]
pub fn close_project(state: State<'_, AppState>) {
    *state.project_root.lock().unwrap() = None;
}

#[tauri::command]
pub fn list_project_files(state: State<'_, AppState>) -> Result<Vec<FileEntry>, String> {
    list_files(&current_root(&state)?)
}

#[tauri::command]
pub fn read_text_file(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let full = resolve_in_root(&current_root(&state)?, &path)?;
    fs::read(&full)
        .map(decode_text)
        .map_err(|e| format!("Erro ao ler {path}: {e}"))
}

#[tauri::command]
pub fn read_binary_file(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let full = resolve_in_root(&current_root(&state)?, &path)?;
    fs::read(&full)
        .map(|bytes| B64.encode(bytes))
        .map_err(|e| format!("Erro ao ler {path}: {e}"))
}

#[tauri::command]
pub fn write_text_file(path: String, content: String, state: State<'_, AppState>) -> Result<(), String> {
    let full = resolve_in_root(&current_root(&state)?, &path)?;
    write_atomic(&full, content.as_bytes())
}

#[tauri::command]
pub fn write_binary_file(path: String, base64: String, state: State<'_, AppState>) -> Result<(), String> {
    let full = resolve_in_root(&current_root(&state)?, &path)?;
    let bytes = B64.decode(base64.as_bytes()).map_err(|e| format!("Conteúdo inválido: {e}"))?;
    write_atomic(&full, &bytes)
}

#[tauri::command]
pub fn create_folder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let full = resolve_in_root(&current_root(&state)?, &path)?;
    fs::create_dir_all(&full).map_err(|e| format!("Erro ao criar pasta {path}: {e}"))
}

#[tauri::command]
pub fn rename_path(from: String, to: String, state: State<'_, AppState>) -> Result<(), String> {
    let root = current_root(&state)?;
    let src = resolve_in_root(&root, &from)?;
    let dst = resolve_in_root(&root, &to)?;
    if !src.exists() {
        return Err(format!("{from} não existe"));
    }
    if dst.exists() {
        return Err(format!("Já existe um item chamado {to}"));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Erro ao criar pasta: {e}"))?;
    }
    fs::rename(&src, &dst).map_err(|e| format!("Erro ao renomear {from}: {e}"))
}

/// Manda para a Lixeira do sistema (nunca apaga de vez).
#[tauri::command]
pub fn delete_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let root = current_root(&state)?;
    let full = resolve_in_root(&root, &path)?;
    if full == root {
        return Err("Não é possível apagar a pasta do projeto".into());
    }
    if !full.exists() {
        return Ok(());
    }
    trash::delete(&full).map_err(|e| format!("Erro ao mover {path} para a Lixeira: {e}"))
}

#[tauri::command]
pub fn save_project_config(
    main_file: Option<String>,
    engine: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let root = current_root(&state)?;
    if let Some(main) = &main_file {
        resolve_in_root(&root, main)?;
    }
    let json = serde_json::to_string_pretty(&ProjectConfig { main_file, engine }).map_err(|e| e.to_string())?;
    write_atomic(&root.join(CONFIG_FILE), json.as_bytes())
}

/// Cria uma pasta de projeto nova com os arquivos de um template.
/// `parent` é escolhida pelo usuário no diálogo; `name` vira o nome da pasta.
#[tauri::command]
pub fn create_project_folder(
    parent: String,
    name: String,
    files: std::collections::HashMap<String, String>,
) -> Result<String, String> {
    let parent = canonical(Path::new(&parent))?;
    let name = name.trim();
    if name.is_empty() || name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|']) {
        return Err("Nome de projeto inválido".into());
    }
    let root = parent.join(name);
    if root.exists() {
        return Err(format!("Já existe uma pasta chamada {name} neste local"));
    }
    fs::create_dir_all(&root).map_err(|e| format!("Erro ao criar a pasta do projeto: {e}"))?;
    let root = canonical(&root)?;
    for (rel, content) in files {
        let full = resolve_in_root(&root, &rel)?;
        write_atomic(&full, content.as_bytes())?;
    }
    Ok(root.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aux_and_text_detection() {
        assert!(is_aux_file("main.synctex.gz"));
        assert!(is_aux_file("Main.AUX"));
        assert!(!is_aux_file("main.tex"));
        assert!(is_text_file(Path::new("refs.bib")));
        assert!(!is_text_file(Path::new("fig.png")));
    }

    #[test]
    fn lists_project_and_detects_main() {
        let dir = std::env::temp_dir().join(format!("caramelotex-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("capitulos")).unwrap();
        fs::create_dir_all(dir.join(BUILD_DIR)).unwrap();
        fs::create_dir_all(dir.join(".git")).unwrap();
        let root = canonical(&dir).unwrap();

        write_atomic(&root.join("tese.tex"), b"% \\documentclass{x}\n\\documentclass{article}\n\\usepackage{fontspec}").unwrap();
        write_atomic(&root.join("capitulos/intro.tex"), b"\\section{Intro}").unwrap();
        write_atomic(&root.join("refs.bib"), b"@book{a}").unwrap();
        write_atomic(&root.join("fig.png"), &[0x89, 0x50]).unwrap();
        write_atomic(&root.join("tese.aux"), b"").unwrap();
        write_atomic(&root.join(BUILD_DIR).join("tese.pdf"), b"%PDF").unwrap();

        let files = list_files(&root).unwrap();
        let listed: Vec<(&str, &str)> = files.iter().map(|f| (f.path.as_str(), f.kind)).collect();
        assert_eq!(
            listed,
            vec![
                ("capitulos", "folder"),
                ("capitulos/intro.tex", "text"),
                ("fig.png", "binary"),
                ("refs.bib", "text"),
                ("tese.tex", "text"),
            ]
        );
        // Nenhum arquivo temporário da gravação atômica sobrou.
        assert!(!files.iter().any(|f| f.path.contains("caramelotex-tmp")));

        let config = ProjectConfig::default();
        let main = detect_main_file(&root, &files, &config);
        assert_eq!(main.as_deref(), Some("tese.tex"));
        assert_eq!(detect_engine(&root, main.as_deref(), &config), "xelatex");

        let configured = ProjectConfig { main_file: Some("capitulos/intro.tex".into()), engine: Some("lualatex".into()) };
        assert_eq!(detect_main_file(&root, &files, &configured).as_deref(), Some("capitulos/intro.tex"));
        assert_eq!(detect_engine(&root, None, &configured), "lualatex");

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn latin1_fallback() {
        assert_eq!(decode_text(vec![0x63, 0xe9]), "cé");
        assert_eq!(decode_text("\u{feff}olá".as_bytes().to_vec()), "olá");
    }
}

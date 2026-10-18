//! Localiza a distribuição LaTeX usada para compilar.
//!
//! Ordem: pasta configurada pelo usuário → TinyTeX embutido (extraído de
//! `resources/tinytex.zip` para a pasta de dados do app na 1ª execução) →
//! TeX do sistema no PATH (MiKTeX / TeX Live).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::AppState;

const EXE: &str = if cfg!(windows) { ".exe" } else { "" };
const TINYTEX_DIR: &str = "TinyTeX";
const TINYTEX_ZIP: &str = "resources/tinytex.zip";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TexInstall {
    /// "custom", "bundled" ou "system"
    pub source: String,
    pub bin_dir: PathBuf,
    pub has_latexmk: bool,
}

impl TexInstall {
    pub fn tool(&self, name: &str) -> PathBuf {
        self.bin_dir.join(format!("{name}{EXE}"))
    }

    pub fn has_tool(&self, name: &str) -> bool {
        self.tool(name).is_file()
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupProgress {
    done: usize,
    total: usize,
}

fn install_from_bin_dir(bin_dir: PathBuf, source: &str) -> Option<TexInstall> {
    let install = TexInstall { source: source.into(), bin_dir, has_latexmk: false };
    if !install.has_tool("pdflatex") {
        return None;
    }
    Some(TexInstall { has_latexmk: install.has_tool("latexmk"), ..install })
}

/// Pastas `bin/<plataforma>` possíveis dentro de uma instalação do TeX Live/TinyTeX.
fn bin_dirs_of(tex_root: &Path) -> Vec<PathBuf> {
    ["windows", "win64", "win32", "x86_64-linux", "aarch64-linux", "universal-darwin", "x86_64-darwin"]
        .iter()
        .map(|p| tex_root.join("bin").join(p))
        .collect()
}

fn bundled_root(app: &AppHandle) -> Option<PathBuf> {
    let base = app.path().app_local_data_dir().ok()?;
    let plain = base.to_str().is_some_and(|s| s.is_ascii() && !s.contains(' '));
    if plain || !cfg!(windows) {
        return Some(base.join(TINYTEX_DIR));
    }
    // O TeX se perde com espaços e acentos no caminho (ex.: usuário "João Silva").
    std::env::var_os("ProgramData").map(|d| PathBuf::from(d).join("CarameloTeX").join(TINYTEX_DIR))
}

fn find_bundled(app: &AppHandle) -> Option<TexInstall> {
    bin_dirs_of(&bundled_root(app)?)
        .into_iter()
        .find_map(|dir| install_from_bin_dir(dir, "bundled"))
}

fn find_in_path() -> Option<TexInstall> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).find_map(|dir| install_from_bin_dir(dir, "system"))
}

/// Extrai o TinyTeX embutido, se ele vier no instalador e ainda não tiver sido extraído.
/// Extrai para uma pasta temporária e renomeia no fim, para nunca deixar uma instalação pela metade.
fn extract_bundled(app: &AppHandle) -> Result<bool, String> {
    let Some(target) = bundled_root(app) else { return Ok(false) };
    if target.exists() {
        return Ok(false);
    }
    let zip_path = match app.path().resolve(TINYTEX_ZIP, tauri::path::BaseDirectory::Resource) {
        Ok(p) if p.is_file() => p,
        _ => return Ok(false),
    };

    let parent = target.parent().ok_or("Pasta de dados inválida")?;
    let partial = parent.join(format!("{TINYTEX_DIR}.partial"));
    let _ = fs::remove_dir_all(&partial);
    fs::create_dir_all(&partial).map_err(|e| format!("Erro ao preparar o TinyTeX: {e}"))?;

    let file = fs::File::open(&zip_path).map_err(|e| format!("Erro ao abrir o TinyTeX: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("TinyTeX corrompido: {e}"))?;
    let total = archive.len();

    for i in 0..total {
        let mut entry = archive.by_index(i).map_err(|e| format!("TinyTeX corrompido: {e}"))?;
        // enclosed_name recusa entradas com "..", evitando gravar fora da pasta.
        let Some(rel) = entry.enclosed_name() else { continue };
        let out = partial.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = out.parent() {
                fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            let mut dest = fs::File::create(&out).map_err(|e| e.to_string())?;
            io::copy(&mut entry, &mut dest).map_err(|e| format!("Erro ao extrair o TinyTeX: {e}"))?;
        }
        if i % 200 == 0 || i + 1 == total {
            let _ = app.emit("tex-setup-progress", SetupProgress { done: i + 1, total });
        }
    }

    // O zip tem a pasta TinyTeX/ no topo.
    let extracted = partial.join(TINYTEX_DIR);
    let source = if extracted.is_dir() { extracted } else { partial.clone() };
    fs::rename(&source, &target).map_err(|e| format!("Erro ao instalar o TinyTeX: {e}"))?;
    let _ = fs::remove_dir_all(&partial);
    Ok(true)
}

fn detect(app: &AppHandle, custom_bin_dir: Option<&str>) -> Option<TexInstall> {
    if let Some(dir) = custom_bin_dir.filter(|d| !d.trim().is_empty()) {
        if let Some(found) = install_from_bin_dir(PathBuf::from(dir), "custom") {
            return Some(found);
        }
    }
    find_bundled(app).or_else(find_in_path)
}

/// Prepara o LaTeX (extraindo o TinyTeX se preciso) e devolve o que foi encontrado.
/// Retorna `null` se não houver nenhuma distribuição disponível.
#[tauri::command]
pub async fn prepare_tex(
    app: AppHandle,
    state: State<'_, AppState>,
    custom_bin_dir: Option<String>,
) -> Result<Option<TexInstall>, String> {
    let app_for_task = app.clone();
    let found = tauri::async_runtime::spawn_blocking(move || -> Result<Option<TexInstall>, String> {
        extract_bundled(&app_for_task)?;
        Ok(detect(&app_for_task, custom_bin_dir.as_deref()))
    })
    .await
    .map_err(|e| e.to_string())??;

    *state.tex.lock().unwrap() = found.clone();
    Ok(found)
}

fn tlmgr_path(install: &TexInstall) -> PathBuf {
    install
        .bin_dir
        .join(if cfg!(windows) { "tlmgr.bat" } else { "tlmgr" })
}

/// Roda o tlmgr sem abrir janela de console e devolve (sucesso, saída).
fn run_tlmgr(install: &TexInstall, args: &[&str]) -> Result<(bool, String), String> {
    let mut cmd = std::process::Command::new(tlmgr_path(install));
    cmd.args(args).stdin(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().map_err(|e| format!("Não foi possível executar o tlmgr: {e}"))?;
    let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&out.stderr));
    Ok((out.status.success(), text))
}

/// Nome do pacote do TeX Live que contém `file`, a partir da saída de
/// `tlmgr search --global --file /<file>` (linhas "pacote:" seguidas dos caminhos).
fn package_for_file(search_output: &str, file: &str) -> Option<String> {
    let suffix = format!("/{file}");
    let mut current: Option<&str> = None;
    for line in search_output.lines() {
        if !line.starts_with(char::is_whitespace) && line.ends_with(':') && !line.starts_with("tlmgr") {
            current = Some(line.trim_end_matches(':'));
        } else if line.trim().ends_with(&suffix) {
            if let Some(pkg) = current {
                return Some(pkg.to_string());
            }
        }
    }
    None
}

/// Instala (pela internet) o pacote que fornece um arquivo faltante, ex.: "fontawesome5.sty".
/// Só funciona com o TinyTeX/TeX Live (o MiKTeX instala pacotes sozinho).
#[tauri::command]
pub async fn install_missing_file(
    app: AppHandle,
    state: State<'_, AppState>,
    file: String,
) -> Result<String, String> {
    let valid = !file.is_empty()
        && file.len() < 100
        && file.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c));
    if !valid {
        return Err(format!("Nome de arquivo inválido: {file}"));
    }
    let install = current_install(&app, &state).ok_or("Nenhuma distribuição LaTeX encontrada")?;
    if !tlmgr_path(&install).is_file() {
        return Err("Esta distribuição LaTeX não usa o tlmgr. No MiKTeX, os pacotes são instalados automaticamente na compilação.".into());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let (_, found) = run_tlmgr(&install, &["search", "--global", "--file", &format!("/{file}")])?;
        let package = package_for_file(&found, &file)
            .ok_or_else(|| format!("Nenhum pacote do TeX Live contém {file}. Verifique a internet e o nome do arquivo."))?;
        let (ok, output) = run_tlmgr(&install, &["install", &package])?;
        if ok {
            Ok(package)
        } else {
            Err(format!("Falha ao instalar {package}:\n{output}"))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Instalação atual (detecta na hora se `prepare_tex` ainda não rodou).
pub fn current_install(app: &AppHandle, state: &AppState) -> Option<TexInstall> {
    let mut cached = state.tex.lock().unwrap();
    if cached.is_none() {
        *cached = detect(app, None);
    }
    cached.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_package_in_tlmgr_search() {
        let output = "tlmgr: package repository https://mirror.ctan.org (verified)\n\
                      fontawesome:\n\ttexmf-dist/tex/latex/fontawesome/fontawesome.sty\n\
                      fontawesome5:\n\ttexmf-dist/tex/latex/fontawesome5/fontawesome5.sty\n";
        assert_eq!(package_for_file(output, "fontawesome5.sty").as_deref(), Some("fontawesome5"));
        assert_eq!(package_for_file(output, "nada.sty"), None);
    }
}

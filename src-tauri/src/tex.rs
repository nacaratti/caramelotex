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
const VERSION_FILE: &str = ".caramelotex-version";

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
/// Versão gravada pelo scripts/build-tinytex.ps1 dentro do zip (ex.: "2026.10-r2").
fn zip_version(zip_path: &Path) -> Option<String> {
    let file = fs::File::open(zip_path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    let mut entry = archive.by_name(&format!("{TINYTEX_DIR}/{VERSION_FILE}")).ok()?;
    let mut version = String::new();
    io::Read::read_to_string(&mut entry, &mut version).ok()?;
    Some(version.trim().to_string())
}

fn installed_version(target: &Path) -> Option<String> {
    fs::read_to_string(target.join(VERSION_FILE)).ok().map(|v| v.trim().to_string())
}

fn extract_bundled(app: &AppHandle) -> Result<bool, String> {
    let Some(target) = bundled_root(app) else { return Ok(false) };
    let zip_path = match app.path().resolve(TINYTEX_ZIP, tauri::path::BaseDirectory::Resource) {
        Ok(p) if p.is_file() => p,
        _ => return Ok(false),
    };
    // Reextrai quando o instalador traz uma versão diferente da instalada
    // (ex.: atualização do app com pacotes novos). Zips sem versão (v0.1) só
    // são extraídos na primeira vez.
    let wanted = zip_version(&zip_path);
    if target.exists() && (wanted.is_none() || installed_version(&target) == wanted) {
        return Ok(false);
    }

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

    // Atualização: tira a versão antiga do caminho antes de pôr a nova
    let old = parent.join(format!("{TINYTEX_DIR}.old"));
    if target.exists() {
        let _ = fs::remove_dir_all(&old);
        fs::rename(&target, &old).map_err(|e| format!("Erro ao atualizar o TinyTeX (feche outros programas que usem o LaTeX): {e}"))?;
    }
    fs::rename(&source, &target).map_err(|e| format!("Erro ao instalar o TinyTeX: {e}"))?;
    let _ = fs::remove_dir_all(&partial);
    let _ = fs::remove_dir_all(&old);
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

/// Perl e tlmgr.pl da própria instalação (TinyTeX/TeX Live no Windows).
/// Chamá-los direto evita o tlmgr.bat, que passa pelo cmd e quebra
/// argumentos com vírgula (ex.: --data name,shortdesc).
fn tlmgr_perl(install: &TexInstall) -> Option<(PathBuf, PathBuf)> {
    let root = install.bin_dir.parent()?.parent()?;
    let perl = root.join("tlpkg/tlperl/bin").join(format!("perl{EXE}"));
    let script = root.join("texmf-dist/scripts/texlive/tlmgr.pl");
    (perl.is_file() && script.is_file()).then_some((perl, script))
}

fn has_tlmgr(install: &TexInstall) -> bool {
    tlmgr_perl(install).is_some() || tlmgr_path(install).is_file()
}

/// Roda o tlmgr sem abrir janela de console e devolve (sucesso, saída padrão, erros).
fn run_tlmgr_split(install: &TexInstall, args: &[&str]) -> Result<(bool, String, String), String> {
    let mut cmd = match tlmgr_perl(install) {
        Some((perl, script)) => {
            let mut c = std::process::Command::new(perl);
            c.arg(script);
            c
        }
        None => std::process::Command::new(tlmgr_path(install)),
    };
    let mut paths = vec![install.bin_dir.clone()];
    if let Some(existing) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&existing));
    }
    cmd.args(args)
        .env("PATH", std::env::join_paths(paths).map_err(|e| e.to_string())?)
        .stdin(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().map_err(|e| format!("Não foi possível executar o tlmgr: {e}"))?;
    Ok((
        out.status.success(),
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    ))
}

/// Como `run_tlmgr_split`, com a saída e os erros juntos.
fn run_tlmgr(install: &TexInstall, args: &[&str]) -> Result<(bool, String), String> {
    let (ok, mut out, err) = run_tlmgr_split(install, args)?;
    out.push_str(&err);
    Ok((ok, out))
}

#[derive(Serialize)]
pub struct PackageInfo {
    name: String,
    installed: bool,
    description: String,
}

/// Lê linhas `nome,"descrição"` ou `nome,0|1,"descrição"` do `tlmgr info --data`.
fn parse_package_list(output: &str, with_installed_flag: bool) -> Vec<PackageInfo> {
    let mut packages = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        let Some((name, rest)) = line.split_once(',') else { continue };
        if name.is_empty() || name.contains(char::is_whitespace) || name.contains(':') {
            continue;
        }
        let (installed, desc) = if with_installed_flag {
            match rest.split_once(',') {
                Some((flag, desc)) => (flag.trim() == "1", desc),
                None => continue,
            }
        } else {
            (true, rest)
        };
        packages.push(PackageInfo { name: name.to_string(), installed, description: unquote(desc) });
    }
    packages
}

/// O tlmgr põe a descrição entre aspas e escapa as internas com barra (\").
fn unquote(field: &str) -> String {
    let field = field.trim();
    let inner = field
        .strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .unwrap_or(field);
    let mut out = String::with_capacity(inner.len());
    let mut chars = inner.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some(next @ ('"' | '\\')) => out.push(next),
                Some(next) => { out.push(c); out.push(next); }
                None => out.push(c),
            }
        } else {
            out.push(c);
        }
    }
    out
}

fn require_tlmgr(app: &AppHandle, state: &AppState) -> Result<TexInstall, String> {
    let install = current_install(app, state).ok_or("Nenhuma distribuição LaTeX encontrada")?;
    if !has_tlmgr(&install) {
        return Err("Esta distribuição LaTeX não usa o tlmgr. No MiKTeX, os pacotes são instalados pelo MiKTeX Console ou automaticamente na compilação.".into());
    }
    Ok(install)
}

/// Pacotes do LaTeX. `remote = false`: só os instalados (funciona offline).
/// `remote = true`: todos os do repositório, com a marcação de instalado (precisa de internet).
#[tauri::command]
pub async fn list_tex_packages(app: AppHandle, state: State<'_, AppState>, remote: bool) -> Result<Vec<PackageInfo>, String> {
    let install = require_tlmgr(&app, &state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let args: &[&str] = if remote {
            &["info", "--data", "name,installed,shortdesc"]
        } else {
            &["info", "--only-installed", "--data", "name,shortdesc"]
        };
        let (_, out, err) = run_tlmgr_split(&install, args)?;
        let packages = parse_package_list(&out, remote);
        if packages.is_empty() {
            return Err(if remote {
                format!("Não foi possível consultar o repositório de pacotes. Verifique a internet.\n{err}")
            } else {
                format!("Não foi possível listar os pacotes instalados.\n{err}")
            });
        }
        Ok(packages)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Instala um pacote do repositório do TeX Live pelo nome (precisa de internet).
#[tauri::command]
pub async fn install_tex_package(app: AppHandle, state: State<'_, AppState>, name: String) -> Result<String, String> {
    let valid = !name.is_empty()
        && name.len() < 80
        && name.chars().all(|c| c.is_ascii_alphanumeric() || "._+-".contains(c));
    if !valid {
        return Err(format!("Nome de pacote inválido: {name}"));
    }
    let install = require_tlmgr(&app, &state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (ok, output) = run_tlmgr(&install, &["install", &name])?;
        if ok {
            Ok(output)
        } else {
            Err(format!("Falha ao instalar {name}:\n{output}"))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Quais destes arquivos (ex.: "booktabs.sty") a distribuição LaTeX encontra.
#[tauri::command]
pub async fn check_tex_files(app: AppHandle, state: State<'_, AppState>, files: Vec<String>) -> Result<Vec<String>, String> {
    let install = current_install(&app, &state).ok_or("Nenhuma distribuição LaTeX encontrada")?;
    let files: Vec<String> = files
        .into_iter()
        .filter(|f| !f.is_empty() && f.len() < 100 && f.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c)))
        .collect();
    if files.is_empty() {
        return Ok(Vec::new());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(install.tool("kpsewhich"));
        cmd.args(&files).stdin(std::process::Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let out = cmd.output().map_err(|e| format!("Não foi possível executar o kpsewhich: {e}"))?;
        // Imprime só os encontrados, um caminho por linha
        let found: Vec<String> = String::from_utf8_lossy(&out.stdout)
            .lines()
            .filter_map(|l| l.trim().rsplit(['/', '\\']).next().map(str::to_string))
            .filter(|n| !n.is_empty())
            .collect();
        Ok(found)
    })
    .await
    .map_err(|e| e.to_string())?
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
    if !has_tlmgr(&install) {
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

/// Contagem detalhada de palavras com o texcount (segue \input/\include).
/// Devolve a saída do texcount com totais e subcontagens por seção (`-merge -sub=section`).
#[tauri::command]
pub async fn word_count(app: AppHandle, state: State<'_, AppState>, main_file: String) -> Result<String, String> {
    let root = crate::fs_commands::current_root(&state)?;
    let main = crate::paths::resolve_in_root(&root, &main_file)?;
    let install = current_install(&app, &state).ok_or("Nenhuma distribuição LaTeX encontrada")?;
    if !install.has_tool("texcount") {
        return Err("A contagem detalhada usa o texcount, que não está instalado nesta distribuição LaTeX.".into());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let dir = main.parent().unwrap_or(&root).to_path_buf();
        let name = main.file_name().ok_or("Arquivo principal inválido")?.to_string_lossy().into_owned();
        let mut paths = vec![install.bin_dir.clone()];
        if let Some(existing) = std::env::var_os("PATH") {
            paths.extend(std::env::split_paths(&existing));
        }
        let mut cmd = std::process::Command::new(install.tool("texcount"));
        cmd.args(["-inc", "-merge", "-utf8", "-sum", "-sub=section", "-nc", &name])
            .current_dir(&dir)
            .env("PATH", std::env::join_paths(paths).map_err(|e| e.to_string())?)
            .stdin(std::process::Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let out = cmd.output().map_err(|e| format!("Não foi possível executar o texcount: {e}"))?;
        let text = String::from_utf8_lossy(&out.stdout).into_owned();
        if out.status.success() {
            Ok(text)
        } else {
            Err(format!("O texcount falhou:\n{text}{}", String::from_utf8_lossy(&out.stderr)))
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

    #[test]
    fn parses_tlmgr_package_lists() {
        let local = "abntex2,\"Typeset Brazilian documents\"
tlmgr.pl: aviso qualquer
booktabs,\"Publication quality tables, in LaTeX\"
";
        let pkgs = parse_package_list(local, false);
        assert_eq!(pkgs.len(), 2);
        assert_eq!(pkgs[1].name, "booktabs");
        assert!(pkgs[1].installed);
        assert_eq!(pkgs[1].description, "Publication quality tables, in LaTeX");

        let remote = "siunitx,1,\"A comprehensive (SI) units package\"
tikz-feynman,0,\"Feynman diagrams with TikZ\"
";
        let pkgs = parse_package_list(remote, true);
        assert!(pkgs[0].installed && !pkgs[1].installed);
        assert_eq!(pkgs[1].description, "Feynman diagrams with TikZ");

        let quoted = r#"antanilipsum,0,"Generate sentences in the style of \"Amici miei\"""#;
        assert_eq!(parse_package_list(quoted, true)[0].description, r#"Generate sentences in the style of "Amici miei""#);
    }
}

//! Localiza a distribuição LaTeX usada para compilar.
//!
//! Ordem: pasta configurada pelo usuário → TinyTeX do app (baixado da release
//! `tinytex-*` do GitHub e extraído para a pasta de dados na 1ª execução) →
//! TeX do sistema no PATH (MiKTeX / TeX Live).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::AppState;

const EXE: &str = if cfg!(windows) { ".exe" } else { "" };
const TINYTEX_DIR: &str = "TinyTeX";
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
    /// "download", "verify" ou "extract"
    phase: String,
    done: u64,
    total: u64,
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

/// Versão do TinyTeX que o app usa (marca gravada pelo scripts/build-tinytex.ps1
/// dentro do zip). Ao mudar, o app baixa e extrai o novo zip.
const TINYTEX_RELEASE: &str = "2026.10-r2";
/// O zip fica numa release própria do GitHub, fora do instalador.
const TINYTEX_URL: &str =
    "https://github.com/nacaratti/caramelotex/releases/download/tinytex-2026.10-r2/tinytex-2026.10-r2.zip";
const TINYTEX_SIZE: u64 = 222_735_063;
const TINYTEX_SHA256: &str = "86f71c5a8f98e4affe629f06a4dc6b039f86be8493d2669dcac6c0b73c9be967";

fn installed_version(target: &Path) -> Option<String> {
    fs::read_to_string(target.join(VERSION_FILE)).ok().map(|v| v.trim().to_string())
}

/// SHA-256 do arquivo, em hexadecimal.
fn sha256_of(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    io::copy(&mut file, &mut hasher).map_err(|e| e.to_string())?;
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

fn emit_progress(app: &AppHandle, phase: &str, done: u64, total: u64) {
    let _ = app.emit("tex-setup-progress", SetupProgress { phase: phase.into(), done, total });
}

/// Baixa o zip do TinyTeX (com o curl do Windows) mostrando o progresso pelo
/// tamanho do arquivo, e confere o SHA-256 no fim.
fn download_tinytex(dir: &Path, progress: impl Fn(&str, u64, u64)) -> Result<PathBuf, String> {
    let zip = dir.join("tinytex-download.zip");
    let part = dir.join("tinytex-download.zip.part");
    let _ = fs::remove_file(&part);
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    let curl = if cfg!(windows) {
        std::env::var_os("SystemRoot")
            .map(|root| PathBuf::from(root).join("System32").join("curl.exe"))
            .filter(|p| p.is_file())
            .unwrap_or_else(|| PathBuf::from("curl.exe"))
    } else {
        PathBuf::from("curl")
    };
    let mut cmd = std::process::Command::new(curl);
    // --speed-limit/--speed-time: desiste se a conexão parar por 60 s
    cmd.args(["-fsSL", "--retry", "3", "--retry-delay", "5", "--speed-limit", "1024", "--speed-time", "60", "-o"])
        .arg(&part)
        .arg(TINYTEX_URL)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().map_err(|e| format!("Não foi possível iniciar o download do LaTeX: {e}"))?;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        let done = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
        progress("download", done.min(TINYTEX_SIZE), TINYTEX_SIZE);
        std::thread::sleep(std::time::Duration::from_millis(250));
    };
    if !status.success() {
        let mut err = String::new();
        if let Some(mut stderr) = child.stderr.take() {
            let _ = io::Read::read_to_string(&mut stderr, &mut err);
        }
        let _ = fs::remove_file(&part);
        return Err(format!(
            "Não foi possível baixar o LaTeX (cerca de 210 MB). Na primeira vez, o CarameloTeX precisa de internet para baixá-lo; depois funciona sem conexão.\n\n{}",
            err.trim()
        ));
    }
    progress("verify", TINYTEX_SIZE, TINYTEX_SIZE);
    let hash = sha256_of(&part)?;
    if hash != TINYTEX_SHA256 {
        let _ = fs::remove_file(&part);
        return Err("O download do LaTeX veio corrompido. Tente de novo.".into());
    }
    let _ = fs::remove_file(&zip);
    fs::rename(&part, &zip).map_err(|e| e.to_string())?;
    Ok(zip)
}

/// Garante o TinyTeX na pasta de dados do app: usa o zip local indicado em
/// CARAMELOTEX_TINYTEX_ZIP (desenvolvimento) ou baixa o da release. Só baixa
/// quando não há TinyTeX ou quando a versão instalada é outra.
fn ensure_tinytex(app: &AppHandle) -> Result<bool, String> {
    let Some(target) = bundled_root(app) else { return Ok(false) };
    if target.exists() {
        match installed_version(&target) {
            Some(v) if v == TINYTEX_RELEASE => return Ok(false),
            // TinyTeX sem marca (instalado pela v0.1): mantém
            None => return Ok(false),
            Some(_) => {}
        }
    }
    let parent = target.parent().ok_or("Pasta de dados inválida")?.to_path_buf();

    let local = std::env::var_os("CARAMELOTEX_TINYTEX_ZIP").map(PathBuf::from).filter(|p| p.is_file());
    let (zip_path, downloaded) = match local {
        Some(path) => (path, false),
        None => (download_tinytex(&parent, |phase, done, total| emit_progress(app, phase, done, total))?, true),
    };
    let result = extract_tinytex(app, &zip_path, &target, &parent);
    if downloaded {
        let _ = fs::remove_file(&zip_path);
    }
    result.map(|_| true)
}

/// Extrai para uma pasta temporária e renomeia no fim, para nunca deixar uma
/// instalação pela metade.
fn extract_tinytex(app: &AppHandle, zip_path: &Path, target: &Path, parent: &Path) -> Result<(), String> {
    let partial = parent.join(format!("{TINYTEX_DIR}.partial"));
    let _ = fs::remove_dir_all(&partial);
    fs::create_dir_all(&partial).map_err(|e| format!("Erro ao preparar o TinyTeX: {e}"))?;

    let file = fs::File::open(zip_path).map_err(|e| format!("Erro ao abrir o TinyTeX: {e}"))?;
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
            emit_progress(app, "extract", (i + 1) as u64, total as u64);
        }
    }

    // O zip tem a pasta TinyTeX/ no topo.
    let extracted = partial.join(TINYTEX_DIR);
    let source = if extracted.is_dir() { extracted } else { partial.clone() };

    // Atualização: tira a versão antiga do caminho antes de pôr a nova
    let old = parent.join(format!("{TINYTEX_DIR}.old"));
    if target.exists() {
        let _ = fs::remove_dir_all(&old);
        fs::rename(target, &old).map_err(|e| format!("Erro ao atualizar o TinyTeX (feche outros programas que usem o LaTeX): {e}"))?;
    }
    fs::rename(&source, target).map_err(|e| format!("Erro ao instalar o TinyTeX: {e}"))?;
    let _ = fs::remove_dir_all(&partial);
    let _ = fs::remove_dir_all(&old);
    Ok(())
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
        // Sem internet na 1ª vez, ainda dá para usar um MiKTeX/TeX Live instalado
        let prepared = ensure_tinytex(&app_for_task);
        match (detect(&app_for_task, custom_bin_dir.as_deref()), prepared) {
            (Some(found), _) => Ok(Some(found)),
            (None, Err(e)) => Err(e),
            (None, Ok(_)) => Ok(None),
        }
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

/// Mensagem do tlmgr quando o repositório traz uma versão nova do próprio tlmgr:
/// enquanto ele não se atualizar, recusa qualquer instalação.
const SELF_UPDATE_NEEDED: &str = "tlmgr itself needs to be updated";

/// Roda o tlmgr sem abrir janela de console e devolve (sucesso, saída padrão, erros).
/// Se o tlmgr pedir para ser atualizado, atualiza e tenta de novo uma vez.
fn run_tlmgr_split(install: &TexInstall, args: &[&str]) -> Result<(bool, String, String), String> {
    let (ok, out, err) = run_tlmgr_once(install, args)?;
    let needs_update = !ok && (out.contains(SELF_UPDATE_NEEDED) || err.contains(SELF_UPDATE_NEEDED));
    if !needs_update || args.first() == Some(&"update") {
        return Ok((ok, out, err));
    }
    self_update_tlmgr(install)?;
    run_tlmgr_once(install, args)
}

/// `tlmgr update --self`. No Windows o tlmgr só prepara a atualização e deixa
/// o script temp/updater-w32, que o tlmgr.bat rodaria ao terminar; como o app
/// chama o tlmgr.pl direto, roda o script aqui.
fn self_update_tlmgr(install: &TexInstall) -> Result<(), String> {
    let _only_one = SELF_UPDATE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let (ok, out, err) = run_tlmgr_once(install, &["update", "--self"])?;
    if !ok {
        return Err(format!("Não foi possível atualizar o tlmgr:\n{out}{err}"));
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let Some(root) = install.bin_dir.parent().and_then(Path::parent) else { return Ok(()) };
        let temp = root.join("temp");
        let pending = temp.join("updater-w32");
        if !pending.is_file() {
            return Ok(());
        }
        // O tlmgr.bat renomeia antes de rodar, para o script valer uma vez só
        let script = temp.join("updater-w32.bat");
        let _ = fs::remove_file(&script);
        fs::rename(&pending, &script).map_err(|e| format!("Erro ao preparar a atualização do tlmgr: {e}"))?;
        // O script roda o tlmgr.pl, que precisa da pasta bin no PATH para se achar
        let mut paths = vec![install.bin_dir.clone()];
        if let Some(existing) = std::env::var_os("PATH") {
            paths.extend(std::env::split_paths(&existing));
        }
        let path_env = std::env::join_paths(paths).map_err(|e| e.to_string())?;
        let _queue = TLMGR_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let status = std::process::Command::new("cmd.exe")
            .args(["/d", "/c"])
            .arg(&script)
            .current_dir(&temp)
            .env("PATH", path_env)
            .stdin(std::process::Stdio::null())
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .status()
            .map_err(|e| format!("Não foi possível atualizar o tlmgr: {e}"))?;
        if !status.success() {
            let log = fs::read_to_string(temp.join("update-self.log")).unwrap_or_default();
            return Err(format!("A atualização do tlmgr falhou:\n{log}"));
        }
    }
    Ok(())
}

/// Uma atualização do próprio tlmgr por vez (várias instalações podem pedir juntas).
static SELF_UPDATE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn run_tlmgr_once(install: &TexInstall, args: &[&str]) -> Result<(bool, String, String), String> {
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
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    // O tlmgr não aceita duas operações ao mesmo tempo na mesma instalação
    // (ex.: a instalação automática e um clique na janela Pacotes): uma por vez.
    let _queue = TLMGR_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    let mut child = cmd.spawn().map_err(|e| format!("Não foi possível executar o tlmgr: {e}"))?;
    let read_all = |mut pipe: Box<dyn io::Read + Send>| {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = pipe.read_to_end(&mut buf);
            buf
        })
    };
    let stdout = read_all(Box::new(child.stdout.take().ok_or("Saída do tlmgr indisponível")?));
    let stderr = read_all(Box::new(child.stderr.take().ok_or("Saída do tlmgr indisponível")?));

    // Sem limite, uma conexão que cai no meio do download deixa a instalação
    // parada para sempre.
    let deadline = std::time::Instant::now() + TLMGR_TIMEOUT;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break Some(status);
        }
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    };
    let out = String::from_utf8_lossy(&stdout.join().unwrap_or_default()).into_owned();
    let err = String::from_utf8_lossy(&stderr.join().unwrap_or_default()).into_owned();
    match status {
        Some(status) => Ok((status.success(), out, err)),
        None => Err(format!(
            "O tlmgr passou de {} minutos e foi interrompido. Verifique a internet e tente de novo.",
            TLMGR_TIMEOUT.as_secs() / 60
        )),
    }
}

/// Fila das operações do tlmgr (uma por vez).
static TLMGR_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
/// Tempo máximo de uma operação do tlmgr (pacotes grandes levam alguns minutos).
const TLMGR_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);

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

/// Repositórios usados pelo tlmgr (o do TinyTeX e o redirecionador da CTAN).
const REPOSITORY_HOSTS: [&str; 2] = ["tlnet.yihui.org:443", "mirror.ctan.org:443"];

/// Há conexão com a internet? Tenta abrir uma conexão com os repositórios de
/// pacotes (até 3 s cada), sem baixar nada.
#[tauri::command]
pub async fn has_internet() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        use std::net::{TcpStream, ToSocketAddrs};
        use std::time::Duration;
        REPOSITORY_HOSTS.iter().any(|host| {
            host.to_socket_addrs()
                .map(|mut addrs| addrs.any(|addr| TcpStream::connect_timeout(&addr, Duration::from_secs(3)).is_ok()))
                .unwrap_or(false)
        })
    })
    .await
    .unwrap_or(false)
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

    /// Baixa de verdade o zip do TinyTeX da release (cerca de 210 MB) para uma
    /// pasta temporária e confere tamanho, SHA-256 e a marca de versão.
    #[test]
    #[ignore = "baixa 210 MB da internet"]
    fn downloads_tinytex_release() {
        let dir = std::env::temp_dir().join("caramelotex-tinytex-download-test");
        let _ = fs::remove_dir_all(&dir);
        let phases = std::sync::Mutex::new(Vec::new());
        let zip = download_tinytex(&dir, |phase, done, total| {
            let mut seen = phases.lock().unwrap();
            if seen.last() != Some(&phase.to_string()) {
                seen.push(phase.to_string());
            }
            assert!(done <= total);
        })
        .expect("download");
        assert_eq!(fs::metadata(&zip).unwrap().len(), TINYTEX_SIZE);
        assert_eq!(sha256_of(&zip).unwrap(), TINYTEX_SHA256);
        let mut archive = zip::ZipArchive::new(fs::File::open(&zip).unwrap()).unwrap();
        let mut marker = String::new();
        io::Read::read_to_string(&mut archive.by_name(&format!("{TINYTEX_DIR}/{VERSION_FILE}")).unwrap(), &mut marker).unwrap();
        assert_eq!(marker.trim(), TINYTEX_RELEASE);
        assert_eq!(*phases.lock().unwrap(), ["download", "verify"]);
        let _ = fs::remove_dir_all(&dir);
    }

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

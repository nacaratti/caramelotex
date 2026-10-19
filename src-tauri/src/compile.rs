//! Compilação local com latexmk (ou, sem latexmk, uma sequência manual
//! engine → bibtex/biber → engine → engine).
//!
//! A resposta traz só os nomes do PDF e do `.synctex.gz` gerados; a interface
//! lê os bytes com `read_build_file` (binário, sem base64).

use std::ffi::OsString;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::fs_commands::{current_root, BUILD_DIR};
use crate::paths::resolve_in_root;
use crate::tex::{current_install, TexInstall};
use crate::AppState;

const DEFAULT_TIMEOUT_SECS: u64 = 180;

/// Processo em execução, para o `cancel_compile` conseguir encerrá-lo.
#[derive(Default)]
pub struct CompileState {
    pid: Mutex<Option<u32>>,
    cancelled: AtomicBool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileResult {
    ok: bool,
    /// Nome do PDF na pasta de build (presente mesmo com erros, se o LaTeX chegou a gerar um)
    pdf_file: Option<String>,
    synctex_file: Option<String>,
    /// Conteúdo do .log do LaTeX (ou a saída do processo, se não houver .log)
    log: String,
    /// Saída do latexmk/bibtex/biber
    output: String,
    engine: String,
    tex_source: String,
    duration_ms: u128,
    cancelled: bool,
    timed_out: bool,
}

enum RunEnd {
    Exited(bool),
    Cancelled,
    TimedOut,
}

struct Job {
    install: TexInstall,
    path_env: OsString,
    bib_dir: PathBuf,
    state: Arc<CompileState>,
    deadline: Instant,
    output: String,
}

impl Job {
    /// Executa um programa do TeX acompanhando cancelamento e timeout.
    fn run(&mut self, tool: &str, args: &[String], cwd: &Path) -> Result<RunEnd, String> {
        let mut cmd = Command::new(self.install.tool(tool));
        cmd.args(args)
            .current_dir(cwd)
            .env("PATH", &self.path_env)
            // Deixa bibtex/biber acharem .bib/.bst da pasta do documento
            // mesmo rodando dentro da pasta de build.
            .env("BIBINPUTS", join_search_path(&self.bib_dir))
            .env("BSTINPUTS", join_search_path(&self.bib_dir))
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        self.output.push_str(&format!("$ {tool} {}\n", args.join(" ")));
        let mut child = cmd.spawn().map_err(|e| format!("Não foi possível executar {tool}: {e}"))?;
        *self.state.pid.lock().unwrap() = Some(child.id());

        // Lê stdout/stderr em threads para o processo não travar com o buffer cheio.
        let readers: Vec<_> = [child.stdout.take().map(boxed), child.stderr.take().map(boxed)]
            .into_iter()
            .flatten()
            .map(|mut pipe| {
                thread::spawn(move || {
                    let mut buf = Vec::new();
                    let _ = pipe.read_to_end(&mut buf);
                    String::from_utf8_lossy(&buf).into_owned()
                })
            })
            .collect();

        let end = loop {
            if self.state.cancelled.load(Ordering::SeqCst) {
                kill_tree(&mut child);
                break RunEnd::Cancelled;
            }
            if Instant::now() > self.deadline {
                kill_tree(&mut child);
                break RunEnd::TimedOut;
            }
            match child.try_wait() {
                Ok(Some(status)) => break RunEnd::Exited(status.success()),
                Ok(None) => thread::sleep(Duration::from_millis(50)),
                Err(e) => return Err(e.to_string()),
            }
        };
        *self.state.pid.lock().unwrap() = None;

        for reader in readers {
            self.output.push_str(&reader.join().unwrap_or_default());
        }
        self.output.push('\n');
        Ok(end)
    }
}

fn boxed<R: Read + Send + 'static>(r: R) -> Box<dyn Read + Send> {
    Box::new(r)
}

/// Caminho de busca do kpathsea: a pasta dada + os padrões (separador final).
fn join_search_path(dir: &Path) -> OsString {
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut s = dir.as_os_str().to_owned();
    s.push(sep);
    s
}

/// No Windows o latexmk (perl) abre o pdflatex como filho: encerra a árvore toda.
fn kill_tree(child: &mut std::process::Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .creation_flags(0x0800_0000)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn engine_flag(engine: &str) -> Result<&'static str, String> {
    match engine {
        "pdflatex" => Ok("-pdf"),
        "xelatex" => Ok("-xelatex"),
        "lualatex" => Ok("-lualatex"),
        other => Err(format!("Compilador não suportado: {other}")),
    }
}

fn is_newer(path: &Path, since: SystemTime) -> bool {
    // Ignora PDF/SyncTeX de uma compilação anterior que falhou antes de gravar.
    fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|modified| modified + Duration::from_secs(1) >= since)
        .unwrap_or(false)
}

fn compile_blocking(
    root: PathBuf,
    main_file: String,
    engine: String,
    install: TexInstall,
    state: Arc<CompileState>,
    timeout: Duration,
) -> Result<CompileResult, String> {
    let started = Instant::now();
    let started_at = SystemTime::now();
    engine_flag(&engine)?;

    let main_path = resolve_in_root(&root, &main_file)?;
    if !main_path.is_file() {
        return Err(format!("Arquivo principal não encontrado: {main_file}"));
    }
    let main_dir = main_path.parent().unwrap_or(&root).to_path_buf();
    let main_name = main_path.file_name().unwrap().to_string_lossy().into_owned();
    let stem = main_path.file_stem().unwrap().to_string_lossy().into_owned();

    let outdir = root.join(BUILD_DIR);
    fs::create_dir_all(&outdir).map_err(|e| format!("Erro ao criar a pasta de build: {e}"))?;
    let outdir_str = outdir.display().to_string();

    let mut paths = vec![install.bin_dir.clone()];
    if let Some(existing) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&existing));
    }
    let path_env = std::env::join_paths(paths).map_err(|e| e.to_string())?;

    let mut job = Job {
        install: install.clone(),
        path_env,
        bib_dir: main_dir.clone(),
        state,
        deadline: Instant::now() + timeout,
        output: String::new(),
    };

    let engine_args = vec![
        "-synctex=1".to_string(),
        "-interaction=nonstopmode".to_string(),
        "-file-line-error".to_string(),
        format!("-output-directory={outdir_str}"),
        main_name.clone(),
    ];

    let end = if install.has_latexmk {
        let args = vec![
            engine_flag(&engine)?.to_string(),
            "-synctex=1".into(),
            "-interaction=nonstopmode".into(),
            "-file-line-error".into(),
            format!("-outdir={outdir_str}"),
            main_name.clone(),
        ];
        job.run("latexmk", &args, &main_dir)?
    } else {
        // Sem latexmk (ex.: MiKTeX sem Perl): engine, bibliografia, engine, engine.
        let mut end = job.run(&engine, &engine_args, &main_dir)?;
        if matches!(end, RunEnd::Exited(_)) {
            let aux = fs::read_to_string(outdir.join(format!("{stem}.aux"))).unwrap_or_default();
            if outdir.join(format!("{stem}.bcf")).is_file() && install.has_tool("biber") {
                end = job.run("biber", &[stem.clone()], &outdir)?;
            } else if aux.contains("\\bibdata") && install.has_tool("bibtex") {
                end = job.run("bibtex", &[stem.clone()], &outdir)?;
            }
        }
        for _ in 0..2 {
            if !matches!(end, RunEnd::Exited(_)) {
                break;
            }
            end = job.run(&engine, &engine_args, &main_dir)?;
            let log = fs::read_to_string(outdir.join(format!("{stem}.log"))).unwrap_or_default();
            if !log.contains("Rerun to get") && !log.contains("Please rerun") {
                break;
            }
        }
        end
    };

    let log_bytes = fs::read(outdir.join(format!("{stem}.log"))).unwrap_or_default();
    let log = if log_bytes.is_empty() {
        job.output.clone()
    } else {
        String::from_utf8_lossy(&log_bytes).into_owned()
    };
    // Com sucesso, o PDF existente vale mesmo sem ter sido regravado (o latexmk
    // pula a compilação quando nada mudou). Com falha, só aceita o que esta
    // execução gravou, para não mostrar o PDF de uma compilação antiga.
    let succeeded = matches!(end, RunEnd::Exited(true));
    let output_file = |name: String| {
        let path = outdir.join(&name);
        let valid = if succeeded { path.is_file() } else { is_newer(&path, started_at) };
        valid.then_some(name)
    };
    let pdf = output_file(format!("{stem}.pdf"));
    let synctex = output_file(format!("{stem}.synctex.gz"));

    let (ok, cancelled, timed_out) = match end {
        RunEnd::Exited(success) => (success && pdf.is_some(), false, false),
        RunEnd::Cancelled => (false, true, false),
        RunEnd::TimedOut => (false, false, true),
    };

    Ok(CompileResult {
        ok,
        pdf_file: pdf,
        synctex_file: synctex,
        log,
        output: job.output,
        engine,
        tex_source: install.source,
        duration_ms: started.elapsed().as_millis(),
        cancelled,
        timed_out,
    })
}

#[tauri::command]
pub async fn compile_project(
    app: AppHandle,
    state: State<'_, AppState>,
    main_file: String,
    engine: String,
    timeout_secs: Option<u64>,
) -> Result<CompileResult, String> {
    let root = current_root(&state)?;
    let install = current_install(&app, &state).ok_or(
        "Nenhuma distribuição LaTeX encontrada. Reinstale o CarameloTeX ou instale o MiKTeX/TeX Live.",
    )?;

    // Uma compilação por vez: a nova substitui a anterior.
    cancel_running(&state.compile);
    state.compile.cancelled.store(false, Ordering::SeqCst);

    let compile_state = Arc::clone(&state.compile);
    let timeout = Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS));
    tauri::async_runtime::spawn_blocking(move || {
        compile_blocking(root, main_file, engine, install, compile_state, timeout)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn cancel_running(state: &CompileState) {
    state.cancelled.store(true, Ordering::SeqCst);
    // Espera o laço de execução perceber o cancelamento e liberar o processo.
    let deadline = Instant::now() + Duration::from_secs(5);
    while state.pid.lock().unwrap().is_some() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(20));
    }
}

/// Lê um arquivo gerado na pasta de build (PDF ou SyncTeX) e devolve os bytes
/// sem conversão para base64.
#[tauri::command]
pub fn read_build_file(name: String, state: State<'_, AppState>) -> Result<tauri::ipc::Response, String> {
    let allowed = (name.ends_with(".pdf") || name.ends_with(".synctex.gz"))
        && !name.contains(['/', '\\', ':'])
        && !name.starts_with('.');
    if !allowed {
        return Err(format!("Arquivo de build inválido: {name}"));
    }
    let root = current_root(&state)?;
    let bytes = fs::read(root.join(BUILD_DIR).join(&name)).map_err(|e| format!("Erro ao ler {name}: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn cancel_compile(state: State<'_, AppState>) -> Result<(), String> {
    let compile_state = Arc::clone(&state.compile);
    tauri::async_runtime::spawn_blocking(move || cancel_running(&compile_state))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    //! Compilação de verdade. Precisa de um LaTeX instalado:
    //!   $env:CARAMELOTEX_TEX_BIN = "...\TinyTeX\bin\windows"
    //!   cargo test -- --ignored --nocapture

    use super::*;
    use crate::paths::canonical;

    fn test_install() -> TexInstall {
        let bin_dir = PathBuf::from(std::env::var("CARAMELOTEX_TEX_BIN").expect("defina CARAMELOTEX_TEX_BIN"));
        let latexmk = bin_dir.join(if cfg!(windows) { "latexmk.exe" } else { "latexmk" });
        TexInstall { source: "test".into(), has_latexmk: latexmk.is_file(), bin_dir }
    }

    fn fresh_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("caramelotex-compile-test").join(name);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        canonical(&dir).unwrap()
    }

    fn copy_dir(from: &Path, to: &Path) {
        for entry in fs::read_dir(from).unwrap().flatten() {
            fs::copy(entry.path(), to.join(entry.file_name())).unwrap();
        }
    }

    fn compile(root: &Path, main: &str, engine: &str, timeout: Duration) -> CompileResult {
        compile_blocking(
            root.to_path_buf(),
            main.into(),
            engine.into(),
            test_install(),
            Arc::new(CompileState::default()),
            timeout,
        )
        .unwrap()
    }

    fn log_tail(result: &CompileResult) -> String {
        let lines: Vec<&str> = result.log.lines().collect();
        lines[lines.len().saturating_sub(25)..].join("\n")
    }

    #[test]
    #[ignore = "precisa de uma distribuição LaTeX (CARAMELOTEX_TEX_BIN)"]
    fn compiles_fixtures_and_templates() {
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let mut cases: Vec<(PathBuf, String, &str)> = Vec::new();

        let bib = fresh_dir("bibtex");
        copy_dir(&repo.join("tests/fixtures/bibtex"), &bib);
        for main in ["bibtex_sample.tex", "biblatex_sample.tex", "natlib_sample.tex"] {
            cases.push((bib.clone(), main.into(), "pdflatex"));
        }

        let templates: Vec<serde_json::Value> =
            serde_json::from_str(&fs::read_to_string(repo.join("src/templates/templates.json")).unwrap()).unwrap();
        for template in &templates {
            let id = template["id"].as_str().unwrap();
            let dir = fresh_dir(&format!("template-{id}"));
            for (path, content) in template["files"].as_object().unwrap() {
                fs::write(dir.join(path), content.as_str().unwrap()).unwrap();
            }
            cases.push((dir, "main.tex".into(), "pdflatex"));
        }

        let xe = fresh_dir("xelatex");
        fs::write(
            xe.join("main.tex"),
            "\\documentclass{article}\n\\usepackage{fontspec}\n\\usepackage[brazilian]{babel}\n\
             \\begin{document}\nAcentuação: ção, ã, é. $E = mc^2$\n\\end{document}\n",
        )
        .unwrap();
        cases.push((xe, "main.tex".into(), "xelatex"));

        let mut failures = Vec::new();
        for (root, main, engine) in &cases {
            let result = compile(root, main, engine, Duration::from_secs(300));
            println!(
                "{:<45} {:<9} ok={} pdf={} synctex={} {}ms",
                format!("{}/{main}", root.file_name().unwrap().to_string_lossy()),
                engine,
                result.ok,
                result.pdf_file.is_some(),
                result.synctex_file.is_some(),
                result.duration_ms
            );
            if !(result.ok && result.pdf_file.is_some() && result.synctex_file.is_some()) {
                failures.push(format!("{}/{main}:\n{}\n{}", root.display(), log_tail(&result), result.output));
            }
        }
        assert!(failures.is_empty(), "Falharam:\n\n{}", failures.join("\n\n---\n\n"));
    }

    #[test]
    #[ignore = "precisa de uma distribuição LaTeX (CARAMELOTEX_TEX_BIN)"]
    fn recompiles_unchanged_document() {
        // O latexmk não regrava o PDF quando nada mudou; ainda assim é um sucesso.
        let dir = fresh_dir("sem-mudancas");
        fs::write(dir.join("main.tex"), "\\documentclass{article}\n\\begin{document}\nOi\n\\end{document}\n").unwrap();
        let first = compile(&dir, "main.tex", "pdflatex", Duration::from_secs(120));
        assert!(first.ok && first.pdf_file.is_some());
        std::thread::sleep(Duration::from_secs(2));
        let second = compile(&dir, "main.tex", "pdflatex", Duration::from_secs(120));
        assert!(second.ok && second.pdf_file.is_some() && second.synctex_file.is_some(), "{}", second.output);
    }

    #[test]
    #[ignore = "precisa de uma distribuição LaTeX (CARAMELOTEX_TEX_BIN)"]
    fn reports_latex_errors_and_timeouts() {
        let dir = fresh_dir("erros");
        fs::write(dir.join("erro.tex"), "\\documentclass{article}\n\\begin{document}\n\\comandoinexistente\n\\end{document}\n").unwrap();
        let result = compile(&dir, "erro.tex", "pdflatex", Duration::from_secs(120));
        assert!(!result.ok);
        assert!(result.log.contains("Undefined control sequence"), "{}", log_tail(&result));

        // Laço infinito: precisa ser encerrado pelo timeout, matando a árvore de processos.
        fs::write(dir.join("loop.tex"), "\\documentclass{article}\n\\begin{document}\n\\def\\x{\\x}\\x\n\\end{document}\n").unwrap();
        let started = Instant::now();
        let result = compile(&dir, "loop.tex", "pdflatex", Duration::from_secs(5));
        assert!(result.timed_out && !result.ok);
        assert!(started.elapsed() < Duration::from_secs(20));
    }
}

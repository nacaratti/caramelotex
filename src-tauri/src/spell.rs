//! Corretor ortográfico pt-BR offline (dicionário Hunspell VERO/LibreOffice
//! lido pela crate spellbook). O dicionário é carregado uma vez, na primeira
//! verificação, e as palavras adicionadas pelo usuário ficam num arquivo na
//! pasta de dados do app.

use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use spellbook::Dictionary;
use tauri::{AppHandle, Manager};

const AFF: &str = "resources/dict/pt_BR.aff";
const DIC: &str = "resources/dict/pt_BR.dic";
const PERSONAL_FILE: &str = "dicionario-pessoal.txt";

static DICTIONARY: OnceLock<Result<Mutex<Dictionary>, String>> = OnceLock::new();

fn read_resource(app: &AppHandle, rel: &str) -> Result<String, String> {
    let path = app
        .path()
        .resolve(rel, tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let text = fs::read_to_string(&path).map_err(|e| format!("Dicionário não encontrado ({}): {e}", path.display()))?;
    Ok(text.trim_start_matches('\u{feff}').to_string())
}

fn personal_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_local_data_dir().ok().map(|d| d.join(PERSONAL_FILE))
}

fn load(app: &AppHandle) -> Result<Mutex<Dictionary>, String> {
    let aff = read_resource(app, AFF)?;
    let dic = read_resource(app, DIC)?;
    let mut dict = Dictionary::new(&aff, &dic).map_err(|e| format!("Dicionário inválido: {e}"))?;
    if let Some(words) = personal_path(app).and_then(|p| fs::read_to_string(p).ok()) {
        for word in words.lines().map(str::trim).filter(|w| !w.is_empty()) {
            let _ = dict.add(word);
        }
    }
    Ok(Mutex::new(dict))
}

fn dictionary(app: &AppHandle) -> Result<&'static Mutex<Dictionary>, String> {
    DICTIONARY.get_or_init(|| load(app)).as_ref().map_err(Clone::clone)
}

/// Devolve as palavras (da lista recebida) que não estão no dicionário.
#[tauri::command]
pub async fn spell_check(app: AppHandle, words: Vec<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dict = dictionary(&app)?.lock().unwrap();
        let unique: HashSet<String> = words.into_iter().collect();
        Ok(unique.into_iter().filter(|w| !dict.check(w)).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Sugestões de correção para uma palavra (até 6).
#[tauri::command]
pub async fn spell_suggest(app: AppHandle, word: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dict = dictionary(&app)?.lock().unwrap();
        let mut out = Vec::new();
        dict.suggest(&word, &mut out);
        // Sugestões que quebram a palavra em duas ("a tenuaçao") raramente ajudam
        out.retain(|s| !s.contains(' '));
        out.truncate(6);
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Aceita a palavra daqui em diante e a guarda no dicionário pessoal.
#[tauri::command]
pub async fn spell_add(app: AppHandle, word: String) -> Result<(), String> {
    let word = word.trim().to_string();
    if word.is_empty() || word.len() > 60 || word.contains(char::is_whitespace) {
        return Err("Palavra inválida".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        dictionary(&app)?
            .lock()
            .unwrap()
            .add(&word)
            .map_err(|e| format!("Não foi possível adicionar a palavra: {e}"))?;
        if let Some(path) = personal_path(&app) {
            if let Some(dir) = path.parent() {
                let _ = fs::create_dir_all(dir);
            }
            let mut file = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&path)
                .map_err(|e| format!("Erro ao salvar o dicionário pessoal: {e}"))?;
            writeln!(file, "{word}").map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use spellbook::Dictionary;

    #[test]
    fn pt_br_dictionary_loads_and_checks() {
        let base = concat!(env!("CARGO_MANIFEST_DIR"), "/resources/dict/");
        let read = |name: &str| {
            std::fs::read_to_string(format!("{base}{name}")).unwrap().trim_start_matches('\u{feff}').to_string()
        };
        let started = std::time::Instant::now();
        let dict = Dictionary::new(&read("pt_BR.aff"), &read("pt_BR.dic")).unwrap();
        println!("dicionário carregado em {:?}", started.elapsed());
        for word in ["atenuação", "fibra", "óptica", "Introdução", "coração", "parâmetros", "medição"] {
            assert!(dict.check(word), "{word} deveria estar no dicionário");
        }
        for word in ["atenuaçao", "fibrra", "medissão"] {
            assert!(!dict.check(word), "{word} não deveria estar no dicionário");
        }
        let mut suggestions = Vec::new();
        dict.suggest("atenuaçao", &mut suggestions);
        println!("sugestões para atenuaçao: {suggestions:?}");
        assert!(suggestions.iter().any(|s| s == "atenuação"));
    }
}

//! Corretor ortográfico offline em português (dicionário Hunspell VERO) e
//! inglês (SCOWL/LibreOffice), lidos pela crate spellbook. Cada dicionário é
//! carregado na primeira verificação naquele idioma. As palavras adicionadas
//! pelo usuário ficam num arquivo na pasta de dados do app e valem para os dois.

use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use spellbook::Dictionary;
use tauri::{AppHandle, Manager};

const PERSONAL_FILE: &str = "dicionario-pessoal.txt";

type Loaded = OnceLock<Result<Mutex<Dictionary>, String>>;
static PORTUGUESE: Loaded = OnceLock::new();
static ENGLISH: Loaded = OnceLock::new();

/// Idioma pedido pelo editor ("pt-BR" ou "en-US"); o padrão é português.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Language {
    Portuguese,
    English,
}

impl Language {
    const ALL: [Language; 2] = [Language::Portuguese, Language::English];

    fn parse(code: Option<&str>) -> Language {
        if code.unwrap_or_default().to_ascii_lowercase().starts_with("en") {
            Language::English
        } else {
            Language::Portuguese
        }
    }

    fn files(self) -> (&'static str, &'static str) {
        match self {
            Language::Portuguese => ("resources/dict/pt_BR.aff", "resources/dict/pt_BR.dic"),
            Language::English => ("resources/dict/en_US.aff", "resources/dict/en_US.dic"),
        }
    }

    fn slot(self) -> &'static Loaded {
        match self {
            Language::Portuguese => &PORTUGUESE,
            Language::English => &ENGLISH,
        }
    }
}

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

fn load(app: &AppHandle, language: Language) -> Result<Mutex<Dictionary>, String> {
    let (aff, dic) = language.files();
    let aff = read_resource(app, aff)?;
    let dic = read_resource(app, dic)?;
    let mut dict = Dictionary::new(&aff, &dic).map_err(|e| format!("Dicionário inválido: {e}"))?;
    if let Some(words) = personal_path(app).and_then(|p| fs::read_to_string(p).ok()) {
        for word in words.lines().map(str::trim).filter(|w| !w.is_empty()) {
            let _ = dict.add(word);
        }
    }
    Ok(Mutex::new(dict))
}

fn dictionary(app: &AppHandle, language: Language) -> Result<&'static Mutex<Dictionary>, String> {
    language.slot().get_or_init(|| load(app, language)).as_ref().map_err(Clone::clone)
}

/// Devolve as palavras (da lista recebida) que não estão no dicionário do idioma.
#[tauri::command]
pub async fn spell_check(app: AppHandle, words: Vec<String>, lang: Option<String>) -> Result<Vec<String>, String> {
    let language = Language::parse(lang.as_deref());
    tauri::async_runtime::spawn_blocking(move || {
        let dict = dictionary(&app, language)?.lock().unwrap();
        let unique: HashSet<String> = words.into_iter().collect();
        Ok(unique.into_iter().filter(|w| !dict.check(w)).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Sugestões de correção para uma palavra (até 6).
#[tauri::command]
pub async fn spell_suggest(app: AppHandle, word: String, lang: Option<String>) -> Result<Vec<String>, String> {
    let language = Language::parse(lang.as_deref());
    tauri::async_runtime::spawn_blocking(move || {
        let dict = dictionary(&app, language)?.lock().unwrap();
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

/// Aceita a palavra daqui em diante (nos dois idiomas) e a guarda no dicionário pessoal.
#[tauri::command]
pub async fn spell_add(app: AppHandle, word: String, lang: Option<String>) -> Result<(), String> {
    let word = word.trim().to_string();
    if word.is_empty() || word.len() > 60 || word.contains(char::is_whitespace) {
        return Err("Palavra inválida".into());
    }
    let language = Language::parse(lang.as_deref());
    tauri::async_runtime::spawn_blocking(move || {
        dictionary(&app, language)?
            .lock()
            .unwrap()
            .add(&word)
            .map_err(|e| format!("Não foi possível adicionar a palavra: {e}"))?;
        // O outro idioma, se já estiver carregado (senão ele lê o arquivo ao carregar)
        for other in Language::ALL.into_iter().filter(|l| *l != language) {
            if let Some(Ok(dict)) = other.slot().get() {
                let _ = dict.lock().unwrap().add(&word);
            }
        }
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
    use super::Language;
    use spellbook::Dictionary;

    fn load(name: &str) -> Dictionary {
        let base = concat!(env!("CARGO_MANIFEST_DIR"), "/resources/dict/");
        let read = |file: String| {
            std::fs::read_to_string(format!("{base}{file}")).unwrap().trim_start_matches('\u{feff}').to_string()
        };
        Dictionary::new(&read(format!("{name}.aff")), &read(format!("{name}.dic"))).unwrap()
    }

    #[test]
    fn pt_br_dictionary_loads_and_checks() {
        let started = std::time::Instant::now();
        let dict = load("pt_BR");
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

    #[test]
    fn en_us_dictionary_loads_and_checks() {
        let dict = load("en_US");
        for word in ["fiber", "laser", "polarization", "gratings", "thermal", "Introduction", "isn't"] {
            assert!(dict.check(word), "{word} deveria estar no dicionário");
        }
        for word in ["polarizaton", "gratting", "atenuação"] {
            assert!(!dict.check(word), "{word} não deveria estar no dicionário");
        }
        let mut suggestions = Vec::new();
        dict.suggest("polarizaton", &mut suggestions);
        assert!(suggestions.iter().any(|s| s == "polarization"), "{suggestions:?}");
    }

    #[test]
    fn language_codes() {
        assert_eq!(Language::parse(Some("en-US")), Language::English);
        assert_eq!(Language::parse(Some("pt-BR")), Language::Portuguese);
        assert_eq!(Language::parse(None), Language::Portuguese);
    }
}

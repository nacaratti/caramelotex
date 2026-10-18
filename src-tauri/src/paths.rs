//! Resolução de caminhos relativos ao projeto aberto.
//!
//! Todo caminho vindo do frontend é relativo à raiz do projeto e passa por
//! `resolve_in_root`, que recusa caminhos absolutos, `..` e links/junções que
//! apontem para fora da raiz.

use std::path::{Component, Path, PathBuf};

/// Canonicaliza sem o prefixo `\\?\` no Windows (o latexmk/perl não lida bem com ele).
pub fn canonical(path: &Path) -> Result<PathBuf, String> {
    dunce::canonicalize(path).map_err(|e| format!("Não foi possível acessar {}: {e}", path.display()))
}

/// Junta `rel` à `root` (já canônica) garantindo que o resultado fica dentro dela.
/// O caminho final não precisa existir (para criar arquivos novos).
pub fn resolve_in_root(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim();
    if rel.is_empty() {
        return Err("Caminho vazio".into());
    }

    let rel_path = Path::new(rel);
    for component in rel_path.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err(format!("Caminho fora do projeto: {rel}")),
        }
    }

    let full = root.join(rel_path);

    // Confere o ancestral existente mais profundo, para pegar links e junções.
    let mut existing = full.as_path();
    while !existing.exists() {
        existing = existing
            .parent()
            .ok_or_else(|| format!("Caminho inválido: {rel}"))?;
    }
    if !canonical(existing)?.starts_with(root) {
        return Err(format!("Caminho fora do projeto: {rel}"));
    }

    Ok(full)
}

/// Caminho relativo à raiz com `/` como separador (formato usado pelo frontend).
pub fn to_rel(root: &Path, full: &Path) -> Option<String> {
    let rel = full.strip_prefix(root).ok()?;
    let parts: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    Some(parts.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_escapes() {
        let root = canonical(&std::env::temp_dir()).unwrap();
        assert!(resolve_in_root(&root, "../x.tex").is_err());
        assert!(resolve_in_root(&root, "a/../../x.tex").is_err());
        assert!(resolve_in_root(&root, "C:\\Windows\\win.ini").is_err());
        assert!(resolve_in_root(&root, "/etc/passwd").is_err());
        assert!(resolve_in_root(&root, "").is_err());
    }

    #[test]
    fn accepts_nested_new_paths() {
        let root = canonical(&std::env::temp_dir()).unwrap();
        let p = resolve_in_root(&root, "caramelotex-test/sub/novo.tex").unwrap();
        assert!(p.starts_with(&root));
        assert_eq!(to_rel(&root, &p).unwrap(), "caramelotex-test/sub/novo.tex");
    }
}

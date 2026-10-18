// Os comandos de arquivos, compilação e detecção do TeX entram na Fase 2
// (fs_commands.rs, compile.rs, tex.rs).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o CarameloTeX");
}

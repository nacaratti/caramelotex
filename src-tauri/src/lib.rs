mod compile;
mod fs_commands;
mod paths;
mod tex;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Estado compartilhado entre os comandos.
#[derive(Default)]
pub struct AppState {
    /// Raiz canônica do projeto aberto; todos os caminhos são relativos a ela.
    project_root: Mutex<Option<PathBuf>>,
    tex: Mutex<Option<tex::TexInstall>>,
    compile: Arc<compile::CompileState>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            fs_commands::open_project,
            fs_commands::close_project,
            fs_commands::list_project_files,
            fs_commands::read_text_file,
            fs_commands::read_binary_file,
            fs_commands::write_text_file,
            fs_commands::write_binary_file,
            fs_commands::create_folder,
            fs_commands::rename_path,
            fs_commands::delete_path,
            fs_commands::save_project_config,
            fs_commands::create_project_folder,
            tex::prepare_tex,
            tex::install_missing_file,
            compile::compile_project,
            compile::cancel_compile,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o CarameloTeX");
}

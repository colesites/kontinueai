// Support for the code editor (Monaco) in the Files panel.
//
// - `editor_file_stat`: a cheap stamp so open files notice changes made on
//   disk by the coding agent, a CLI agent or another app.
// - `editor_read_text_files`: bulk read of project sources for the
//   TypeScript service, so imports between files resolve.
// - `editor_type_packages` / `editor_type_roots`: declaration files from the
//   project's own node_modules, so diagnostics use the real dependencies.
//
// Every path is relative to the project root and goes through `safe_join`,
// like the agent's own file tools.

use serde::Serialize;
use std::collections::VecDeque;
use std::path::{Path, PathBuf};

use crate::safe_join;

#[derive(Debug, Serialize)]
pub struct FileStamp {
    mtime_ms: f64,
    size: u64,
}

#[derive(Debug, Serialize)]
pub struct TextFile {
    path: String,
    content: String,
}

#[derive(Debug, Serialize)]
pub struct TypePackage {
    /// The package name that was asked for, e.g. `react`.
    name: String,
    files: Vec<TextFile>,
    /// True when the size cap cut the file list short.
    truncated: bool,
}

/// Modification time and size, or `None` when the file is gone.
#[tauri::command(async)]
pub fn editor_file_stat(root: String, path: String) -> Result<Option<FileStamp>, String> {
    let target = safe_join(&root, &path)?;
    let meta = match std::fs::metadata(&target) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Could not read {path}: {error}")),
    };
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0);
    Ok(Some(FileStamp { mtime_ms, size: meta.len() }))
}

/// Read several text files at once. Missing, binary or oversized files are
/// skipped; reading stops once `max_bytes` have been read.
#[tauri::command(async)]
pub fn editor_read_text_files(root: String, paths: Vec<String>, max_bytes: usize) -> Result<Vec<TextFile>, String> {
    let mut out = Vec::new();
    let mut total = 0usize;
    for path in paths {
        let Ok(target) = safe_join(&root, &path) else { continue };
        let Ok(meta) = std::fs::metadata(&target) else { continue };
        if !meta.is_file() || meta.len() > 2 * 1024 * 1024 {
            continue;
        }
        if total + meta.len() as usize > max_bytes {
            break;
        }
        if let Ok(content) = std::fs::read_to_string(&target) {
            total += content.len();
            out.push(TextFile { path, content });
        }
    }
    Ok(out)
}

const PACKAGE_MAX_FILES: usize = 3000;
const PACKAGE_MAX_BYTES: usize = 10 * 1024 * 1024;

fn is_declaration(name: &str) -> bool {
    name.ends_with(".d.ts") || name.ends_with(".d.mts") || name.ends_with(".d.cts")
}

fn is_ts_source(name: &str) -> bool {
    (name.ends_with(".ts") || name.ends_with(".tsx") || name.ends_with(".mts") || name.ends_with(".cts"))
        && !is_declaration(name)
}

/// `@scope/name` → `@types/scope__name`, `name` → `@types/name`.
fn types_package_for(name: &str) -> String {
    match name.strip_prefix('@') {
        Some(scoped) => format!("@types/{}", scoped.replacen('/', "__", 1)),
        None => format!("@types/{name}"),
    }
}

/// `from_dir`, its parents, up to the project root ("").
fn ancestors(from_dir: &str) -> Vec<String> {
    let mut dirs = Vec::new();
    let mut current = from_dir.trim_matches('/').to_string();
    loop {
        dirs.push(current.clone());
        if current.is_empty() {
            break;
        }
        current = match current.rfind('/') {
            Some(index) => current[..index].to_string(),
            None => String::new(),
        };
    }
    dirs
}

fn rel_join(dir: &str, rest: &str) -> String {
    if dir.is_empty() {
        rest.to_string()
    } else {
        format!("{dir}/{rest}")
    }
}

/// The nearest `node_modules/<package>` above `from_dir`, as a root-relative path.
fn find_package(root: &str, from_dir: &str, package: &str) -> Option<(String, PathBuf)> {
    for dir in ancestors(from_dir) {
        let rel = rel_join(&dir, &format!("node_modules/{package}"));
        if let Ok(abs) = safe_join(root, &rel) {
            if std::fs::metadata(&abs).map(|m| m.is_dir()).unwrap_or(false) {
                return Some((rel, abs));
            }
        }
    }
    None
}

/// The files TypeScript may need from one package: every package.json and
/// declaration file (or the .ts sources of a source-only workspace package).
fn collect_package(rel: &str, abs: &Path) -> (Vec<TextFile>, bool) {
    let mut found: Vec<(String, PathBuf, bool)> = Vec::new(); // (rel, abs, is_declaration_or_manifest)
    let mut queue = VecDeque::from([(String::new(), abs.to_path_buf(), 0usize)]);
    while let Some((sub, dir, depth)) = queue.pop_front() {
        if depth > 12 || found.len() > PACKAGE_MAX_FILES * 2 {
            break;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path();
            let child = if sub.is_empty() { name.clone() } else { format!("{sub}/{name}") };
            let Ok(meta) = std::fs::metadata(&path) else { continue };
            if meta.is_dir() {
                if name == "node_modules" || name.starts_with('.') {
                    continue;
                }
                queue.push_back((child, path, depth + 1));
            } else if name == "package.json" || is_declaration(&name) {
                found.push((child, path, true));
            } else if is_ts_source(&name) {
                found.push((child, path, false));
            }
        }
    }
    // Packages that ship declarations only need those; a workspace package
    // that ships TypeScript sources is read from its sources.
    let has_declarations = found.iter().any(|(rel, _, primary)| *primary && !rel.ends_with("package.json"));
    let mut files = Vec::new();
    let mut total = 0usize;
    let mut truncated = false;
    for (sub, path, primary) in found {
        if !primary && has_declarations {
            continue;
        }
        if files.len() >= PACKAGE_MAX_FILES {
            truncated = true;
            break;
        }
        let Ok(content) = std::fs::read_to_string(&path) else { continue };
        if total + content.len() > PACKAGE_MAX_BYTES {
            truncated = true;
            break;
        }
        total += content.len();
        files.push(TextFile { path: format!("{rel}/{sub}"), content });
    }
    (files, truncated)
}

/// Declaration files for the given package names, resolved like Node does
/// from `from_dir` (a root-relative folder). Each name also checks `@types`.
#[tauri::command]
pub async fn editor_type_packages(root: String, from_dir: String, packages: Vec<String>) -> Result<Vec<TypePackage>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::new();
        for name in packages {
            if name.contains("..") || name.starts_with('/') {
                continue;
            }
            for candidate in [name.clone(), types_package_for(&name)] {
                if candidate.starts_with("@types/@types") {
                    continue;
                }
                if let Some((rel, abs)) = find_package(&root, &from_dir, &candidate) {
                    let (files, truncated) = collect_package(&rel, &abs);
                    out.push(TypePackage { name: name.clone(), files, truncated });
                }
            }
        }
        out
    })
    .await
    .map_err(|error| error.to_string())
}

/// Package names under every `node_modules/@types` above `from_dir`, which
/// TypeScript includes automatically when tsconfig has no `types` list.
#[tauri::command(async)]
pub fn editor_type_roots(root: String, from_dir: String) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    for dir in ancestors(&from_dir) {
        let rel = rel_join(&dir, "node_modules/@types");
        let Ok(abs) = safe_join(&root, &rel) else { continue };
        let Ok(entries) = std::fs::read_dir(&abs) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            // @types/scope__name is the types for @scope/name.
            let package = match name.split_once("__") {
                Some((scope, rest)) => format!("@{scope}/{rest}"),
                None => name,
            };
            if !names.contains(&package) {
                names.push(package);
            }
        }
    }
    names.sort();
    Ok(names)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn types_names() {
        assert_eq!(types_package_for("react"), "@types/react");
        assert_eq!(types_package_for("@babel/core"), "@types/babel__core");
    }

    #[test]
    fn walks_up_to_root() {
        assert_eq!(ancestors("apps/web/src"), vec!["apps/web/src", "apps/web", "apps", ""]);
        assert_eq!(ancestors(""), vec![""]);
    }
}

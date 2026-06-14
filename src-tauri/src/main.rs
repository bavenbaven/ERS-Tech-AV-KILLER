// Hide console window on Windows
#![windows_subsystem = "windows"]

use serde::Deserialize;
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;

struct AppState {
    unlocked: Mutex<bool>,
}

#[derive(Deserialize, Debug)]
struct AuthData {
    #[serde(default)]
    keys: Vec<String>,
    #[serde(default)]
    users: std::collections::HashMap<String, String>,
    #[serde(default)]
    allowed_versions: Option<Vec<String>>,
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn get_adb_path() -> String {
    let candidates = [
        "server/platform-tools/adb.exe",
        "../server/platform-tools/adb.exe",
    ];
    for c in &candidates {
        if Path::new(c).exists() {
            return c.to_string();
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("server").join("platform-tools").join("adb.exe");
            if p.exists() {
                return p.to_string_lossy().to_string();
            }
            if let Some(parent) = dir.parent() {
                let p = parent.join("server").join("platform-tools").join("adb.exe");
                if p.exists() {
                    return p.to_string_lossy().to_string();
                }
            }
        }
    }
    "server/platform-tools/adb.exe".to_string()
}

const VENDOR_IDS: &[&str] = &[
    "0x18d1", "0x04e8", "0x2717", "0x12d1", "0x22d9", "0x2b4c", "0x2d95", "0x22b8", "0x054c",
    "0x1004", "0x0bb4", "0x0b05", "0x19d2", "0x17ef", "0x2a45", "0x1bbb",
];

fn configure_adb_env() -> Result<(), String> {
    let home =
        std::env::var("USERPROFILE").map_err(|_| "Could not find USERPROFILE".to_string())?;
    let adb_dir = Path::new(&home).join(".android");
    if !adb_dir.exists() {
        let _ = fs::create_dir_all(&adb_dir);
    }
    let ini_path = adb_dir.join("adb_usb.ini");
    let mut current_content = fs::read_to_string(&ini_path).unwrap_or_default();

    let mut modified = false;
    for vid in VENDOR_IDS {
        if !current_content.contains(vid) {
            if !current_content.is_empty() && !current_content.ends_with('\n') {
                current_content.push('\n');
            }
            current_content.push_str(vid);
            current_content.push('\n');
            modified = true;
        }
    }

    if modified {
        fs::write(ini_path, current_content).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn new_cmd() -> Command {
    let mut c = Command::new(get_adb_path());
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    c
}

fn run_adb(args: &[&str]) -> Result<String, String> {
    let output = new_cmd()
        .args(args)
        .output()
        .map_err(|e| format!("ADB error: {}", e))?;
    if output.status.success() || !output.stdout.is_empty() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(stderr.trim().to_string())
    }
}

fn run_adb_binary(device_id: &str, command: &str) -> Result<Vec<u8>, String> {
    let output = new_cmd()
        .args(&["-s", device_id, "exec-out", command])
        .output()
        .map_err(|e| format!("ADB error: {}", e))?;
    if output.stdout.len() > 50 {
        Ok(output.stdout)
    } else {
        Err("empty result".to_string())
    }
}

fn run_raw_cmd(program: &str, args: &[&str]) -> Result<String, String> {
    let mut c = Command::new(program);
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    c.args(args)
        .output()
        .map_err(|e| format!("{} error: {}", program, e))
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
}

fn run_adb_vec(args: &[String]) -> Result<String, String> {
    let str_args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_adb(&str_args)
}

#[tauri::command]
fn adb_raw(args: Vec<String>, state: tauri::State<'_, AppState>) -> Result<String, String> {
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }

    run_adb_vec(&args)
}

#[tauri::command]
fn adb_shell(
    device_id: String,
    command: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }

    run_adb(&["-s", &device_id, "shell", &command])
}

#[tauri::command]
fn adb_shell_screenshot(
    device_id: String,
    command: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }

    let data = run_adb_binary(&device_id, &command)?;
    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &data,
    ))
}

#[tauri::command]
fn adb_push(
    device_id: String,
    local: String,
    remote: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }

    run_adb(&["-s", &device_id, "push", &local, &remote])
}

#[tauri::command]
fn adb_pull(
    device_id: String,
    remote: String,
    local: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }

    run_adb(&["-s", &device_id, "pull", &remote, &local])
}

#[tauri::command]
fn adb_devices(state: tauri::State<'_, AppState>) -> Result<String, String> {
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }

    run_adb(&["devices"])
}

#[tauri::command]
fn adb_kill_server(state: tauri::State<'_, AppState>) -> Result<String, String> {
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }

    run_adb(&["kill-server"])
}

#[tauri::command]
fn adb_start_server(state: tauri::State<'_, AppState>) -> Result<String, String> {
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }

    run_adb(&["start-server"])
}

#[tauri::command]
fn adb_install(
    device_id: String,
    apk_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }

    run_adb(&["-s", &device_id, "install", "-r", &apk_path])
}

#[tauri::command]
fn adb_install_safe(
    device_id: String,
    apk_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }

    let src = Path::new(&apk_path);
    if !src.exists() {
        return Err(format!("APK file not found: {}", apk_path));
    }
    
    // 使用时间戳生成随机临时文件名，避免并发冲突
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let temp_dir = std::env::temp_dir();
    let dest = temp_dir.join(format!("ers_install_{}.apk", timestamp));
    
    // 确保临时文件不存在
    let _ = std::fs::remove_file(&dest);
    
    // 复制APK到临时目录
    std::fs::copy(src, &dest).map_err(|e| format!("Cannot copy APK to temp: {}", e))?;
    
    // 带重试机制的安装
    let max_retries = 3;
    let mut last_error = String::new();
    
    for attempt in 1..=max_retries {
        // 使用 -r (替换现有) -g (自动授权所有权限) -t (允许测试APK)
        let result = run_adb(&["-s", &device_id, "install", "-r", "-g", "-t", &dest.to_string_lossy()]);
        
        match result {
            Ok(ref output) if output.contains("Success") => {
                let _ = std::fs::remove_file(&dest);
                return Ok(output.clone());
            }
            Ok(ref output) => {
                last_error = format!("安装失败(尝试{}/{}): {}", attempt, max_retries, output);
                // 如果是特定错误，可能需要等待后重试
                if output.contains("INSTALL_FAILED_INSUFFICIENT_STORAGE") {
                    // 存储空间不足，不需要重试
                    let _ = std::fs::remove_file(&dest);
                    return Err(format!("存储空间不足，无法安装。{}", output));
                }
            }
            Err(e) => {
                last_error = format!("ADB错误(尝试{}/{}): {}", attempt, max_retries, e);
            }
        }
        
        // 如果不是最后一次尝试，等待后重试
        if attempt < max_retries {
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    }
    
    // 清理临时文件
    let _ = std::fs::remove_file(&dest);
    Err(format!("安装失败，已重试{}次。最后错误: {}", max_retries, last_error))
}

#[tauri::command]
fn adb_reconnect(state: tauri::State<'_, AppState>) -> Result<String, String> {
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }

    let _ = configure_adb_env();
    let _ = run_adb(&["kill-server"]);
    std::thread::sleep(std::time::Duration::from_millis(1500));
    let _ = run_adb(&["start-server"]);
    let _ = run_adb(&["usb"]);
    let _ = run_adb(&["reconnect", "offline"]);
    run_adb(&["devices"])
}

#[tauri::command]
fn adb_quick_connect(state: tauri::State<'_, AppState>) -> Result<String, String> {
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }

    let _ = configure_adb_env();
    let _ = run_adb(&["start-server"]);
    let _ = run_adb(&["usb"]);
    let _ = run_adb(&["reconnect", "offline"]);
    run_adb(&["devices"])
}

#[tauri::command]
fn install_driver(state: tauri::State<'_, AppState>) -> Result<String, String> {
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }

    let _ = configure_adb_env();
    let inf_paths = [
        "server/driver/android_winusb.inf",
        "../server/driver/android_winusb.inf",
    ];
    for p in &inf_paths {
        if Path::new(p).exists() {
            // Use /add-driver and /install. On some systems /add-driver alone is not enough.
            let r = run_raw_cmd("pnputil", &["/add-driver", p, "/install"]);
            if let Ok(ref s) = r {
                return Ok(s.clone());
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("server").join("driver").join("android_winusb.inf");
            if p.exists() {
                let r = run_raw_cmd("pnputil", &["/add-driver", p.to_str().unwrap(), "/install"]);
                if let Ok(ref s) = r {
                    return Ok(s.clone());
                }
            }
        }
    }
    Err("Driver file not found".to_string())
}

#[tauri::command]
fn extract_app_icon(apk_path: String, cache_dir: String, pkg: String) -> Result<String, String> {
    let safe_name = pkg.replace(
        |c: char| !c.is_alphanumeric() && c != '.' && c != '_' && c != '-',
        "_",
    );
    let cache_file = Path::new(&cache_dir).join(format!("{}.png", safe_name));

    if cache_file.exists() {
        return Ok(cache_file.to_string_lossy().to_string());
    }

    let file = std::fs::File::open(&apk_path).map_err(|e| format!("Cannot open APK: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Cannot read ZIP: {}", e))?;

    let patterns = [
        "res/mipmap-xxxhdpi/ic_launcher.png",
        "res/mipmap-xxhdpi/ic_launcher.png",
        "res/mipmap-xhdpi/ic_launcher.png",
        "res/mipmap-hdpi/ic_launcher.png",
        "res/mipmap-mdpi/ic_launcher.png",
    ];

    for pattern in &patterns {
        if let Ok(mut entry) = archive.by_name(pattern) {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).ok();
            if buf.len() > 50 {
                std::fs::create_dir_all(&cache_dir).ok();
                std::fs::write(&cache_file, &buf).ok();
                return Ok(cache_file.to_string_lossy().to_string());
            }
        }
        let alt = pattern.replace('/', "\\");
        if let Ok(mut entry) = archive.by_name(&alt) {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).ok();
            if buf.len() > 50 {
                std::fs::create_dir_all(&cache_dir).ok();
                std::fs::write(&cache_file, &buf).ok();
                return Ok(cache_file.to_string_lossy().to_string());
            }
        }
    }

    let mut best: Option<(String, usize)> = None;
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index(i) {
            let name = entry.name().to_lowercase();
            if name.starts_with("res/") && name.ends_with(".png") && !name.contains(".9.") {
                let size = entry.size() as usize;
                if size > 500 && best.as_ref().map_or(true, |b| size > b.1) {
                    best = Some((entry.name().to_string(), size));
                }
            }
        }
    }

    if let Some((name, _)) = best {
        if let Ok(mut entry) = archive.by_name(&name) {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).ok();
            if buf.len() > 50 {
                std::fs::create_dir_all(&cache_dir).ok();
                std::fs::write(&cache_file, &buf).ok();
                return Ok(cache_file.to_string_lossy().to_string());
            }
        }
    }

    Err("No icon".to_string())
}

#[tauri::command]
fn adb_diagnose() -> String {
    let adb = get_adb_path();
    let adb_exists = Path::new(&adb).exists();

    // Check abs path via exe
    let abs_path = std::env::current_exe()
        .ok()
        .and_then(|e| {
            e.parent()
                .map(|d| d.join("server").join("platform-tools").join("adb.exe"))
        })
        .map(|p| format!("{} (exists:{})", p.display(), p.exists()))
        .unwrap_or_else(|| "N/A".to_string());

    // Try running adb devices
    let devices_out = run_adb(&["devices"]).unwrap_or_else(|e| format!("ERROR: {}", e));

    // Check if port 5037 is in use
    let port_check = run_raw_cmd("netstat", &["-ano"]).unwrap_or_default();
    let port_5037 = port_check
        .lines()
        .filter(|l| l.contains(":5037") && l.contains("LISTENING"))
        .collect::<Vec<_>>()
        .join(" | ");

    format!(
        "ADB路径: {}\nADB文件存在: {}\n绝对路径: {}\n设备列表输出:\n{}\n默认端口(5037)占用: {}",
        adb,
        adb_exists,
        abs_path,
        devices_out.trim(),
        if port_5037.is_empty() {
            "未占用".to_string()
        } else {
            port_5037
        }
    )
}

fn startup_adb_prepare() {
    let _ = configure_adb_env();
    let _ = run_adb(&["start-server"]);
}

#[derive(Serialize, Clone)]
struct AdbTrackPayload {
    connected: bool,
    #[serde(rename = "waitingAuthorization")]
    waiting_authorization: bool,
    devices: Vec<AdbDevice>,
}

#[derive(Serialize, Clone)]
struct AdbDevice {
    id: String,
    #[serde(rename = "type")]
    kind: String,
}

fn parse_adb_devices_block(block: &str) -> Vec<AdbDevice> {
    block
        .lines()
        .skip(1)
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return None;
            }
            let mut parts = trimmed.split_whitespace();
            let id = parts.next()?.to_string();
            let kind = parts.next().unwrap_or("unknown").to_string();
            Some(AdbDevice { id, kind })
        })
        .collect()
}

fn start_track_devices(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        let _ = run_adb(&["start-server"]);
        let mut cmd = new_cmd();
        let spawned = cmd
            .args(["track-devices"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn();

        let mut child = match spawned {
            Ok(c) => c,
            Err(_) => {
                std::thread::sleep(std::time::Duration::from_secs(2));
                continue;
            }
        };

        let stdout = match child.stdout.take() {
            Some(s) => s,
            None => {
                let _ = child.kill();
                std::thread::sleep(std::time::Duration::from_secs(2));
                continue;
            }
        };

        let reader = BufReader::new(stdout);
        let mut block = String::new();
        for line_result in reader.lines() {
            match line_result {
                Ok(line) => {
                    if line.trim().is_empty() {
                        if !block.trim().is_empty() {
                            let devices = parse_adb_devices_block(&block);
                            let waiting = devices.iter().any(|d| d.kind == "unauthorized");
                            let online = devices.iter().any(|d| d.kind == "device");
                            let payload = AdbTrackPayload {
                                connected: online,
                                waiting_authorization: waiting,
                                devices,
                            };
                            let _ = app.emit("adb-devices-changed", payload);
                            block.clear();
                        }
                    } else {
                        block.push_str(&line);
                        block.push('\n');
                    }
                }
                Err(_) => break,
            }
        }

        let _ = child.kill();
        std::thread::sleep(std::time::Duration::from_secs(1));
    });
}

#[tauri::command]
async fn verify_license(
    key: Option<String>,
    username: Option<String>,
    password: Option<String>,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<bool, String> {
    let body = fetch_with_fallback("auth.json", 10).await?;
    let clean_body = body.trim_start_matches('\u{feff}');
    let data: AuthData = serde_json::from_str(clean_body).map_err(|e| {
        let snippet = if clean_body.len() > 100 {
            format!("{}...", &clean_body[..100])
        } else {
            clean_body.to_string()
        };
        format!("解析授权数据失败: {}. 接收内容: {}", e, snippet)
    })?;

    let app_version = app_handle.package_info().version.to_string();
    if let Some(versions) = &data.allowed_versions {
        if !versions.is_empty() && !versions.contains(&app_version) {
            return Err(format!(
                "当前版本 (v{}) 已停止服务，请下载最新版本。",
                app_version
            ));
        }
    }

    let mut success = false;
    use hex::encode;
    use sha2::{Digest, Sha256};

    let hash_input = match (&key, &username, &password) {
        (Some(k), _, _) => {
            let mut hasher = Sha256::new();
            hasher.update(k.as_bytes());
            let hash = encode(hasher.finalize());
            if data.keys.contains(&hash) {
                success = true;
            }
            hash
        }
        (_, Some(u), Some(p)) => {
            let mut hasher = Sha256::new();
            hasher.update(p.as_bytes());
            let hash = encode(hasher.finalize());
            if let Some(expected) = data.users.get(u) {
                if expected == &hash {
                    success = true;
                }
            }
            format!("{}:{}", u, hash)
        }
        _ => return Err("Invalid input".to_string()),
    };

    if success {
        *state.unlocked.lock().unwrap() = true;
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."));
        let _ = std::fs::create_dir_all(&app_dir);
        let _ = std::fs::write(app_dir.join("auth.key"), hash_input);
        Ok(true)
    } else {
        Err("Authentication failed".to_string())
    }
}

#[tauri::command]
async fn check_auth_status(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<bool, String> {
    if *state.unlocked.lock().unwrap() {
        return Ok(true);
    }
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let key_path = app_dir.join("auth.key");
    if !key_path.exists() {
        return Ok(false);
    }
    let saved_hash = std::fs::read_to_string(&key_path).unwrap_or_default();

    match fetch_with_fallback("auth.json", 5).await {
        Ok(body) => {
            let clean_body = body.trim_start_matches('\u{feff}');
            if let Ok(data) = serde_json::from_str::<AuthData>(clean_body) {
                let mut valid = false;
                if saved_hash.contains(":") {
                    let parts: Vec<&str> = saved_hash.splitn(2, ':').collect();
                    if parts.len() == 2 {
                        if let Some(expected) = data.users.get(parts[0]) {
                            if expected == parts[1] {
                                valid = true;
                            }
                        }
                    }
                } else {
                    if data.keys.contains(&saved_hash) {
                        valid = true;
                    }
                }

                if valid {
                    if let Some(versions) = &data.allowed_versions {
                        let app_version = app_handle.package_info().version.to_string();
                        if !versions.is_empty() && !versions.contains(&app_version) {
                            valid = false;
                        }
                    }
                }

                if valid {
                    *state.unlocked.lock().unwrap() = true;
                    return Ok(true);
                } else {
                    let _ = std::fs::remove_file(&key_path);
                    return Ok(false);
                }
            }
        }
        Err(_) => {
            *state.unlocked.lock().unwrap() = true;
            return Ok(true);
        }
    }
    Ok(false)
}

// ===== GitHub Sync Commands =====

const GITHUB_REPO: &str = "bavenbaven/ERS-Tech-AV-KILLER";
const GITHUB_RAW: &str = "https://raw.githubusercontent.com/bavenbaven/ERS-Tech-AV-KILLER/main";
const GITHUB_CDN: &str = "https://cdn.jsdelivr.net/gh/bavenbaven/ERS-Tech-AV-KILLER@main";

async fn fetch_with_fallback(path: &str, timeout_secs: u64) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("创建请求失败: {}", e))?;

    // 1. 优先尝试 Cloudflare Workers 代理 (通过 GitHub Contents API 直连)
    let proxy_url = format!(
        "https://ers-github-proxy.bavenbaven.workers.dev/repos/{}/contents/{}",
        GITHUB_REPO, path
    );

    if let Ok(resp) = client
        .get(&proxy_url)
        .header("User-Agent", "ERS-Tech-AV-Killer")
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(file_content) = resp.json::<GitHubFileContent>().await {
                let clean_str: String = file_content
                    .content
                    .chars()
                    .filter(|c| !c.is_whitespace())
                    .collect();
                if let Ok(decoded_bytes) =
                    base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &clean_str)
                {
                    if let Ok(text) = String::from_utf8(decoded_bytes) {
                        let clean_text = text.trim_start_matches('\u{feff}').to_string();
                        // 验证是否是合法 JSON，确保没有拿到被劫持的 HTML 网页
                        if serde_json::from_str::<serde_json::Value>(&clean_text).is_ok() {
                            return Ok(clean_text);
                        }
                    }
                }
            }
        }
    }

    // 2. 备用高速度国内代理以及官方直连 CDN / Raw
    let sources = [
        format!("https://gh-proxy.com/https://raw.githubusercontent.com/{GITHUB_REPO}/main/{path}"),
        format!("https://ghfast.top/https://raw.githubusercontent.com/{GITHUB_REPO}/main/{path}"),
        format!("{GITHUB_CDN}/{path}"),
        format!("{GITHUB_RAW}/{path}"),
    ];

    for url in &sources {
        match client
            .get(url)
            .header("User-Agent", "ERS-Tech-AV-Killer")
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(text) = resp.text().await {
                    let clean_text = text.trim_start_matches('\u{feff}').to_string();
                    // 验证是否是合法 JSON，防止网络劫持返回 HTML 页面
                    if serde_json::from_str::<serde_json::Value>(&clean_text).is_ok() {
                        return Ok(clean_text);
                    }
                }
            }
            _ => continue,
        }
    }
    Err("无法连接服务器或返回数据格式不正确 (所有镜像代理均不可达)".to_string())
}

#[tauri::command]
async fn github_fetch_db(db_name: String) -> Result<String, String> {
    let path = format!("db/{}.json", db_name);
    fetch_with_fallback(&path, 10).await
}

#[derive(Deserialize)]
struct GitHubFileContent {
    sha: String,
    content: String,
}

#[tauri::command]
async fn github_push_db(token: String, db_name: String, content: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建请求失败: {}", e))?;

    // 1. 获取当前文件 SHA
    let get_url = format!(
        "https://ers-github-proxy.bavenbaven.workers.dev/repos/{}/contents/db/{}.json",
        GITHUB_REPO, db_name
    );
    let meta: GitHubFileContent = client
        .get(&get_url)
        .header("Authorization", format!("token {}", token))
        .header("User-Agent", "ERS-Tech-AV-Killer")
        .send()
        .await
        .map_err(|e| format!("获取文件信息失败: {}", e))?
        .json()
        .await
        .map_err(|e| format!("解析文件信息失败: {}", e))?;

    // 2. 推送更新
    let put_url = format!(
        "https://ers-github-proxy.bavenbaven.workers.dev/repos/{}/contents/db/{}.json",
        GITHUB_REPO, db_name
    );
    let encoded = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        content.as_bytes(),
    );
    let body = json!({
        "message": format!("更新 {} {}", db_name, chrono_wrapper()),
        "content": encoded,
        "sha": meta.sha
    });

    let resp = client
        .put(&put_url)
        .header("Authorization", format!("token {}", token))
        .header("User-Agent", "ERS-Tech-AV-Killer")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("推送失败: {}", e))?;

    if resp.status().is_success() {
        Ok("推送成功".to_string())
    } else {
        let err = resp.text().await.unwrap_or_default();
        Err(format!("推送失败: {}", err))
    }
}

fn chrono_wrapper() -> String {
    // 简单的时间戳，避免引入 chrono 依赖
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{}", now)
}

// 多个备用代理服务器列表
const GITHUB_ISSUE_PROXIES: &[&str] = &[
    "https://ers-github-proxy.bavenbaven.workers.dev",
    "https://api.github.com",  // GitHub 官方 API 直连
    "https://ghproxy.com/https://api.github.com",  // ghproxy 代理
    "https://gh-proxy.com/https://api.github.com",  // gh-proxy 代理
];

#[tauri::command]
async fn github_create_issue(token: String, title: String, body: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))  // 增加超时时间到15秒
        .build()
        .map_err(|e| format!("创建请求失败: {}", e))?;

    let body_json = json!({
        "title": title,
        "body": body,
        "labels": ["pending"]
    });

    // 尝试所有代理服务器
    let mut last_error = String::new();
    for (idx, proxy) in GITHUB_ISSUE_PROXIES.iter().enumerate() {
        let url = format!("{}/repos/{}/issues", proxy, GITHUB_REPO);
        
        match client
            .post(&url)
            .header("Authorization", format!("token {}", token))
            .header("User-Agent", "ERS-Tech-AV-Killer")
            .json(&body_json)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(data) = resp.json::<Value>().await {
                    if let Some(html_url) = data["html_url"].as_str() {
                        if !html_url.is_empty() {
                            return Ok(html_url.to_string());
                        }
                    }
                }
            }
            Ok(resp) => {
                let status = resp.status();
                let err_text = resp.text().await.unwrap_or_default();
                last_error = format!("代理{}返回错误({}): {}", idx + 1, status, err_text);
            }
            Err(e) => {
                last_error = format!("代理{}连接失败: {}", idx + 1, e);
            }
        }
        
        // 如果不是最后一个代理，等待一小段时间再尝试下一个
        if idx < GITHUB_ISSUE_PROXIES.len() - 1 {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    }

    Err(format!("所有代理服务器均失败。最后错误: {}", last_error))
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct GitHubIssue {
    number: u64,
    title: String,
    body: Option<String>,
    state: String,
    created_at: String,
    labels: Vec<Value>,
}

#[tauri::command]
async fn github_list_issues(token: String) -> Result<Vec<GitHubIssue>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建请求失败: {}", e))?;

    let url = format!(
        "https://ers-github-proxy.bavenbaven.workers.dev/repos/{}/issues?state=open&labels=pending",
        GITHUB_REPO
    );

    let resp = client
        .get(&url)
        .header("Authorization", format!("token {}", token))
        .header("User-Agent", "ERS-Tech-AV-Killer")
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    if resp.status().is_success() {
        let issues: Vec<GitHubIssue> = resp.json().await.unwrap_or_default();
        Ok(issues)
    } else {
        Err("获取 Issue 列表失败".to_string())
    }
}

#[tauri::command]
async fn github_close_issue(
    token: String,
    issue_number: u64,
    comment: String,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建请求失败: {}", e))?;

    // 1. 添加评论
    let comment_url = format!(
        "https://ers-github-proxy.bavenbaven.workers.dev/repos/{}/issues/{}/comments",
        GITHUB_REPO, issue_number
    );
    let _ = client
        .post(&comment_url)
        .header("Authorization", format!("token {}", token))
        .header("User-Agent", "ERS-Tech-AV-Killer")
        .json(&json!({ "body": comment }))
        .send()
        .await;

    // 2. 关闭 Issue
    let close_url = format!(
        "https://ers-github-proxy.bavenbaven.workers.dev/repos/{}/issues/{}",
        GITHUB_REPO, issue_number
    );
    let resp = client
        .patch(&close_url)
        .header("Authorization", format!("token {}", token))
        .header("User-Agent", "ERS-Tech-AV-Killer")
        .json(&json!({ "state": "closed" }))
        .send()
        .await
        .map_err(|e| format!("关闭失败: {}", e))?;

    if resp.status().is_success() {
        Ok("Issue 已关闭".to_string())
    } else {
        Err("关闭 Issue 失败".to_string())
    }
}

#[tauri::command]
async fn github_save_config(
    app_handle: tauri::AppHandle,
    token: String,
    role: String,
) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = fs::create_dir_all(&app_dir);
    let config = json!({
        "github_token": token,
        "role": role
    });
    fs::write(app_dir.join("github_config.json"), config.to_string())
        .map_err(|e| format!("保存配置失败: {}", e))?;
    Ok("配置已保存".to_string())
}

#[tauri::command]
async fn github_load_config(app_handle: tauri::AppHandle) -> Result<Value, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let config_path = app_dir.join("github_config.json");
    if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_default();
        let data: Value = serde_json::from_str(&content).unwrap_or(json!({}));
        Ok(data)
    } else {
        Ok(json!({ "github_token": "", "role": "guest" }))
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            unlocked: Mutex::new(false),
        })
        .setup(|app| {
            std::thread::spawn(startup_adb_prepare);
            start_track_devices(app.handle().clone());
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            verify_license,
            check_auth_status,
            adb_raw,
            adb_shell,
            adb_shell_screenshot,
            adb_push,
            adb_pull,
            adb_devices,
            adb_kill_server,
            adb_start_server,
            adb_install,
            adb_install_safe,
            install_driver,
            extract_app_icon,
            adb_diagnose,
            adb_reconnect,
            adb_quick_connect,
            github_fetch_db,
            github_push_db,
            github_create_issue,
            github_list_issues,
            github_close_issue,
            github_save_config,
            github_load_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

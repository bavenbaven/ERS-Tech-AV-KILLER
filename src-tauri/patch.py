import re

with open('src/main.rs', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add dependencies and State struct
imports = '''use std::sync::Mutex;
use serde::Deserialize;
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
}

'''
content = content.replace('use tauri::Emitter;\n', 'use tauri::Emitter;\n' + imports)

# 2. Modify commands to check state
def patch_command(match):
    header = match.group(1)
    fn_name = match.group(2)
    args = match.group(3)
    ret = match.group(4)
    body = match.group(5)
    
    if args.strip() == '':
        new_args = "state: tauri::State<'_, AppState>"
    else:
        new_args = args + ", state: tauri::State<'_, AppState>"
        
    check = """
    if !*state.unlocked.lock().unwrap() {
        return Err("Error: Software is locked. Please login first.".to_string());
    }
"""
    return f'{header}fn {fn_name}({new_args}){ret}{{{check}{body}}}'

pattern = re.compile(r'(#\[tauri::command\]\n)fn (adb_\w+|install_driver)\((.*?)\)( -> Result<.*?>) \{([\s\S]*?)\n\}')
content = pattern.sub(patch_command, content)

# 3. Add auth commands
auth_cmds = '''
#[tauri::command]
async fn verify_license(key: Option<String>, username: Option<String>, password: Option<String>, state: tauri::State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<bool, String> {
    let url = "https://raw.githubusercontent.com/bavenbaven/ERS-Tech-AV-KILLER/main/auth.json";
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build().unwrap();
    let resp = client.get(url).send().await.map_err(|e| format!("Network error: {}", e))?;
    let data: AuthData = resp.json().await.map_err(|e| format!("Data parse error: {}", e))?;

    let mut success = false;
    use sha2::{Sha256, Digest};
    use hex::encode;

    let hash_input = match (&key, &username, &password) {
        (Some(k), _, _) => {
            let mut hasher = Sha256::new();
            hasher.update(k.as_bytes());
            let hash = encode(hasher.finalize());
            if data.keys.contains(&hash) {
                success = true;
            }
            hash
        },
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
        },
        _ => return Err("Invalid input".to_string()),
    };

    if success {
        *state.unlocked.lock().unwrap() = true;
        let app_dir = app_handle.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let _ = std::fs::create_dir_all(&app_dir);
        let _ = std::fs::write(app_dir.join("auth.key"), hash_input);
        Ok(true)
    } else {
        Err("Authentication failed".to_string())
    }
}

#[tauri::command]
async fn check_auth_status(state: tauri::State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<bool, String> {
    if *state.unlocked.lock().unwrap() {
        return Ok(true);
    }
    let app_dir = app_handle.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let key_path = app_dir.join("auth.key");
    if !key_path.exists() {
        return Ok(false);
    }
    let saved_hash = std::fs::read_to_string(&key_path).unwrap_or_default();
    
    let url = "https://raw.githubusercontent.com/bavenbaven/ERS-Tech-AV-KILLER/main/auth.json";
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).build().unwrap();
    match client.get(url).send().await {
        Ok(resp) => {
            if let Ok(data) = resp.json::<AuthData>().await {
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
                    *state.unlocked.lock().unwrap() = true;
                    return Ok(true);
                } else {
                    let _ = std::fs::remove_file(&key_path);
                    return Ok(false);
                }
            }
        },
        Err(_) => {
            *state.unlocked.lock().unwrap() = true;
            return Ok(true);
        }
    }
    Ok(false)
}
'''
content = content.replace('fn main() {', auth_cmds + '\\nfn main() {')

# 4. Add manage to main setup and new commands to generate_handler
content = content.replace('tauri::Builder::default()', 'tauri::Builder::default()\\n        .manage(AppState { unlocked: Mutex::new(false) })')
content = content.replace('adb_raw,', 'verify_license, check_auth_status, adb_raw,')

with open('src/main.rs', 'w', encoding='utf-8') as f:
    f.write(content)

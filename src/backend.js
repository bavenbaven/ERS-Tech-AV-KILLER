import { invoke as tauriInvokeCore } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { remove as fsRemove } from '@tauri-apps/plugin-fs';
import { tempDir as pathTempDir } from '@tauri-apps/api/path';

const API_BASE = 'http://127.0.0.1:3001/api';

let isTauri = false;
try {
  isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || !!window.__TAURI__);
} catch {}

const permissionCache = new Map();

// Caches for heavy ADB commands in behaviorScan to ensure 3s loop runs sub-second
let cachedThirdParty = new Set();
let lastThirdPartyFetch = 0;
let cachedBootReceivers = new Set();
let lastBootReceiversFetch = 0;
let cachedOverlayPerms = new Set();
let lastOverlayPermsFetch = 0;
let cachedBatteryStatus = 'unknown';
let lastBatteryFetch = 0;
let cachedNotifications = new Set();
let cachedNotifByPkg = new Map();
let lastNotifFetch = 0;
let cachedLogcatAdEvents = new Map();
let lastLogcatFetch = 0;
let cachedCpuUsage = new Map();
let lastCpuFetch = 0;

async function tauriInvoke(cmd, args = {}) {
  return tauriInvokeCore(cmd, args);
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  return res.json();
}

// ===== ADB Status =====
export async function getAdbStatus() {
  if (isTauri) {
    const raw = await tauriInvoke('adb_devices');
    const lines = raw.trim().split('\n').slice(1).filter(l => l.trim());
    const devices = lines.map(l => { const p = l.trim().split(/\s+/); return { id: p[0], type: p[1] || 'unknown' }; });
    const online = devices.find(d => d.type === 'device');
    const unauth = devices.find(d => d.type === 'unauthorized');
    return { connected: !!online, devices, waitingAuthorization: !!unauth };
  }
  return apiFetch('/adb-status');
}

// ===== Devices =====
export async function listDevices() {
  if (isTauri) {
    const raw = await tauriInvoke('adb_devices');
    const lines = raw.trim().split('\n').slice(1).filter(l => l.trim());
    return lines.map(l => { const p = l.trim().split(/\s+/); return { id: p[0], type: p[1] || 'unknown' }; });
  }
  return apiFetch('/devices');
}

// ===== Reset ADB =====
export async function resetAdb() {
  if (isTauri) {
    await tauriInvoke('adb_kill_server');
    await new Promise(r => setTimeout(r, 2000));
    await tauriInvoke('adb_start_server');
    return { success: true };
  }
  return apiFetch('/reset-adb', { method: 'POST' });
}

export async function reconnectAdb() {
  if (isTauri) {
    await tauriInvoke('adb_reconnect');
    return { success: true };
  }
  return { success: false, error: 'Not supported' };
}

export async function quickConnectAdb() {
  if (isTauri) {
    await tauriInvoke('adb_quick_connect');
    return { success: true };
  }
  return { success: false, error: 'Not supported' };
}

export async function subscribeAdbDeviceEvents(onEvent) {
  if (!isTauri) return () => {};
  const unlisten = await listen('adb-devices-changed', (event) => {
    if (event?.payload) onEvent(event.payload);
  });
  return () => { try { unlisten(); } catch {} };
}

// ===== Device Info =====
export async function getDeviceInfo(deviceId) {
  if (!isTauri) return apiFetch(`/device-info/${deviceId}`);

  const safe = (cmd) => tauriInvoke('adb_shell', { deviceId, command: cmd }).catch(() => '');

  const [props, batteryRaw, storageRaw, memRaw, displayRaw] = await Promise.all([
    safe('getprop ro.product.model; getprop ro.build.version.release; getprop ro.build.version.sdk; getprop ro.product.cpu.abi; getprop ro.product.brand; getprop ro.product.manufacturer; getprop ro.product.name; getprop ro.product.device'),
    safe('dumpsys battery'),
    safe('df /data | tail -1'),
    safe('cat /proc/meminfo | head -3'),
    safe('wm size; wm density'),
  ]);

  const pl = props.split('\n').map(s => s.trim());
  const [model, version, sdk, cpu, brand, manufacturer, productName, deviceName] = pl;

  const battery = { level: '--', temp: '--', voltage: '--', health: '--', technology: '--', status: '--' };
  const lm = batteryRaw.match(/level:\s*(\d+)/); if (lm) battery.level = lm[1];
  const tm = batteryRaw.match(/temperature:\s*(\d+)/); if (tm) battery.temp = (parseInt(tm[1]) / 10).toFixed(1) + '°C';
  const vm = batteryRaw.match(/voltage:\s*(\d+)/); if (vm) battery.voltage = (parseInt(vm[1]) / 1000).toFixed(2) + 'V';
  const hm = batteryRaw.match(/health:\s*(\w+)/); if (hm) battery.health = hm[1];
  const stm = batteryRaw.match(/status:\s*(\d+)/);
  if (stm) { const s = { '1': 'Unknown', '2': 'Charging', '3': 'Discharging', '4': 'Not charging', '5': 'Full' }; battery.status = s[stm[1]] || stm[1]; }

  const storage = { total: '--', used: '--', percent: '--' };
  const parts = storageRaw.split(/\s+/).filter(Boolean);
  if (parts.length >= 5) {
    const totalKB = parseInt(parts[1]) || 0, usedKB = parseInt(parts[2]) || 0;
    storage.total = String(Math.round(totalKB / 1024 / 1024) || '--');
    storage.used = String(Math.round(usedKB / 1024 / 1024) || '--');
    storage.percent = totalKB > 0 ? Math.round((usedKB / totalKB) * 100) + '%' : '--';
  }

  const memory = { total: '--', used: '--', percent: '--' };
  const mt = memRaw.match(/MemTotal:\s+(\d+)/), ma = memRaw.match(/MemAvailable:\s+(\d+)/);
  if (mt && ma) {
    const t = Math.round(parseInt(mt[1]) / 1024), a = Math.round(parseInt(ma[1]) / 1024);
    memory.total = (t / 1024).toFixed(1);
    memory.used = ((t - a) / 1024).toFixed(1);
    memory.percent = t > 0 ? Math.round(((t - a) / t) * 100) + '%' : '--';
  }

  const display = { size: '--', density: '--' };
  const sm = displayRaw.match(/Physical size:\s*(\S+)/), dm = displayRaw.match(/Physical density:\s*(\S+)/);
  if (sm) display.size = sm[1]; if (dm) display.density = dm[1];

  return { battery, storage, memory, display, model: model || '--', version: version || '--', sdk: sdk || '--', cpu: cpu || '--', brand: brand || '--', manufacturer: manufacturer || '--', productName: productName || '--', deviceName: deviceName || '--' };
}

// ===== Apps =====
export async function getApps(deviceId) {
  if (isTauri) {
    const raw = await tauriInvoke('adb_shell', { deviceId, command: 'pm list packages' });
    return raw.trim().split('\n').map(l => l.replace('package:', '').trim()).filter(l => l.length > 0);
  }
  return apiFetch(`/apps/${deviceId}`);
}

// ===== Uninstall =====
export async function uninstallApp(deviceId, pkg) {
  if (isTauri) {
    const raw = await tauriInvoke('adb_shell', { deviceId, command: `pm uninstall ${pkg}` });
    return { success: raw.includes('Success'), result: raw.trim() };
  }
  return apiFetch('/uninstall', { method: 'POST', body: JSON.stringify({ deviceId, pkg }) });
}

// ===== Pick APK file (Tauri native dialog) =====
export async function pickApkFile() {
  if (!isTauri) return null;
  try {
    const selected = await openDialog({
      title: '选择 APK 文件',
      filters: [{ name: 'APK', extensions: ['apk'] }],
      multiple: false,
    });
    if (!selected) return null; // user cancelled
    return typeof selected === 'string' ? selected : selected?.path || String(selected);
  } catch (e) {
    console.error('pickApkFile error:', e);
    throw new Error('打开文件对话框失败，请重试或以管理员身份运行。详情: ' + (e.message || String(e)));
  }
}

// ===== Install APK (local file from PC) =====
export async function installApk(deviceId, file) {
  if (isTauri) {
    // Accept a string path directly (from pickApkFile or manual input)
    let apkPath = typeof file === 'string' ? file : null;
    if (!apkPath) {
      // Fallback: open dialog if no path given
      apkPath = await pickApkFile();
      if (!apkPath) return { success: false, error: '已取消' };
    }
    try {
      const result = await tauriInvoke('adb_install_safe', { deviceId, apkPath: String(apkPath) });
      const ok = result.includes('Success') || result.includes('success') || result.includes('Installing') || !result.includes('Error');
      return { success: ok, result, apkPath };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
  // Web mode: upload via FormData
  const fd = new FormData();
  fd.append('apk', file);
  fd.append('deviceId', deviceId);
  const res = await fetch(`${API_BASE}/install-apk`, { method: 'POST', body: fd });
  return res.json();
}

// ===== Install APK already on phone (remote path) =====
export async function installApkRemote(deviceId, remotePath) {
  if (isTauri) {
    // adb install only works with local files; pull first then install
    const tmpLocal = `${await getTmpDir()}\\ers_install_tmp.apk`;
    await tauriInvoke('adb_pull', { deviceId, remote: remotePath, local: tmpLocal });
    const result = await tauriInvoke('adb_install', { deviceId, apkPath: tmpLocal });
    // clean up
    try { await fsRemove(tmpLocal); } catch {}
    return { success: result.includes('Success') || result.includes('success'), result };
  }
  return { success: false, error: 'Not supported in web mode' };
}

async function getTmpDir() {
  try {
    return await pathTempDir();
  } catch { return 'C:\\Windows\\Temp'; }
}

// ===== Current App =====
export async function getCurrentApp(deviceId) {
  if (isTauri) {
    const raw = await tauriInvoke('adb_shell', { deviceId, command: 'dumpsys activity activities' });
    for (const line of raw.split('\n')) {
      if (line.includes('ResumedActivity') || line.includes('topResumedActivity')) {
        const m = line.match(/\s(\S+?)\//);
        if (m) return m[1];
      }
    }
    return 'Unknown';
  }
  return apiFetch(`/current-app/${deviceId}`);
}

// ===== Screenshot =====
export async function getScreenshot(deviceId) {
  if (isTauri) {
    try {
      // Method 1: screencap to file + base64 (most compatible)
      // Use a timestamped filename to avoid any permission/lock issues
      const tmpFile = `/sdcard/.ers_${Date.now()}.png`;
      await tauriInvoke('adb_shell', { deviceId, command: `screencap -p ${tmpFile}` });
      
      const b64 = await tauriInvoke('adb_shell', { 
        deviceId, 
        command: `base64 ${tmpFile} 2>/dev/null || busybox base64 ${tmpFile}` 
      });
      
      // Clean up temp file immediately
      await tauriInvoke('adb_shell', { deviceId, command: `rm ${tmpFile}` });

      if (b64 && b64.length > 500) {
        const cleaned = b64.replace(/\s+/g, '');
        return `data:image/png;base64,${cleaned}`;
      }
      
      // Fallback: exec-out (works on newer devices)
      const b64fb = await tauriInvoke('adb_shell_screenshot', { deviceId, command: 'screencap -p' });
      if (b64fb) return `data:image/png;base64,${b64fb}`;
      
      return null;
    } catch (e) {
      console.error('Screenshot error:', e);
      return null;
    }
  }
  const r = await fetch(`${API_BASE}/screenshot/${deviceId}`);
  return r.blob();
}

// ===== Files =====
export async function getFiles(deviceId, path = '/sdcard/') {
  if (isTauri) {
    const raw = await tauriInvoke('adb_shell', { deviceId, command: `ls -l "${path}" 2>/dev/null || echo "EMPTY"` });
    if (raw.trim() === 'EMPTY') return [];
    const items = [];
    for (const line of raw.trim().split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const isDir = parts[0].startsWith('d');
        const name = parts[parts.length - 1];
        const size = parseInt(parts[4]) || 0;
        if (name && name !== '.' && name !== '..') {
          items.push({ name, isDir, size });
        }
      }
    }
    items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    return items;
  }
  return apiFetch(`/files/${deviceId}?path=${encodeURIComponent(path)}`);
}

// ===== File Operations =====

export async function deleteFile(deviceId, path) {
  if (isTauri) {
    const cmd = `rm -rf "${path}"`;
    await tauriInvoke('adb_shell', { deviceId, command: cmd });
    return { success: true };
  }
  return apiFetch('/file-delete', { method: 'POST', body: JSON.stringify({ deviceId, path }) });
}

export async function renameFile(deviceId, oldPath, newPath) {
  if (isTauri) {
    await tauriInvoke('adb_shell', { deviceId, command: `mv "${oldPath}" "${newPath}"` });
    return { success: true };
  }
  return apiFetch('/file-rename', { method: 'POST', body: JSON.stringify({ deviceId, oldPath, newPath }) });
}

export async function copyFile(deviceId, srcPath, destPath) {
  if (isTauri) {
    await tauriInvoke('adb_shell', { deviceId, command: `cp -r "${srcPath}" "${destPath}"` });
    return { success: true };
  }
  return apiFetch('/file-copy', { method: 'POST', body: JSON.stringify({ deviceId, srcPath, destPath }) });
}

export async function makeDir(deviceId, path) {
  if (isTauri) {
    await tauriInvoke('adb_shell', { deviceId, command: `mkdir -p "${path}"` });
    return { success: true };
  }
  return apiFetch('/file-mkdir', { method: 'POST', body: JSON.stringify({ deviceId, path }) });
}

export async function pullFile(deviceId, remotePath, localPath) {
  if (isTauri) {
    await tauriInvoke('adb_pull', { deviceId, remote: remotePath, local: localPath });
    return { success: true };
  }
  return apiFetch('/file-pull', { method: 'POST', body: JSON.stringify({ deviceId, remotePath, localPath }) });
}

export async function pushFile(deviceId, localPath, remotePath) {
  if (isTauri) {
    await tauriInvoke('adb_push', { deviceId, local: localPath, remote: remotePath });
    return { success: true };
  }
  return apiFetch('/file-push', { method: 'POST', body: JSON.stringify({ deviceId, localPath, remotePath }) });
}

export async function getFileSize(deviceId, path) {
  if (isTauri) {
    const raw = await tauriInvoke('adb_shell', { deviceId, command: `du -sh "${path}" 2>/dev/null` }).catch(() => '');
    const m = raw.match(/^([\d.,]+\s*[KMGTP]?)/i);
    return m ? m[1].trim() : '--';
  }
  return '--';
}

// ===== ADB Shell =====
export async function sendCommand(deviceId, command) {
  if (isTauri) {
    const output = await tauriInvoke('adb_shell', { deviceId, command });
    return { output };
  }
  return apiFetch('/command', { method: 'POST', body: JSON.stringify({ deviceId, command }) });
}

// ===== Install Time =====
export async function getAppInstallTime(deviceId, pkg) {
  if (isTauri) {
    const raw = await tauriInvoke('adb_shell', { deviceId, command: `dumpsys package ${pkg} | grep -E "firstInstallTime|lastUpdateTime"` });
    const first = raw.match(/firstInstallTime:\s*(.+)/);
    const last = raw.match(/lastUpdateTime:\s*(.+)/);
    return { firstInstall: first?.[1]?.trim() || null, lastUpdate: last?.[1]?.trim() || null };
  }
  return apiFetch(`/app-install-time/${deviceId}/${encodeURIComponent(pkg)}`);
}

// ===== Disable Auto-Start (multiple methods) =====
export async function disableBootReceiver(deviceId, pkg) {
  if (!isTauri) return apiFetch('/disable-boot-receiver', { method: 'POST', body: JSON.stringify({ deviceId, pkg }) });
  try {
    // Method 1: appops (Android 9+) - prevent background execution (best approach)
    const r1 = await safeShell(deviceId, `cmd appops set ${pkg} RUN_ANY_IN_BACKGROUND deny 2>&1`);
    const appopsOk = r1 && !r1.includes('Error') && !r1.includes('not found') && !r1.includes('Unknown');
    if (appopsOk) return { success: true, method: 'appops' };

    // Method 2: Find BOOT_COMPLETED receivers via dumpsys and disable them individually
    const ds = await safeShell(deviceId, `dumpsys package ${pkg} | grep -c "BOOT_COMPLETED"`);
    if (ds && ds.trim() !== '0') {
      const receiverRaw = await safeShell(deviceId, `dumpsys package ${pkg} | grep -E "BOOT_COMPLETED|Receiver\\{" | head -20`);
      if (receiverRaw && receiverRaw.trim()) {
        const lines = receiverRaw.trim().split('\n');
        let disabled = 0;
        for (const line of lines) {
          const m = line.match(/([a-zA-Z][a-zA-Z0-9._]*\/\.[a-zA-Z][a-zA-Z0-9._]*)/);
          if (m) {
            const r = await safeShell(deviceId, `pm disable --user 0 "${m[1]}" 2>&1`);
            if (r && !r.includes('Error') && !r.includes('not exist') && !r.includes('not found')) disabled++;
          }
        }
        if (disabled > 0) return { success: true, method: 'component', disabledCount: disabled };
      }
    }

    // Method 3: pm disable-user (disable app for current user, prevents auto-start)
    const r3 = await safeShell(deviceId, `pm disable-user --user 0 ${pkg} 2>&1`);
    if (r3 && !r3.includes('Error') && !r3.includes('not exist')) {
      return { success: true, method: 'disable-user', note: '可在桌面重新打开应用' };
    }

    return { success: false, error: '无法关闭自启，请手动在手机设置中关闭' };
  } catch (e) { return { success: false, error: String(e) }; }
}

// ===== Behavior Scan (ported from server) =====
const DANGEROUS_PERMISSIONS = [
  'android.permission.READ_SMS', 'android.permission.RECEIVE_SMS', 'android.permission.SEND_SMS',
  'android.permission.READ_CONTACTS', 'android.permission.WRITE_CONTACTS',
  'android.permission.READ_CALL_LOG', 'android.permission.WRITE_CALL_LOG',
  'android.permission.CAMERA', 'android.permission.RECORD_AUDIO',
  'android.permission.READ_PHONE_STATE', 'android.permission.CALL_PHONE',
  'android.permission.ANSWER_PHONE_CALLS',
  'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.PROCESS_OUTGOING_CALLS', 'android.permission.BODY_SENSORS',
  'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.WRITE_SETTINGS',
  'android.permission.BIND_ACCESSIBILITY_SERVICE', 'android.permission.BIND_DEVICE_ADMIN',
  'android.permission.REQUEST_INSTALL_PACKAGES', 'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.READ_CALENDAR', 'android.permission.WRITE_CALENDAR',
];

const EXTREME_PERMS = ['android.permission.BIND_ACCESSIBILITY_SERVICE','android.permission.BIND_DEVICE_ADMIN','android.permission.REQUEST_INSTALL_PACKAGES','android.permission.MANAGE_EXTERNAL_STORAGE'];
const HIGH_RISK_PERMS = [...EXTREME_PERMS,'android.permission.SYSTEM_ALERT_WINDOW','android.permission.WRITE_SETTINGS','android.permission.PROCESS_OUTGOING_CALLS'];

async function safeShell(deviceId, cmd, timeoutMs = 10000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const result = await Promise.race([
      tauriInvoke('adb_shell', { deviceId, command: cmd }),
      new Promise((_, rej) => controller.signal.addEventListener('abort', () => rej(new Error('timeout'))))
    ]);
    clearTimeout(timer);
    return result || '';
  } catch { return ''; }
}

const isReal = (s) => s && s.includes('.') && /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i.test(s);

async function batchPermissions(deviceId, pkgs) {
  if (pkgs.length === 0) return new Map();
  const pkgList = pkgs.join(' ');
  const cmd = `for p in ${pkgList}; do echo "PKG:\$p"; dumpsys package \$p 2>/dev/null | grep -E "android\\.permission\\." | sort -u; echo "ENDPKG"; done`;
  const raw = await safeShell(deviceId, cmd, 60000);
  const result = new Map();
  let currentPkg = null;
  let currentPerms = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('PKG:')) {
      currentPkg = line.slice(4).trim();
      currentPerms = [];
    } else if (line === 'ENDPKG') {
      if (currentPkg && isReal(currentPkg)) result.set(currentPkg, currentPerms);
      currentPkg = null;
    } else if (currentPkg) {
      const pm = line.match(/(android\.permission\.\S+)/);
      if (pm) currentPerms.push(pm[1]);
    }
  }
  return result;
}

export async function behaviorScan(deviceId) {
  if (!isTauri) return apiFetch('/behavior-scan', { method: 'POST', body: JSON.stringify({ deviceId }) });

  const now = Date.now();

  // Combine multiple dumpsys window queries into one execution to reduce CPU overhead on the device
  const windowStateRaw = await safeShell(deviceId, 'dumpsys window | grep -E "mCurrentFocus|mFocusedApp|mTopFullscreenOpaqueWindow|Window #|SYSTEM_ALERT|APPLICATION_OVERLAY"');
  const activityRaw = windowStateRaw;
  const windowRaw = windowStateRaw;

  const [psRaw, tcpRaw] = await Promise.all([
    safeShell(deviceId, 'ps -A'),
    safeShell(deviceId, 'cat /proc/net/tcp 2>/dev/null'),
  ]);

  // Caching mechanism for heavy/slow shell commands

  // 1. pm list packages -3 (Cache for 20 seconds)
  if (now - lastThirdPartyFetch > 20000 || cachedThirdParty.size === 0) {
    const pkgsOutput = await safeShell(deviceId, 'pm list packages -3');
    const newPkgs = new Set();
    if (pkgsOutput) {
      for (const line of pkgsOutput.trim().split('\n')) {
        const m = line.replace('package:', '').trim();
        if (m && m.includes('.') && m.length > 3) newPkgs.add(m);
      }
    }
    if (newPkgs.size > 0) {
      cachedThirdParty = newPkgs;
      lastThirdPartyFetch = now;
    }
  }
  const allThirdParty = cachedThirdParty;

  // 2. dumpsys cpuinfo (Cache for 10 seconds)
  if (now - lastCpuFetch > 10000) {
    const cpuRaw = await safeShell(deviceId, 'dumpsys cpuinfo | head -n 20');
    const newCpuUsage = new Map();
    if (cpuRaw) {
      for (const line of cpuRaw.split('\n')) {
        const m = line.match(/([\d.]+)%\s+\d+\/(\S+?):/);
        if (m) {
          const cpu = parseFloat(m[1]) || 0;
          const pkg = m[2].replace(/:.*/, '').trim();
          if (isReal(pkg) && cpu > 0.1) newCpuUsage.set(pkg, (newCpuUsage.get(pkg) || 0) + cpu);
        }
      }
    }
    cachedCpuUsage = newCpuUsage;
    lastCpuFetch = now;
  }
  const cpuUsage = cachedCpuUsage;

  // 3. dumpsys notification (Cache for 8 seconds)
  if (now - lastNotifFetch > 8000) {
    const notifRaw = await safeShell(deviceId, 'dumpsys notification --noredact | grep -E "NotificationRecord|pkg="');
    const newNotifications = new Set();
    const newNotifByPkg = new Map();
    if (notifRaw) {
      let currentPkg = null;
      const notifKeywords = ['恭喜', '中奖', '免费领', '系统清理', '手机加速', '病毒检测', '立即更新', '安全警告', '存储已满', '内存不足', '红包', '优惠券', '免费', '立即领取', '系统升级', '安全补丁'];
      for (const line of notifRaw.split('\n')) {
        if (line.includes('NotificationRecord')) {
          const m = line.match(/pkg=(\S+)/);
          if (m && isReal(m[1])) newNotifications.add(m[1]);
        }
        const pkgMatch = line.match(/pkg=(\S+)/);
        if (pkgMatch) { currentPkg = pkgMatch[1]; continue; }
        if (currentPkg && isReal(currentPkg)) {
          for (const kw of notifKeywords) {
            if (line.includes(kw)) {
              if (!newNotifByPkg.has(currentPkg)) newNotifByPkg.set(currentPkg, []);
              newNotifByPkg.get(currentPkg).push({ keyword: kw });
            }
          }
        }
      }
    }
    cachedNotifications = newNotifications;
    cachedNotifByPkg = newNotifByPkg;
    lastNotifFetch = now;
  }
  const notifications = cachedNotifications;
  const notifByPkg = cachedNotifByPkg;

  // 4. dumpsys battery (Cache for 15 seconds)
  if (now - lastBatteryFetch > 15000) {
    const batteryRaw = await safeShell(deviceId, 'dumpsys battery');
    let batteryStatus = 'unknown';
    if (batteryRaw) {
      const sm = batteryRaw.match(/status:\s*(\d+)/);
      if (sm) batteryStatus = { '1': 'unknown', '2': 'charging', '3': 'discharging', '4': 'not_charging', '5': 'full' }[sm[1]] || 'unknown';
    }
    cachedBatteryStatus = batteryStatus;
    lastBatteryFetch = now;
  }
  const batteryStatus = cachedBatteryStatus;

  // 5. logcat (Cache for 6 seconds)
  if (now - lastLogcatFetch > 6000) {
    const logcatRaw = await safeShell(deviceId, 'logcat -d -t 50 -s AdView AdLoader WebView ActivityManager PackageInstaller 2>/dev/null');
    const newLogcatAdEvents = new Map();
    const logcatKeywords = ['AdView', 'AdLoader', 'loadAd', 'showInterstitial', 'showRewarded', 'GAD', 'AdMob', 'BannerAd', 'InterstitialAd', 'AccessibilityService', 'findAccessibilityNodeInfos'];
    if (logcatRaw) {
      for (const line of logcatRaw.split('\n')) {
        for (const kw of logcatKeywords) {
          if (line.includes(kw)) {
            const pkgMatch = line.match(/\d+\s+\d+\s+\w\s+(\S+?):/);
            if (pkgMatch && isReal(pkgMatch[1])) newLogcatAdEvents.set(pkgMatch[1], (newLogcatAdEvents.get(pkgMatch[1]) || 0) + 1);
          }
        }
      }
    }
    cachedLogcatAdEvents = newLogcatAdEvents;
    lastLogcatFetch = now;
  }
  const logcatAdEvents = cachedLogcatAdEvents;

  // 6. boot receivers (Cache for 30 seconds)
  if (now - lastBootReceiversFetch > 30000 || cachedBootReceivers.size === 0) {
    const bootReceiverRaw = await safeShell(deviceId, 'dumpsys package query-receivers --components android.intent.action.BOOT_COMPLETED 2>/dev/null | grep -E "name=|packageName="');
    const newBootReceivers = new Set();
    if (bootReceiverRaw) {
      for (const line of bootReceiverRaw.split('\n')) {
        const m = line.match(/([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+)/i);
        if (m && isReal(m[1])) newBootReceivers.add(m[1]);
      }
    }
    cachedBootReceivers = newBootReceivers;
    lastBootReceiversFetch = now;
  }
  const bootReceivers = cachedBootReceivers;

  // 7. overlay permissions (Cache for 30 seconds)
  if (now - lastOverlayPermsFetch > 30000 || cachedOverlayPerms.size === 0) {
    const overlayPermsRaw = await safeShell(deviceId, 'dumpsys appops get 2>/dev/null | grep -B1 "SYSTEM_ALERT_WINDOW" | grep "Uid"');
    const newOverlayPerms = new Set();
    if (overlayPermsRaw) {
      for (const line of overlayPermsRaw.split('\n')) {
        const m = line.match(/Uid\s+\d+:\s+(\S+)/);
        if (m && isReal(m[1])) newOverlayPerms.add(m[1]);
      }
    }
    cachedOverlayPerms = newOverlayPerms;
    lastOverlayPermsFetch = now;
  }
  const overlayPermittedPkgs = cachedOverlayPerms;

  let currentFg = null;
  if (activityRaw) {
    const m = activityRaw.match(/(?:mCurrentFocus|mFocusedApp)=.*?\s(\S+?)\//);
    if (m && isReal(m[1])) { currentFg = m[1]; }
  }

  const overlays = new Set();
  if (windowRaw) {
    const lines = windowRaw.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('SYSTEM_ALERT') || lines[i].includes('APPLICATION_OVERLAY')) {
        for (let j = i; j >= Math.max(0, i - 5); j--) {
          const m = lines[j].match(/Window\s+#\d+\s+Window\{[^}]*\s+u0\s+(\S+?)\//);
          if (m && isReal(m[1])) { overlays.add(m[1]); break; }
        }
      }
    }
  }

  const processCount = new Map();
  if (psRaw) {
    for (const line of psRaw.split('\n')) {
      if (line.includes('PID') || line.trim() === '') continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 8) {
        const name = parts[parts.length - 1];
        if (isReal(name)) processCount.set(name, (processCount.get(name) || 0) + 1);
      }
    }
  }

  const pkgPermData = new Map();
  if (allThirdParty.size > 0) {
    const pkgArray = Array.from(allThirdParty);
    const pkgsToScan = pkgArray.filter(p => !permissionCache.has(p));
    const batchSize = 10;
    
    if (pkgsToScan.length > 0) {
      for (let i = 0; i < pkgsToScan.length; i += batchSize) {
        const batch = pkgsToScan.slice(i, i + batchSize);
        const batchResult = await batchPermissions(deviceId, batch);
        for (const [pkg, perms] of batchResult) permissionCache.set(pkg, perms);
      }
    }

    for (const pkg of allThirdParty) {
      const perms = permissionCache.get(pkg) || [];
      const uniquePerms = [...new Set(perms)];
      const dangerousCount = uniquePerms.filter(p => DANGEROUS_PERMISSIONS.includes(p)).length;
      const extremeCount = uniquePerms.filter(p => EXTREME_PERMS.includes(p)).length;
      const highRiskCount = uniquePerms.filter(p => HIGH_RISK_PERMS.includes(p)).length;
      const excessDangerous = Math.max(0, dangerousCount - 4);
      const staticScore = Math.min(10, extremeCount * 3 + highRiskCount * 1 + excessDangerous * 0.5);
      pkgPermData.set(pkg, { dangerousCount, extremeCount, highRiskCount, totalPerms: uniquePerms.length, staticScore: Math.round(staticScore * 10) / 10 });
    }
  }

  const appResults = [];

  for (const pkg of allThirdParty) {
    const signals = [];
    let score = 0;

    const cpu = cpuUsage.get(pkg) || 0;
    if (cpu > 15) { signals.push({ type: '极高CPU', detail: `${cpu.toFixed(1)}%`, category: 'system', severity: 3 }); score += 8; }
    else if (cpu > 8) { signals.push({ type: '高CPU', detail: `${cpu.toFixed(1)}%`, category: 'system', severity: 2 }); score += 5; }
    else if (cpu > 3) { signals.push({ type: 'CPU偏高', detail: `${cpu.toFixed(1)}%`, category: 'system', severity: 1 }); score += 2; }

    if (overlays.has(pkg)) { signals.push({ type: '叠加层弹窗', detail: '正在弹出悬浮窗/广告', category: 'ads', severity: 3 }); score += 25; }
    else if (overlayPermittedPkgs.has(pkg)) { signals.push({ type: '有悬浮窗权限', detail: '可以随时弹广告', category: 'ads', severity: 1 }); score += 2; }

    const procs = processCount.get(pkg) || 0;
    if (procs >= 4) { signals.push({ type: `${procs}个进程`, detail: '后台常驻多进程', category: 'system', severity: 2 }); score += 5; }
    else if (procs >= 2) { signals.push({ type: `${procs}个进程`, detail: '', category: 'system', severity: 1 }); score += 1; }

    if (bootReceivers.has(pkg)) { signals.push({ type: '开机自启', detail: '重启后自动运行', category: 'ads', severity: 1 }); score += 2; }

    const adEvents = logcatAdEvents.get(pkg) || 0;
    if (adEvents > 5) { signals.push({ type: '广告加载中', detail: `Logcat抓到${adEvents}次广告`, category: 'ads', severity: 3 }); score += 12; }

    const notifKws = notifByPkg.get(pkg);
    if (notifKws && notifKws.length > 0) {
      const uniqueKws = [...new Set(notifKws.map(n => n.keyword))];
      signals.push({ type: '假通知', detail: `含: ${uniqueKws.slice(0, 3).join(', ')}`, category: 'ads', severity: 3 }); score += 10;
    }

    if (pkg === currentFg) signals.push({ type: '前台', detail: '当前活跃', category: 'system', severity: 0 });

    const normalizedScore = Math.min(100, score);
    const risk = normalizedScore >= 15 ? 'high' : normalizedScore >= 5 ? 'medium' : 'low';
    appResults.push({ pkg, signals, score: normalizedScore, risk, cpu, processes: procs, networkHits: 0 });
  }

  appResults.sort((a, b) => {
    const aHasOverlay = a.signals.some(s => s.type === '叠加层弹窗');
    const bHasOverlay = b.signals.some(s => s.type === '叠加层弹窗');
    if (aHasOverlay && !bHasOverlay) return -1;
    if (!aHasOverlay && bHasOverlay) return 1;
    return b.score - a.score;
  });

  return {
    foreground: currentFg,
    overlays: Array.from(overlays),
    newOverlays: [],
    batteryStatus,
    results: appResults,
    summary: {
      totalApps: appResults.length,
      overlayCount: overlays.size,
      notificationCount: notifications.size,
      batteryStatus,
      suspiciousCount: appResults.filter(r => r.risk === 'high' || r.risk === 'medium').length,
    }
  };
}

// ===== Lightweight behavior scan for capture mode (skips heavy permission analysis) =====
export async function behaviorScanLight(deviceId) {
  if (!isTauri) return apiFetch('/behavior-scan', { method: 'POST', body: JSON.stringify({ deviceId }) });

  const [activityRaw, windowRaw, psRaw, cpuRaw, notifRaw, batteryRaw, logcatRaw, bootReceiverRaw] = await Promise.all([
    safeShell(deviceId, 'dumpsys activity activities'),
    safeShell(deviceId, 'dumpsys window windows'),
    safeShell(deviceId, 'ps -A', 5000),
    safeShell(deviceId, 'dumpsys cpuinfo'),
    safeShell(deviceId, 'dumpsys notification'),
    safeShell(deviceId, 'dumpsys battery'),
    safeShell(deviceId, 'logcat -d -t 50 -s AdView AdLoader WebView ActivityManager 2>/dev/null'),
    safeShell(deviceId, 'dumpsys package query-receivers --components android.intent.action.BOOT_COMPLETED 2>/dev/null'),
  ]);

  let currentFg = null;
  if (activityRaw) {
    for (const line of activityRaw.split('\n')) {
      if (line.includes('ResumedActivity') || line.includes('topResumedActivity')) {
        const m = line.match(/\s(\S+?)\//);
        if (m && isReal(m[1])) { currentFg = m[1]; break; }
      }
    }
  }

  const overlays = new Set();
  if (windowRaw) {
    const lines = windowRaw.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('SYSTEM_ALERT') || lines[i].includes('APPLICATION_OVERLAY')) {
        for (let j = i; j >= Math.max(0, i - 5); j--) {
          const m = lines[j].match(/Window\s+#\d+\s+Window\{[^}]*\s+u0\s+(\S+?)\//);
          if (m && isReal(m[1])) { overlays.add(m[1]); break; }
        }
      }
    }
  }

  const cpuUsage = new Map();
  if (cpuRaw) {
    for (const line of cpuRaw.split('\n')) {
      const m = line.match(/([\d.]+)%\s+\d+\/(\S+?):/);
      if (m) {
        const cpu = parseFloat(m[1]) || 0;
        const pkg = m[2].replace(/:.*/, '').trim();
        if (isReal(pkg) && cpu > 0.5) cpuUsage.set(pkg, (cpuUsage.get(pkg) || 0) + cpu);
      }
    }
  }

  const notifications = new Set();
  if (notifRaw) {
    for (const line of notifRaw.split('\n')) {
      if (line.includes('NotificationRecord')) {
        const m = line.match(/pkg=(\S+)/);
        if (m && isReal(m[1])) notifications.add(m[1]);
      }
    }
  }

  let batteryStatus = 'unknown';
  if (batteryRaw) {
    const sm = batteryRaw.match(/status:\s*(\d+)/);
    if (sm) batteryStatus = { '1': 'unknown', '2': 'charging', '3': 'discharging', '4': 'not_charging', '5': 'full' }[sm[1]] || 'unknown';
  }

  const bootReceivers = new Set();
  if (bootReceiverRaw) {
    for (const line of bootReceiverRaw.split('\n')) {
      const m = line.match(/([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+)/i);
      if (m && isReal(m[1])) bootReceivers.add(m[1]);
    }
  }

  const pkgsOutput = await safeShell(deviceId, 'pm list packages -3');
  const allThirdParty = new Set();
  for (const line of pkgsOutput.trim().split('\n')) {
    const m = line.replace('package:', '').trim();
    if (m && m.includes('.') && m.length > 3) allThirdParty.add(m);
  }

  const appResults = [];
  for (const pkg of allThirdParty) {
    const signals = [];
    let score = 0;

    const cpu = cpuUsage.get(pkg) || 0;
    if (cpu > 15) { signals.push({ type: '极高CPU', detail: `${cpu.toFixed(1)}%`, category: 'system', severity: 3 }); score += 8; }
    else if (cpu > 8) { signals.push({ type: '高CPU', detail: `${cpu.toFixed(1)}%`, category: 'system', severity: 2 }); score += 5; }
    else if (cpu > 3) { signals.push({ type: 'CPU偏高', detail: `${cpu.toFixed(1)}%`, category: 'system', severity: 1 }); score += 2; }

    if (overlays.has(pkg)) { signals.push({ type: '叠加层弹窗', detail: '正在弹出悬浮窗/广告', category: 'ads', severity: 3 }); score += 25; }

    if (bootReceivers.has(pkg)) { signals.push({ type: '开机自启', detail: '重启后自动运行', category: 'ads', severity: 1 }); score += 2; }

    if (pkg === currentFg) signals.push({ type: '前台', detail: '当前活跃', category: 'system', severity: 0 });

    const normalizedScore = Math.min(100, score);
    const risk = normalizedScore >= 15 ? 'high' : normalizedScore >= 5 ? 'medium' : 'low';
    appResults.push({ pkg, signals, score: normalizedScore, risk, cpu, processes: 0, networkHits: 0 });
  }

  appResults.sort((a, b) => {
    const aHasOverlay = a.signals.some(s => s.type === '叠加层弹窗');
    const bHasOverlay = b.signals.some(s => s.type === '叠加层弹窗');
    if (aHasOverlay && !bHasOverlay) return -1;
    if (!aHasOverlay && bHasOverlay) return 1;
    return b.score - a.score;
  });

  return {
    foreground: currentFg,
    overlays: Array.from(overlays),
    newOverlays: [],
    batteryStatus,
    results: appResults,
    summary: {
      totalApps: appResults.length,
      overlayCount: overlays.size,
      notificationCount: notifications.size,
      batteryStatus,
      suspiciousCount: appResults.filter(r => r.risk === 'high' || r.risk === 'medium').length,
    }
  };
}

// ===== Driver =====
export async function installDriver() {
  if (isTauri) {
    await tauriInvoke('install_driver');
    return true;
  }
  const res = await fetch(`${API_BASE}/install-driver`, { method: 'POST' });
  return (await res.json()).success;
}

export async function getDriverStatus() {
  if (isTauri) return { driverExists: true, adbWorks: true };
  try {
    const res = await fetch(`${API_BASE}/driver-status`);
    return await res.json();
  } catch { return { driverExists: false, adbWorks: false }; }
}

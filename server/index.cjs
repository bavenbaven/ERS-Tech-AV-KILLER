const express = require('express');
const adb = require('adbkit');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { exec, execFile } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const upload = multer({ dest: require('os').tmpdir() });
const app = express();
const adbPath = path.join(__dirname, 'platform-tools', 'adb.exe');
const port = 3001;

// Prevent unhandled errors from crashing the server (MUST be before adbkit init)
process.on('uncaughtException', (err) => {
  console.error('Non-fatal error:', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err?.message || err);
});

// Create adbkit client but suppress internal socket errors
let client;
try {
  client = adb.createClient({ bin: adbPath });
} catch (e) {
  console.error('Failed to create ADB client:', e.message);
}

const iconCacheDir = path.join(__dirname, 'icon-cache');
if (!fs.existsSync(iconCacheDir)) fs.mkdirSync(iconCacheDir, { recursive: true });

// Security: sanitize package names
const SAFE_PKG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const sanitize = (s) => { if (!s || !SAFE_PKG_RE.test(s)) throw new Error('invalid package name'); return s; };

app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve frontend static files
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// ===== ADB Auto-Start =====
const driverDir = path.join(__dirname, 'driver');

// Try to install ADB driver silently (requires admin, may fail - that's ok)
async function tryInstallDriver() {
  const infPath = path.join(driverDir, 'android_winusb.inf');
  if (!fs.existsSync(infPath)) return false;
  try {
    await execAsync(`pnputil /add-driver "${infPath}" /install`, { timeout: 15000 });
    return true;
  } catch (e) { return false; }
}

async function ensureAdbServer() {
  try {
    await execAsync(`"${adbPath}" start-server`, { timeout: 8000 });
  } catch (e) { /* already running is fine */ }
}

function recreateClient() {
  try {
    client = adb.createClient({ bin: adbPath });
    console.log('ADB client recreated');
  } catch (e) {
    console.error('Failed to recreate ADB client:', e.message);
  }
}

// Try driver install on startup (may need admin, silently fail if not)
tryInstallDriver();

// ===== ADB Heartbeat & Auto-reconnect =====
let adbConnected = false;
let lastHeartbeat = 0;
let heartbeatFailCount = 0;
let waitingAuthorization = false;
let allDevices = [];

async function adbHeartbeat() {
  try {
    const { stdout } = await execAsync(`"${adbPath}" devices`, { timeout: 5000 });
    const lines = stdout.trim().split('\n').slice(1).filter(l => l.trim());
    const devices = lines.map(l => {
      const parts = l.trim().split(/\s+/);
      return { id: parts[0], type: parts[1] || 'unknown' };
    });
    allDevices = devices;
    const online = devices.find(d => d.type === 'device');
    const unauthorized = devices.find(d => d.type === 'unauthorized');

    if (online) {
      adbConnected = true;
      waitingAuthorization = false;
      lastHeartbeat = Date.now();
      heartbeatFailCount = 0;
    } else if (unauthorized) {
      adbConnected = false;
      waitingAuthorization = true;
      lastHeartbeat = Date.now();
      heartbeatFailCount = 0;
    } else {
      adbConnected = false;
      waitingAuthorization = false;
      heartbeatFailCount++;
      if (heartbeatFailCount >= 4) {
        try { await execAsync(`"${adbPath}" kill-server`, { timeout: 5000 }); } catch (e) {}
        await new Promise(r => setTimeout(r, 800));
        try { await execAsync(`"${adbPath}" start-server`, { timeout: 8000 }); } catch (e) {}
        recreateClient();
        heartbeatFailCount = 0;
      }
    }
  } catch (err) {
    adbConnected = false;
    waitingAuthorization = false;
    heartbeatFailCount++;
  }
}

// Run heartbeat every 2 seconds for faster detection
setInterval(adbHeartbeat, 2000);
// Auto-start ADB server on boot, then first heartbeat immediately
ensureAdbServer().then(() => setTimeout(adbHeartbeat, 500));

app.get('/api/adb-status', (req, res) => {
  res.json({ connected: adbConnected, lastHeartbeat, failCount: heartbeatFailCount, waitingAuthorization });
});

// ===== Driver Installation =====
app.post('/api/install-driver', async (req, res) => {
  const infPath = path.join(driverDir, 'android_winusb.inf');
  const exists = fs.existsSync(infPath);
  if (!exists) return res.json({ success: false, error: 'driver file not found' });
  try {
    await execAsync(`pnputil /add-driver "${infPath}" /install`, { timeout: 30000 });
    res.json({ success: true });
  } catch (err) {
    // If pnputil fails, try running elevate.exe
    try {
      const elevatePath = path.join(__dirname, '..', '..', 'elevate.exe');
      if (fs.existsSync(elevatePath)) {
        await execAsync(`"${elevatePath}" cmd /c pnputil /add-driver "${infPath}" /install`, { timeout: 60000 });
        return res.json({ success: true });
      }
    } catch (e) {}
    res.json({ success: false, error: '需要管理员权限，请右键点击程序选择"以管理员身份运行"' });
  }
});

app.get('/api/driver-status', (req, res) => {
  const infPath = path.join(driverDir, 'android_winusb.inf');
  res.json({ driverExists: fs.existsSync(infPath), adbWorks: adbConnected });
});

app.get('/api/test', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ===== Devices =====
app.get('/api/devices', async (req, res) => {
  try {
    const { stdout } = await execAsync(`"${adbPath}" devices`, { timeout: 5000 });
    const lines = stdout.trim().split('\n').slice(1).filter(l => l.trim());
    const devices = lines.map(l => {
      const parts = l.trim().split(/\s+/);
      return { id: parts[0], type: parts[1] || 'unknown' };
    });
    res.json(devices);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/reset-adb', async (req, res) => {
  try {
    try { await execAsync(`"${adbPath}" kill-server`, { timeout: 5000 }); } catch (e) {}
    await new Promise(r => setTimeout(r, 800));
    try { await execAsync(`"${adbPath}" start-server`, { timeout: 8000 }); } catch (e) {}
    recreateClient();
    await new Promise(r => setTimeout(r, 1000));
    heartbeatFailCount = 0;
    adbConnected = false;
    // Trigger immediate heartbeat
    setTimeout(adbHeartbeat, 300);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ===== Device Info =====
app.get('/api/device-info/:id', async (req, res) => {
  const deviceId = req.params.id;
  try {
    const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
    const safeShell = async (cmd) => {
      try {
        const stream = await Promise.race([client.shell(deviceId, cmd), timeout(3000)]);
        return (await adb.util.readAll(stream)).toString().trim();
      } catch (e) { return ''; }
    };

    const [props, batteryRaw, storageRaw, memRaw, displayRaw, networkRaw, buildRaw] = await Promise.all([
      Promise.race([
        client.shell(deviceId, 'getprop ro.product.model; getprop ro.build.version.release; getprop ro.build.version.sdk; getprop ro.product.cpu.abi; getprop ro.product.brand; getprop ro.product.manufacturer; getprop ro.product.name; getprop ro.product.device; getprop ro.build.version.security_patch; getprop ro.build.version.incremental; getprop ro.hardware; getprop ro.board.platform; getprop ro.product.first_api_level; getprop ro.build.type; getprop ro.build.characteristics; getprop persist.sys.locale; getprop gsm.version.baseband')
          .then(s => adb.util.readAll(s)).then(b => b.toString().trim().split('\n')),
        timeout(4000)
      ]),
      Promise.race([client.shell(deviceId, 'dumpsys battery').then(s => adb.util.readAll(s)).then(b => b.toString()), timeout(3000)]),
      Promise.race([client.shell(deviceId, 'df /data | tail -1').then(s => adb.util.readAll(s)).then(b => b.toString().trim()), timeout(3000)]),
      Promise.race([client.shell(deviceId, 'cat /proc/meminfo | head -3').then(s => adb.util.readAll(s)).then(b => b.toString()), timeout(3000)]),
      safeShell('wm size; wm density'),
      safeShell('ip route show default; cat /sys/class/net/wlan0/address 2>/dev/null'),
      safeShell('getprop ro.build.fingerprint; getprop ro.build.description; getprop ro.build.tags')
    ]);

    const [model, version, sdk, cpu, brand, manufacturer, productName, deviceName, securityPatch, incremental, hardware, board, firstApi, buildType, characteristics, locale, baseband] = props;

    let battery = { level: '--', temp: '--', voltage: '--', health: '--', technology: '--', status: '--' };
    const lm = batteryRaw.match(/level:\s*(\d+)/); if (lm) battery.level = lm[1];
    const tm = batteryRaw.match(/temperature:\s*(\d+)/); if (tm) battery.temp = (parseInt(tm[1]) / 10).toFixed(1) + '\u00B0C';
    const vm = batteryRaw.match(/voltage:\s*(\d+)/); if (vm) battery.voltage = (parseInt(vm[1]) / 1000).toFixed(2) + 'V';
    const hm = batteryRaw.match(/health:\s*(\w+)/); if (hm) battery.health = hm[1];
    const stm = batteryRaw.match(/status:\s*(\d+)/);
    if (stm) { const s = { '1': 'Unknown', '2': 'Charging', '3': 'Discharging', '4': 'Not charging', '5': 'Full' }; battery.status = s[stm[1]] || stm[1]; }

    let storage = { total: '--', used: '--', percent: '--' };
    const parts = storageRaw.split(/\s+/).filter(Boolean);
    if (parts.length >= 5) {
      const totalKB = parseInt(parts[1]) || 0, usedKB = parseInt(parts[2]) || 0;
      storage = { total: String(Math.round(totalKB / 1024 / 1024) || '--'), used: String(Math.round(usedKB / 1024 / 1024) || '--'), percent: totalKB > 0 ? Math.round((usedKB / totalKB) * 100) + '%' : '--' };
    }

    let memory = { total: '--', used: '--', percent: '--' };
    const mt = memRaw.match(/MemTotal:\s+(\d+)/), ma = memRaw.match(/MemAvailable:\s+(\d+)/);
    if (mt && ma) {
      const t = Math.round(parseInt(mt[1]) / 1024), a = Math.round(parseInt(ma[1]) / 1024);
      memory = { total: (t / 1024).toFixed(1), used: ((t - a) / 1024).toFixed(1), percent: t > 0 ? Math.round(((t - a) / t) * 100) + '%' : '--' };
    }

    let display = { size: '--', density: '--' };
    const sm = displayRaw.match(/Physical size:\s*(\S+)/), dm = displayRaw.match(/Physical density:\s*(\S+)/);
    if (sm) display.size = sm[1]; if (dm) display.density = dm[1];

    let networkInfo = { ip: '--', mac: '--', wifi: '--' };
    const ipM = networkRaw.match(/via\s+(\S+)/), macM = networkRaw.match(/([0-9a-f]{2}:){5}[0-9a-f]{2}/i);
    if (ipM) networkInfo.ip = ipM[1]; if (macM) networkInfo.mac = macM[0];

    let buildInfo = { fingerprint: '--', description: '--', tags: '--' };
    const fp = buildRaw.match(/fingerprint:\s*(.+)/), desc = buildRaw.match(/description:\s*(.+)/), tags = buildRaw.match(/tags:\s*(.+)/);
    if (fp) buildInfo.fingerprint = fp[1].trim(); if (desc) buildInfo.description = desc[1].trim(); if (tags) buildInfo.tags = tags[1].trim();

    res.json({
      battery, storage, memory, display, network: networkInfo, build: buildInfo,
      model: model || '--', version: version || '--', sdk: sdk || '--', cpu: cpu || '--',
      brand: brand || '--', manufacturer: manufacturer || '--', productName: productName || '--',
      deviceName: deviceName || '--', securityPatch: securityPatch || '--', incremental: incremental || '--',
      hardware: hardware || '--', board: board || '--', firstApi: firstApi || '--',
      buildType: buildType || '--', characteristics: characteristics || '--', locale: locale || '--',
      baseband: baseband || '--'
    });
  } catch (err) {
    res.json({ battery: { level: '--' }, storage: { total: '--', used: '--', percent: '--' }, memory: { total: '--', used: '--', percent: '--' }, display: { size: '--', density: '--' }, network: {}, build: {}, model: 'read failed', version: '--', sdk: '--', cpu: '--' });
  }
});

// ===== App Icons (cache-first, on-demand extraction) =====
app.get('/api/app-icon/:deviceId/:pkg', async (req, res) => {
  const { deviceId, pkg } = req.params;
  const safe = sanitize(pkg);
  const safeName = safe.replace(/[^a-zA-Z0-9._-]/g, '_');
  const cacheFile = path.join(iconCacheDir, `${safeName}.png`);

  // Fast path: serve from cache
  if (fs.existsSync(cacheFile)) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(cacheFile);
  }

  // On-demand extraction: pull APK and extract icon
  try {
    const stream = await client.shell(deviceId, `pm path ${safe}`);
    const output = await adb.util.readAll(stream);
    const paths = output.toString().split('\n')
      .filter(l => l.includes('package:'))
      .map(l => l.trim().replace('package:', '').trim());

    if (paths.length === 0) return res.status(404).end();

    // Try each APK path, prefer smaller files
    for (const apkPath of paths) {
      try {
        const readStream = await client.pull(deviceId, apkPath);
        const chunks = [];
        await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), 8000);
          readStream.on('data', chunk => chunks.push(chunk));
          readStream.on('end', () => { clearTimeout(t); resolve(); });
          readStream.on('error', e => { clearTimeout(t); reject(e); });
        });
        const buf = Buffer.concat(chunks);

        // Extract icon from APK ZIP
        const unzipper = require('unzipper');
        const zipEntries = await unzipper.Open.buffer(buf);

        // Look for ic_launcher in mipmap
        let iconEntry = null;
        const patterns = [
          /res\/mipmap-xxxhdpi[^\/]*\/ic_launcher\.png$/i,
          /res\/mipmap-xxhdpi[^\/]*\/ic_launcher\.png$/i,
          /res\/mipmap-xhdpi[^\/]*\/ic_launcher\.png$/i,
          /res\/mipmap-hdpi[^\/]*\/ic_launcher\.png$/i,
          /res\/mipmap-mdpi[^\/]*\/ic_launcher\.png$/i,
          /ic_launcher\.png$/i,
        ];
        for (const pat of patterns) {
          iconEntry = zipEntries.files.find(e => pat.test(e.path));
          if (iconEntry) break;
        }

        // Fallback: largest PNG in res/
        if (!iconEntry) {
          const imgs = zipEntries.files.filter(e =>
            e.path.startsWith('res/') &&
            (e.path.endsWith('.png') || e.path.endsWith('.webp')) &&
            !e.path.includes('.9.') && !e.path.includes('color/') &&
            !e.path.includes('animator') && !e.path.includes('anim/')
          );
          imgs.sort((a, b) => b.uncompressedSize - a.uncompressedSize);
          if (imgs.length > 0 && imgs[0].uncompressedSize > 500) iconEntry = imgs[0];
        }

        if (iconEntry) {
          const iconBuf = await iconEntry.buffer();
          if (iconBuf && iconBuf.length > 50) {
            fs.writeFileSync(cacheFile, iconBuf);
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.send(iconBuf);
          }
        }
      } catch (e) { /* try next path */ }
    }
    res.status(404).end();
  } catch (err) {
    res.status(404).end();
  }
});

// ===== Packages =====
app.get('/api/apps/:id', async (req, res) => {
  const deviceId = req.params.id;
  try {
    const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
    // Use single command to avoid duplicates between -3 and -s
    const allPkgs = await Promise.race([
      client.shell(deviceId, 'pm list packages')
        .then(s => adb.util.readAll(s))
        .then(b => {
          const lines = b.toString().trim().split('\n')
            .map(l => l.replace('package:', '').trim())
            .filter(l => l.length > 0);
          return [...new Set(lines)]; // Ensure no duplicates
        }),
      timeout(15000)
    ]);
    res.json(allPkgs);
  } catch (err) { res.json([]); }
});

// ===== Uninstall =====
app.post('/api/uninstall', async (req, res) => {
  const { deviceId, pkg } = req.body;
  if (!deviceId || !pkg) return res.status(400).json({ error: 'missing params' });
  try {
    const safe = sanitize(pkg);
    const stream = await client.shell(deviceId, `pm uninstall ${safe}`);
    const result = (await adb.util.readAll(stream)).toString().trim();
    res.json({ success: result.includes('Success'), result });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ===== Install APK =====
app.post('/api/install-apk', upload.single('apk'), async (req, res) => {
  const { deviceId } = req.body;
  const file = req.file;
  if (!deviceId || !file) return res.status(400).json({ error: 'missing params' });
  try {
    const remotePath = '/data/local/tmp/aiva_upload.apk';
    const readStream = fs.createReadStream(file.path);
    const pushStream = await client.push(deviceId, readStream, remotePath);
    await adb.util.readAll(pushStream);
    const stream = await client.shell(deviceId, `pm install -r ${remotePath}`);
    const result = (await adb.util.readAll(stream)).toString().trim();
    try { await client.shell(deviceId, `rm ${remotePath}`); } catch (e) {}
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.json({ success: result.includes('Success'), result, error: result.includes('Success') ? null : result });
  } catch (err) {
    if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.json({ success: false, error: err.message });
  }
});

// ===== Current App =====
app.get('/api/current-app/:id', async (req, res) => {
  try {
    const stream = await client.shell(req.params.id, 'dumpsys activity activities');
    const text = (await adb.util.readAll(stream)).toString();
    for (const line of text.split('\n')) {
      if (line.includes('ResumedActivity') || line.includes('topResumedActivity')) {
        const m = line.match(/\s(\S+?)\//);
        if (m) return res.json(m[1]);
      }
    }
    res.json('Unknown');
  } catch (err) { res.json('Unknown'); }
});

// ===== Screenshot =====
app.get('/api/screenshot/:id', async (req, res) => {
  try {
    // Use exec-out for direct binary stream (faster, single command)
    const { stdout } = await execAsync(`"${adbPath}" -s ${req.params.id} exec-out screencap -p`, {
      timeout: 8000,
      encoding: 'buffer',
      maxBuffer: 1024 * 1024 * 10
    });
    if (stdout && stdout.length > 100) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      return res.send(stdout);
    }
    // Fallback: adbkit shell
    const stream = await client.shell(req.params.id, 'screencap -p');
    const data = await adb.util.readAll(stream);
    res.setHeader('Content-Type', 'image/png');
    res.send(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== Files (with sizes) =====
app.get('/api/files/:id', async (req, res) => {
  const deviceId = req.params.id;
  const filePath = (req.query.path || '/sdcard/').replace(/[^a-zA-Z0-9/_ .-]/g, '');
  try {
    // Use find + stat for reliable cross-device output
    const stream = await client.shell(deviceId, `cd "${filePath}" && for f in *; do if [ -d "$f" ]; then echo "DIR|$f|0"; elif [ -f "$f" ]; then sz=$(stat -c%s "$f" 2>/dev/null || echo 0); echo "FILE|$f|$sz"; fi; done 2>/dev/null`);
    const output = await adb.util.readAll(stream);
    const lines = output.toString().trim().split('\n').filter(Boolean);
    const items = [];
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 3) {
        const isDir = parts[0] === 'DIR';
        const name = parts[1].trim();
        const size = parseInt(parts[2]) || 0;
        if (name && name !== '.' && name !== '..') {
          items.push({ name, isDir, size });
        }
      }
    }
    // Sort: dirs first, then by name
    items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    res.json(items);
  } catch (err) {
    // Fallback
    try {
      const stream = await client.shell(deviceId, `ls -1 "${filePath}"`);
      const output = await adb.util.readAll(stream);
      res.json(output.toString().trim().split('\n').filter(Boolean).filter(n => n !== '.' && n !== '..').map(name => ({ name, isDir: false, size: 0 })));
    } catch (e) { res.json([]); }
  }
});

// ===== Dangerous Permissions List =====
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

// ===== Enhanced Behavior Analysis Scan =====
let prevSnapshot = { fg: null, overlays: new Set() };

// Dangerous permission categories for behavior scoring
const BEHAVIOR_DANGER = {
  privacy: ['READ_SMS','RECEIVE_SMS','SEND_SMS','READ_CONTACTS','WRITE_CONTACTS','READ_CALL_LOG','WRITE_CALL_LOG','READ_CALENDAR','WRITE_CALENDAR','READ_PHONE_STATE'],
  hardware: ['CAMERA','RECORD_AUDIO','BODY_SENSORS','BLUETOOTH'],
  location: ['ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION','ACCESS_BACKGROUND_LOCATION'],
  storage: ['READ_EXTERNAL_STORAGE','WRITE_EXTERNAL_STORAGE','MANAGE_EXTERNAL_STORAGE'],
  system: ['SYSTEM_ALERT_WINDOW','WRITE_SETTINGS','BIND_ACCESSIBILITY_SERVICE','BIND_DEVICE_ADMIN','REQUEST_INSTALL_PACKAGES'],
};

app.post('/api/behavior-scan', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'missing deviceId' });

  const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
  const safeShell = async (cmd) => {
    try {
      const s = await Promise.race([client.shell(deviceId, cmd), timeout(8000)]);
      return (await adb.util.readAll(s)).toString();
    } catch (e) { return ''; }
  };

  const isReal = (s) => s && s.includes('.') && /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i.test(s);

  // Collect data - add network stats, appops, logcat, and dumpsys for deeper analysis
  const [activityRaw, windowRaw, psRaw, cpuRaw, notifRaw, batteryRaw, networkRaw, appopsRaw, logcatRaw, bootReceiverRaw, overlayPermsRaw] = await Promise.all([
    safeShell('dumpsys activity activities'),
    safeShell('dumpsys window windows'),
    safeShell('ps -A'),
    safeShell('dumpsys cpuinfo'),
    safeShell('dumpsys notification'),
    safeShell('dumpsys battery'),
    safeShell('cat /proc/net/tcp 2>/dev/null; echo "---SEPARATOR---"; cat /proc/net/udp 2>/dev/null'),
    safeShell('dumpsys appops'),
    // Logcat: capture recent ad-related events (last 100 lines)
    safeShell('logcat -d -t 100 -s AdView AdLoader WebView ActivityManager PackageInstaller 2>/dev/null | head -100'),
    // Boot completed receivers
    safeShell('dumpsys package query-receivers --components android.intent.action.BOOT_COMPLETED 2>/dev/null | head -50'),
    // Overlay permissions
    safeShell('dumpsys appops get 2>/dev/null | grep -B1 "SYSTEM_ALERT_WINDOW" | grep "Uid" | head -30'),
  ]);

  // 1. Foreground app
  let currentFg = null;
  if (activityRaw) {
    for (const line of activityRaw.split('\n')) {
      if (line.includes('ResumedActivity') || line.includes('topResumedActivity')) {
        const m = line.match(/\s(\S+?)\//);
        if (m && isReal(m[1])) { currentFg = m[1]; break; }
      }
    }
  }

  // 2. Overlay windows
  const overlays = new Set();
  if (windowRaw) {
    const lines = windowRaw.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('SYSTEM_ALERT') || lines[i].includes('APPLICATION_OVERLAY') || lines[i].includes('TYPE_SYSTEM_ALERT') || lines[i].includes('TYPE_APPLICATION_OVERLAY')) {
        for (let j = i; j >= Math.max(0, i - 5); j--) {
          const m = lines[j].match(/Window\s+#\d+\s+Window\{[^}]*\s+u0\s+(\S+?)\//);
          if (m && isReal(m[1])) { overlays.add(m[1]); break; }
        }
      }
    }
  }

  // 3. CPU usage
  const cpuUsage = new Map();
  if (cpuRaw) {
    for (const line of cpuRaw.split('\n')) {
      const m = line.match(/([\d.]+)%\s+(\d+)\/(\S+?):/);
      if (m) {
        const cpu = parseFloat(m[1]) || 0;
        const pkg = m[3].replace(/:.*/, '').trim();
        if (isReal(pkg) && cpu > 0.1) cpuUsage.set(pkg, (cpuUsage.get(pkg) || 0) + cpu);
      }
    }
  }

  // 4. Process count
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

  // 5. Notification sources
  const notifications = new Set();
  if (notifRaw) {
    for (const line of notifRaw.split('\n')) {
      if (line.includes('NotificationRecord')) {
        const m = line.match(/pkg=(\S+)/);
        if (m && isReal(m[1])) notifications.add(m[1]);
      }
    }
  }

  // 6. Get all third-party packages (deduplicated)
  const allThirdParty = new Set();
  const pkgsStream = await client.shell(deviceId, 'pm list packages -3');
  const pkgsOutput = await adb.util.readAll(pkgsStream);
  for (const line of pkgsOutput.toString().trim().split('\n')) {
    const m = line.replace('package:', '').trim();
    if (m && m.includes('.') && m.length > 3) allThirdParty.add(m);
  }

  // 6b. Batch static permission analysis for ALL third-party apps
  const EXTREME_PERMS = ['android.permission.BIND_ACCESSIBILITY_SERVICE','android.permission.BIND_DEVICE_ADMIN','android.permission.REQUEST_INSTALL_PACKAGES','android.permission.MANAGE_EXTERNAL_STORAGE'];
  const HIGH_RISK_PERMS = [...EXTREME_PERMS,'android.permission.SYSTEM_ALERT_WINDOW','android.permission.WRITE_SETTINGS','android.permission.PROCESS_OUTGOING_CALLS'];
  const pkgPermData = new Map(); // pkg -> { dangerousCount, extremeCount, highRiskCount, permNames[] }
  if (allThirdParty.size > 0) {
    // Get all third-party packages' permission lists in one batch
    const pkgList = [...allThirdParty].join(' ');
    try {
      const permRaw = await safeShell(`pm list permissions -g -f 2>/dev/null; echo "---PKG_SPLIT---"; for pkg in ${pkgList}; do echo "===PKG:$pkg==="; dumpsys package "$pkg" 2>/dev/null | grep -E "android\.permission\." | sort -u; done`);
      const sections = permRaw.split('===PKG:');
      for (const sec of sections) {
        const pkgMatch = sec.match(/^([^\s=]+)===/);
        if (!pkgMatch || !isReal(pkgMatch[1])) continue;
        const pkg = pkgMatch[1];
        const perms = [];
        for (const line of sec.split('\n')) {
          const pm = line.match(/(android\.permission\.\S+)/);
          if (pm) perms.push(pm[1]);
        }
        const uniquePerms = [...new Set(perms)];
        const dangerousCount = uniquePerms.filter(p => DANGEROUS_PERMISSIONS.includes(p)).length;
        const extremeCount = uniquePerms.filter(p => EXTREME_PERMS.includes(p)).length;
        const highRiskCount = uniquePerms.filter(p => HIGH_RISK_PERMS.includes(p)).length;
        const excessDangerous = Math.max(0, dangerousCount - 4);
        const staticScore = Math.min(10, extremeCount * 3 + highRiskCount * 1 + excessDangerous * 0.5);
        pkgPermData.set(pkg, {
          dangerousCount,
          extremeCount,
          highRiskCount,
          highRiskPerms: uniquePerms.filter(p => HIGH_RISK_PERMS.includes(p)),
          totalPerms: uniquePerms.length,
          staticScore: Math.round(staticScore * 10) / 10,
        });
      }
    } catch (e) { /* partial failure ok */ }
  }

  // 7. Battery status
  let batteryStatus = 'unknown';
  if (batteryRaw) {
    const sm = batteryRaw.match(/status:\s*(\d+)/);
    if (sm) batteryStatus = { '1': 'unknown', '2': 'charging', '3': 'discharging', '4': 'not_charging', '5': 'full' }[sm[1]] || 'unknown';
  }

  // 8. Network connections - count active TCP/UDP per process
  const networkPerPkg = new Map();
  const tcpConnCount = new Map();
  const udpConnCount = new Map();
  if (networkRaw) {
    const sections = networkRaw.split('---SEPARATOR---');
    // TCP connections (active = state 01)
    if (sections[0]) {
      for (const line of sections[0].split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 7 && parts[3] === '01') {
          const inode = parts[9];
          if (inode) {
            // We can't directly map inode to PID easily, so we count total
            tcpConnCount.set('total', (tcpConnCount.get('total') || 0) + 1);
          }
        }
      }
    }
    // UDP connections
    if (sections[1]) {
      for (const line of sections[1].split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 7) {
          udpConnCount.set('total', (udpConnCount.get('total') || 0) + 1);
        }
      }
    }
  }

  // 9. App ops - detect which apps use sensitive operations (network, camera, mic, location)
  const appOpsUsage = new Map();
  if (appopsRaw) {
    let currentPkg = null;
    for (const line of appopsRaw.split('\n')) {
      const pkgMatch = line.match(/Uid\s+\d+:\s+(\S+)/);
      if (pkgMatch) { currentPkg = pkgMatch[1]; continue; }
      if (currentPkg && isReal(currentPkg)) {
        if (line.includes('COARSE_LOCATION') || line.includes('FINE_LOCATION') || line.includes('BACKGROUND_LOCATION')) {
          if (!appOpsUsage.has(currentPkg)) appOpsUsage.set(currentPkg, { network: 0, camera: 0, mic: 0, location: 0, contacts: 0, sms: 0, storage: 0 });
          appOpsUsage.get(currentPkg).location++;
        }
        if (line.includes('CAMERA') || line.includes('TAKE_PICTURE')) {
          if (!appOpsUsage.has(currentPkg)) appOpsUsage.set(currentPkg, { network: 0, camera: 0, mic: 0, location: 0, contacts: 0, sms: 0, storage: 0 });
          appOpsUsage.get(currentPkg).camera++;
        }
        if (line.includes('RECORD_AUDIO') || line.includes('PLAY_AUDIO')) {
          if (!appOpsUsage.has(currentPkg)) appOpsUsage.set(currentPkg, { network: 0, camera: 0, mic: 0, location: 0, contacts: 0, sms: 0, storage: 0 });
          appOpsUsage.get(currentPkg).mic++;
        }
        if (line.includes('READ_CONTACTS') || line.includes('WRITE_CONTACTS')) {
          if (!appOpsUsage.has(currentPkg)) appOpsUsage.set(currentPkg, { network: 0, camera: 0, mic: 0, location: 0, contacts: 0, sms: 0, storage: 0 });
          appOpsUsage.get(currentPkg).contacts++;
        }
        if (line.includes('READ_SMS') || line.includes('SEND_SMS')) {
          if (!appOpsUsage.has(currentPkg)) appOpsUsage.set(currentPkg, { network: 0, camera: 0, mic: 0, location: 0, contacts: 0, sms: 0, storage: 0 });
          appOpsUsage.get(currentPkg).sms++;
        }
        if (line.includes('READ_EXTERNAL') || line.includes('WRITE_EXTERNAL')) {
          if (!appOpsUsage.has(currentPkg)) appOpsUsage.set(currentPkg, { network: 0, camera: 0, mic: 0, location: 0, contacts: 0, sms: 0, storage: 0 });
          appOpsUsage.get(currentPkg).storage++;
        }
      }
    }
  }

  // 10. Logcat analysis - detect ad SDK activity and suspicious behavior
  const logcatAdEvents = new Map(); // pkg -> count of ad events
  const logcatKeywords = ['AdView', 'AdLoader', 'loadAd', 'showInterstitial', 'showRewarded',
    'GAD', 'AdMob', 'BannerAd', 'InterstitialAd', 'NativeAd',
    'AccessibilityService', 'performGlobalAction', 'findAccessibilityNodeInfos',
    'WebView', 'loadUrl', 'addJavascriptInterface',
    'PackageInstaller', 'installPackage', 'REQUEST_INSTALL_PACKAGES'];
  if (logcatRaw) {
    for (const line of logcatRaw.split('\n')) {
      for (const kw of logcatKeywords) {
        if (line.includes(kw)) {
          // Try to extract package name from logcat line
          const pkgMatch = line.match(/\d+\s+\d+\s+\w\s+(\S+?):/);
          if (pkgMatch && isReal(pkgMatch[1])) {
            const pkg = pkgMatch[1];
            logcatAdEvents.set(pkg, (logcatAdEvents.get(pkg) || 0) + 1);
          }
        }
      }
    }
  }

  // 11. Boot completed receivers - apps that auto-start
  const bootReceivers = new Set();
  if (bootReceiverRaw) {
    for (const line of bootReceiverRaw.split('\n')) {
      const m = line.match(/([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+)/i);
      if (m && isReal(m[1])) bootReceivers.add(m[1]);
    }
  }

  // 12. Notification text keyword analysis - detect fake system notifications
  const notifKeywords = ['恭喜', '中奖', '免费领', '系统清理', '手机加速', '病毒检测',
    '立即更新', '安全警告', '存储已满', '内存不足', '电量不足',
    '恭喜您', '限时', '红包', '优惠券', '免费', '立即领取', '点击',
    '系统升级', '安全补丁', 'Google Play 服务', '需要更新',
    '余额', '到账', '转账', '充值'];
  const notifByPkg = new Map(); // pkg -> [{keyword, line}]
  if (notifRaw) {
    let currentPkg = null;
    for (const line of notifRaw.split('\n')) {
      const pkgMatch = line.match(/pkg=(\S+)/);
      if (pkgMatch) { currentPkg = pkgMatch[1]; continue; }
      if (currentPkg && isReal(currentPkg)) {
        for (const kw of notifKeywords) {
          if (line.includes(kw)) {
            if (!notifByPkg.has(currentPkg)) notifByPkg.set(currentPkg, []);
            notifByPkg.get(currentPkg).push({ keyword: kw, context: line.trim().substring(0, 120) });
          }
        }
      }
    }
  }

  // 13. Overlay permissions - which third-party apps have SYSTEM_ALERT_WINDOW
  const overlayPermittedPkgs = new Set();
  if (overlayPermsRaw) {
    for (const line of overlayPermsRaw.split('\n')) {
      const m = line.match(/Uid\s+\d+:\s+(\S+)/);
      if (m && isReal(m[1])) overlayPermittedPkgs.add(m[1]);
    }
  }

  // Build comprehensive results - focus on ACTUAL BEHAVIOR, not permissions
  const appResults = [];
  let totalNetworkEvents = 0, totalSensitiveAPIs = 0;

  for (const pkg of allThirdParty) {
    const signals = [];
    let score = 0;

    // ── CPU: 高CPU = 后台偷偷干活 ──
    const cpu = cpuUsage.get(pkg) || 0;
    if (cpu > 15) { signals.push({ type: '极高CPU', detail: `${cpu.toFixed(1)}% — 后台严重消耗`, category: 'system', severity: 3 }); score += 8; }
    else if (cpu > 8) { signals.push({ type: '高CPU', detail: `${cpu.toFixed(1)}% — 后台持续消耗`, category: 'system', severity: 2 }); score += 5; }
    else if (cpu > 3) { signals.push({ type: 'CPU偏高', detail: `${cpu.toFixed(1)}%`, category: 'system', severity: 1 }); score += 2; }

    // ── 叠加层: 弹广告的核心手段 ──
    if (overlays.has(pkg)) { signals.push({ type: '叠加层弹窗', detail: '正在弹出悬浮窗/广告', category: 'ads', severity: 3 }); score += 25; }
    else if (overlayPermittedPkgs.has(pkg)) { signals.push({ type: '有悬浮窗权限', detail: '可以随时弹广告', category: 'ads', severity: 1 }); score += 2; }

    // ── 进程: 杀不死的流氓进程多 ──
    const procs = processCount.get(pkg) || 0;
    if (procs >= 4) { signals.push({ type: `${procs}个进程`, detail: '后台常驻多进程', category: 'system', severity: 2 }); score += 5; }
    else if (procs >= 2) { signals.push({ type: `${procs}个进程`, detail: '', category: 'system', severity: 1 }); score += 1; }

    // ── 开机自启: 杀不掉 ──
    if (bootReceivers.has(pkg)) { signals.push({ type: '开机自启', detail: '重启后自动运行', category: 'ads', severity: 1 }); score += 2; }

    // ── 广告SDK: 正在加载广告 ──
    const adEvents = logcatAdEvents.get(pkg) || 0;
    if (adEvents > 5) { signals.push({ type: '广告加载中', detail: `Logcat抓到${adEvents}次广告`, category: 'ads', severity: 3 }); score += 12; }
    else if (adEvents > 0) { signals.push({ type: '有广告行为', detail: `${adEvents}次`, category: 'ads', severity: 1 }); score += 3; }

    // ── 伪装通知: 冒充系统发假通知 ──
    const notifKws = notifByPkg.get(pkg);
    if (notifKws && notifKws.length > 0) {
      const uniqueKws = [...new Set(notifKws.map(n => n.keyword))];
      signals.push({ type: '假通知', detail: `含: ${uniqueKws.slice(0, 3).join(', ')}`, category: 'ads', severity: 3 }); score += 10;
    }

    // ── 敏感操作: 在偷偷调用隐私 ──
    const ops = appOpsUsage.get(pkg);
    if (ops) {
      if (ops.camera > 0) { signals.push({ type: '在用摄像头', detail: `${ops.camera}次`, category: 'privacy', severity: 2 }); score += 4; }
      if (ops.mic > 0) { signals.push({ type: '在用麦克风', detail: `${ops.mic}次`, category: 'privacy', severity: 2 }); score += 4; }
      if (ops.location > 0) { signals.push({ type: '在定位', detail: `${ops.location}次`, category: 'privacy', severity: 1 }); score += 2; }
      if (ops.sms > 0) { signals.push({ type: '在发短信', detail: `${ops.sms}次`, category: 'privacy', severity: 3 }); score += 6; }
      if (ops.contacts > 0) { signals.push({ type: '读通讯录', detail: `${ops.contacts}次`, category: 'privacy', severity: 1 }); score += 1; }
    }

    // ── 前台标记(不加分，只显示) ──
    if (pkg === currentFg) { signals.push({ type: '前台', detail: '当前活跃', category: 'system', severity: 0 }); }

    const networkHits = ops ? (ops.location + ops.camera + ops.mic + ops.contacts + ops.sms + ops.storage) : 0;
    totalNetworkEvents += networkHits;
    totalSensitiveAPIs += signals.filter(s => s.category === 'privacy').length;

    // 简单粗暴：score 越高越可能是病毒
    const normalizedScore = Math.min(100, score);
    const risk = normalizedScore >= 15 ? 'high' : normalizedScore >= 5 ? 'medium' : 'low';

    appResults.push({ pkg, signals, score: normalizedScore, risk, cpu: cpu || 0, processes: procs, networkHits });
  }

  // Sort: overlays/ads first → foreground → then by score
  appResults.sort((a, b) => {
    const aHasOverlay = a.signals.some(s => s.type === '叠加层弹窗');
    const bHasOverlay = b.signals.some(s => s.type === '叠加层弹窗');
    if (aHasOverlay && !bHasOverlay) return -1;
    if (!aHasOverlay && bHasOverlay) return 1;
    const aFg = a.signals.some(s => s.type === '前台');
    const bFg = b.signals.some(s => s.type === '前台');
    if (aFg && !bFg) return -1;
    if (!aFg && bFg) return 1;
    return b.score - a.score;
  });

  // Detect changes
  const newOverlays = [];
  for (const pkg of overlays) {
    if (!prevSnapshot.overlays.has(pkg)) newOverlays.push(pkg);
  }
  prevSnapshot = { fg: currentFg, overlays: new Set(overlays) };

  // Count apps by permission category
  const permissionStats = { privacy: 0, system: 0, ads: 0, storage: 0 };
  for (const r of appResults) {
    for (const sig of r.signals) {
      if (sig.category === 'privacy') permissionStats.privacy++;
      if (sig.category === 'system') permissionStats.system++;
      if (sig.category === 'ads') permissionStats.ads++;
      if (sig.category === 'storage') permissionStats.storage++;
    }
  }

  res.json({
    foreground: currentFg,
    overlays: Array.from(overlays),
    newOverlays,
    batteryStatus,
    results: appResults,
    summary: {
      totalApps: appResults.length,
      totalProcesses: processCount.size,
      overlayCount: overlays.size,
      notificationCount: notifications.size,
      batteryStatus,
      highCpuCount: appResults.filter(r => r.score >= 6).length,
      suspiciousCount: appResults.filter(r => r.risk === 'high' || r.risk === 'medium').length,
      totalNetworkEvents,
      totalSensitiveAPIs,
      tcpConnections: tcpConnCount.get('total') || 0,
      udpConnections: udpConnCount.get('total') || 0,
      permissionStats,
    }
  });
});

// ===== ADB Shell =====
app.post('/api/command', async (req, res) => {
  const { deviceId, command } = req.body;
  if (!deviceId || !command) return res.status(400).json({ error: 'missing params' });
  try {
    const stream = await client.shell(deviceId, command);
    const output = await adb.util.readAll(stream);
    res.json({ output: output.toString() });
  } catch (err) { res.json({ error: err.message }); }
});

// ===== App Install Time (for age-based risk) =====
app.get('/api/app-install-time/:deviceId/:pkg', async (req, res) => {
  const { deviceId, pkg } = req.params;
  const safe = sanitize(pkg);
  try {
    const stream = await client.shell(deviceId, `dumpsys package ${safe} | grep -E "firstInstallTime|lastUpdateTime"`);
    const output = (await adb.util.readAll(stream)).toString();
    const first = output.match(/firstInstallTime:\s*(.+)/);
    const last = output.match(/lastUpdateTime:\s*(.+)/);
    res.json({ firstInstall: first?.[1]?.trim() || null, lastUpdate: last?.[1]?.trim() || null });
  } catch (err) { res.json({ firstInstall: null, lastUpdate: null }); }
});

// ===== Disable Auto-Start (multiple methods) =====
function execAdbShell(deviceId, cmd) {
  return new Promise((resolve, reject) => {
    execFile(adbPath, ['-s', deviceId, 'shell', cmd], { timeout: 15000 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

app.post('/api/disable-boot-receiver', async (req, res) => {
  const { deviceId, pkg } = req.body;
  if (!deviceId || !pkg) return res.status(400).json({ error: 'missing params' });
  try {
    // Method 1: appops (Android 9+)
    const r1 = await execAdbShell(deviceId, `cmd appops set ${pkg} RUN_ANY_IN_BACKGROUND deny 2>&1`);
    if (r1 && !r1.includes('Error') && !r1.includes('not found') && !r1.includes('Unknown')) {
      return res.json({ success: true, method: 'appops' });
    }

    // Method 2: dumpsys -> disable receivers
    const ds = await execAdbShell(deviceId, `dumpsys package ${pkg} | grep -c "BOOT_COMPLETED"`);
    if (ds && ds.trim() !== '0') {
      const raw = await execAdbShell(deviceId, `dumpsys package ${pkg} | grep -E "BOOT_COMPLETED|Receiver\\{" | head -20`);
      const lines = raw.split('\n');
      let disabled = 0;
      for (const line of lines) {
        const m = line.match(/([a-zA-Z][a-zA-Z0-9._]*\/\.[a-zA-Z][a-zA-Z0-9._]*)/);
        if (m) {
          const r = await execAdbShell(deviceId, `pm disable --user 0 "${m[1]}" 2>&1`);
          if (r && !r.includes('Error') && !r.includes('not exist') && !r.includes('not found')) disabled++;
        }
      }
      if (disabled > 0) return res.json({ success: true, method: 'component', disabledCount: disabled });
    }

    // Method 3: pm disable-user
    const r3 = await execAdbShell(deviceId, `pm disable-user --user 0 ${pkg} 2>&1`);
    if (r3 && !r3.includes('Error') && !r3.includes('not exist')) {
      return res.json({ success: true, method: 'disable-user', note: '可在桌面重新打开应用' });
    }

    res.json({ success: false, error: '无法关闭自启，请手动在手机设置中关闭' });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.listen(port, () => console.log(`ERS Tech AV Killer Server running at http://localhost:${port}`));

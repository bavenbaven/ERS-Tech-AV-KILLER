import React, { createContext, useState, useEffect, useContext, useRef, useMemo, useCallback } from 'react';
import virusDBData from '../data/virusDB';
import protectedAppsData from '../data/protectedApps';
import brandDBData from '../data/brandDB';
import keywordDBData from '../data/keywordDB';
import * as Backend from '../backend';

const VirusContext = createContext();

const OEM_PREFIXES = ['com.miui.','com.xiaomi.','com.huawei.','com.oppo.','com.coloros.','com.vivo.','com.bbk.','com.lenovo.','com.oneplus.','com.realme.','com.mediatek.','com.qualcomm.','com.sec.','org.ifaa.','com.trustonic.','miui.systemui.','android.miui.','android.aosp.','org.mipay.','com.milink.','com.fido.'];

const ENCRYPT_KEY = 'ERS_TECH_2026_AV_KILLER';
const GITHUB_REPO = 'bavenbaven/ERS-Tech-AV-KILLER';
const SHARED_TOKEN = 'ghp_shared_ers_report_only'; // Fine-grained token: Issues:Write only

// GitHub DB sync state keys
const STORAGE_KEY_GITHUB_TOKEN = 'aiva_github_token';
const STORAGE_KEY_DB_VERSION = 'aiva_db_version';
const STORAGE_KEY_DB_CACHE = 'aiva_db_cache'; // { virusDB, keywordDB, brandDB, protectedApps }

const xorCrypt = (data, key) => {
  let result = '';
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
};

const encryptData = (jsonStr) => {
  const encrypted = xorCrypt(jsonStr, ENCRYPT_KEY);
  const b64 = btoa(unescape(encodeURIComponent(encrypted)));
  return 'ERS_VIRUS_DB_V1:' + b64;
};

const decryptData = (encryptedStr) => {
  if (!encryptedStr || !encryptedStr.startsWith('ERS_VIRUS_DB_V1:')) return null;
  const b64 = encryptedStr.slice('ERS_VIRUS_DB_V1:'.length).trim();
  try {
    const encrypted = decodeURIComponent(escape(atob(b64)));
    const decrypted = xorCrypt(encrypted, ENCRYPT_KEY);
    const parsed = JSON.parse(decrypted);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return null;
  } catch { return null; }
};

const STORAGE_KEY_VIRUS = 'aiva_virus_db';
const STORAGE_KEY_IS_ADMIN = 'aiva_is_admin';
const STORAGE_KEY_ADMIN_HASH = 'aiva_admin_hash';

// Password hash
const hashPassword = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(16);
};

// Connection polling intervals
const POLL_FAST = 3000;   // When disconnected
const POLL_NORMAL = 5000; // When connected
const POLL_BURST = 1200;  // Rapid retry after disconnect

export const VirusProvider = ({ children }) => {
  const [virusDB, setVirusDB] = useState(virusDBData);
  const [protectedApps, setProtectedApps] = useState(protectedAppsData);
  const [brandDB, setBrandDB] = useState(brandDBData);
  const [keywordDB, setKeywordDB] = useState(keywordDBData);
  const [logs, setLogs] = useState(() => { try { return JSON.parse(localStorage.getItem('aiva_logs') || '[]'); } catch { return []; } });
  const [device, setDevice] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [debugMsg, setDebugMsg] = useState('System ready');
  const [isManualPaused, setIsManualPaused] = useState(false);
  const [waitingAuth, setWaitingAuth] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false); // Always start as guest by default

  // GitHub sync state
  const [dbSyncStatus, setDbSyncStatus] = useState('idle'); // idle, syncing, synced, error, offline
  const [dbVersion, setDbVersion] = useState(() => localStorage.getItem(STORAGE_KEY_DB_VERSION) || '');
  const [dbLastSync, setDbLastSync] = useState(() => localStorage.getItem('aiva_db_last_sync') || '');
  const [dbError, setDbError] = useState('');
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN) || '');
  const [githubRole, setGithubRole] = useState(() => localStorage.getItem('aiva_github_role') || 'guest'); // owner, contributor, guest
  const [pendingIssues, setPendingIssues] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(false);

  const verifyPassword = useCallback((password) => {
    const storedHash = localStorage.getItem(STORAGE_KEY_ADMIN_HASH);
    if (!storedHash) return false;
    return hashPassword(password) === storedHash;
  }, []);

  const hasAdminPassword = useCallback(() => !!localStorage.getItem(STORAGE_KEY_ADMIN_HASH), []);

  const changeAdminPassword = useCallback((oldPass, newPass) => {
    const storedHash = localStorage.getItem(STORAGE_KEY_ADMIN_HASH);
    if (storedHash && hashPassword(oldPass) !== storedHash) {
      return { success: false, message: '旧密码错误' };
    }
    if (!newPass || newPass.length < 4) {
      return { success: false, message: '新密码至少4位' };
    }
    localStorage.setItem(STORAGE_KEY_ADMIN_HASH, hashPassword(newPass));
    return { success: true, message: '瀵嗙爜淇敼鎴愬姛' };
  }, []);

  const resetAdminPassword = useCallback(() => {
  localStorage.setItem(STORAGE_KEY_ADMIN_HASH, hashPassword('admin888'));
  return true;
}, []);

// ==================== GitHub DB Sync Functions ====================

  const fetchDbFromGitHub = useCallback(async () => {
    setDbSyncStatus('syncing');
    setDbError('');
    try {
      // Try fetching from GitHub raw content
      const [virusRes, keywordRes, brandRes, protectedRes, versionRes] = await Promise.allSettled([
        fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/db/virusDB.json`),
        fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/db/keywordDB.json`),
        fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/db/brandDB.json`),
        fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/db/protectedApps.json`),
        fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/db/db_version.json`),
      ]);

      // Check if all fetches succeeded
      const failed = [virusRes, keywordRes, brandRes, protectedRes, versionRes].find(r => r.status === 'rejected');
      if (failed) throw new Error('Failed to fetch DB files from GitHub');

      const virusData = await virusRes.value.json();
      const keywordData = await keywordRes.value.json();
      const brandData = await brandRes.value.json();
      const protectedData = await protectedRes.value.json();
      const versionData = await versionRes.value.json();

      // Update state
      if (Array.isArray(virusData)) setVirusDB(virusData);
      if (Array.isArray(keywordData)) setKeywordDB(keywordData);
      if (Array.isArray(brandData)) setBrandDB(brandData);
      if (Array.isArray(protectedData)) setProtectedApps(protectedData);

      // Update version
      const newVersion = versionData.version || '';
      setDbVersion(newVersion);
      localStorage.setItem(STORAGE_KEY_DB_VERSION, newVersion);

      // Cache for offline use
      const cache = { virusData, keywordData, brandData, protectedData, version: newVersion, timestamp: Date.now() };
      localStorage.setItem(STORAGE_KEY_DB_CACHE, JSON.stringify(cache));

      const now = new Date().toLocaleString();
      setDbLastSync(now);
      localStorage.setItem('aiva_db_last_sync', now);
      setDbSyncStatus('synced');
      return { success: true, version: newVersion };
    } catch (err) {
      console.error('GitHub DB sync failed:', err);
      setDbError(err.message || 'Sync failed');
      // Try loading from cache
      try {
        const cached = JSON.parse(localStorage.getItem(STORAGE_KEY_DB_CACHE) || 'null');
        if (cached) {
          if (Array.isArray(cached.virusData)) setVirusDB(cached.virusData);
          if (Array.isArray(cached.keywordData)) setKeywordDB(cached.keywordData);
          if (Array.isArray(cached.brandData)) setBrandDB(cached.brandData);
          if (Array.isArray(cached.protectedData)) setProtectedApps(cached.protectedData);
          setDbVersion(cached.version || '');
          setDbSyncStatus('offline');
          return { success: true, offline: true, version: cached.version };
        }
      } catch {}
      setDbSyncStatus('error');
      return { success: false, error: err.message };
    }
  }, []);

  const pushDbToGitHub = useCallback(async (token) => {
    if (!token) return { success: false, error: 'No token provided' };
    setDbSyncStatus('syncing');
    setDbError('');
    try {
      const files = [
        { path: 'db/virusDB.json', data: virusDB },
        { path: 'db/keywordDB.json', data: keywordDB },
        { path: 'db/brandDB.json', data: brandDB },
        { path: 'db/protectedApps.json', data: protectedApps },
      ];

      for (const file of files) {
        // Get current file SHA (needed for update)
        const getRes = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${file.path}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        let sha = '';
        if (getRes.ok) {
          const existing = await getRes.json();
          sha = existing.sha || '';
        }

        // Update file
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(file.data, null, 2))));
        const body = { message: `Update ${file.path} via app`, content };
        if (sha) body.sha = sha;

        const putRes = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${file.path}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          }
        );

        if (!putRes.ok) {
          const err = await putRes.json();
          throw new Error(err.message || `Failed to update ${file.path}`);
        }
      }

      // Update db_version.json with new timestamp
      const versionData = { version: dbVersion || '1.0.0', updated_at: new Date().toISOString() };
      const getVerRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/contents/db/db_version.json`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      let verSha = '';
      if (getVerRes.ok) {
        const existing = await getVerRes.json();
        verSha = existing.sha || '';
      }
      const verContent = btoa(unescape(encodeURIComponent(JSON.stringify(versionData, null, 2))));
      const verBody = { message: 'Update db_version.json via app', content: verContent };
      if (verSha) verBody.sha = verSha;

      await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/contents/db/db_version.json`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(verBody),
        }
      );

      setDbSyncStatus('synced');
      const now = new Date().toLocaleString();
      setDbLastSync(now);
      localStorage.setItem('aiva_db_last_sync', now);
      return { success: true };
    } catch (err) {
      setDbError(err.message || 'Push failed');
      setDbSyncStatus('error');
      return { success: false, error: err.message };
    }
  }, [virusDB, keywordDB, brandDB, protectedApps, dbVersion]);

  const reportVirus = useCallback(async (pkgName, reason, reporter = 'anonymous') => {
    const token = githubToken || SHARED_TOKEN;
    if (!token) return { success: false, error: 'No token available' };

    try {
      const body = {
        title: `🦠 Report: ${pkgName}`,
        body: `## Virus Report\n\n**Package:** \`${pkgName}\`\n**Reason:** ${reason}\n**Reporter:** ${reporter}\n**Time:** ${new Date().toLocaleString()}\n**Status:** pending\n\n---\n*This issue was created via the ERS Tech AV KILLER app.*`,
        labels: ['virus-report', 'pending'],
      };

      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/issues`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create issue');
      }

      const issue = await res.json();
      return { success: true, issueNumber: issue.number, issueUrl: issue.html_url };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [githubToken]);

  const fetchPendingIssues = useCallback(async () => {
    if (!githubToken || githubRole === 'guest') return [];
    setIssuesLoading(true);
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/issues?state=open&labels=pending`,
        { headers: { Authorization: `Bearer ${githubToken}` } }
      );
      if (!res.ok) throw new Error('Failed to fetch issues');
      const issues = await res.json();
      setPendingIssues(issues);
      return issues;
    } catch (err) {
      console.error('Failed to fetch issues:', err);
      return [];
    } finally {
      setIssuesLoading(false);
    }
  }, [githubToken, githubRole]);

  const approveIssue = useCallback(async (issueNumber, packageName) => {
    if (!githubToken || githubRole === 'guest') return { success: false, error: 'No permission' };
    try {
      // Add to virus DB
      setVirusDB(v => [...new Set([...v, packageName])]);

      // Close issue with comment
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/issues/${issueNumber}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${githubToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            state: 'closed',
            state_reason: 'completed',
            labels: ['virus-report', 'approved'],
            body: `✅ **Approved by owner**\n\nPackage \`${packageName}\` has been added to the virus database.\n\nClosed at ${new Date().toLocaleString()}`,
          }),
        }
      );

      if (!res.ok) throw new Error('Failed to close issue');
      setPendingIssues(prev => prev.filter(i => i.number !== issueNumber));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [githubToken, githubRole]);

  const rejectIssue = useCallback(async (issueNumber, reason = 'Not a virus') => {
    if (!githubToken || githubRole === 'guest') return { success: false, error: 'No permission' };
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/issues/${issueNumber}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${githubToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            state: 'closed',
            state_reason: 'not_planned',
            labels: ['virus-report', 'rejected'],
            body: `❌ **Rejected by owner**\n\nReason: ${reason}\n\nClosed at ${new Date().toLocaleString()}`,
          }),
        }
      );

      if (!res.ok) throw new Error('Failed to close issue');
      setPendingIssues(prev => prev.filter(i => i.number !== issueNumber));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [githubToken, githubRole]);

  const saveGithubConfig = useCallback((token, role) => {
    localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN, token);
    localStorage.setItem('aiva_github_role', role);
    setGithubToken(token);
    setGithubRole(role);
  }, []);

  // Load config on mount
  useEffect(() => {
    const savedToken = localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN);
    const savedRole = localStorage.getItem('aiva_github_role');
    if (savedToken) setGithubToken(savedToken);
    if (savedRole) setGithubRole(savedRole);
  }, []);

  useEffect(() => { try { localStorage.setItem('aiva_logs', JSON.stringify(logs.slice(0, 500))); } catch {} }, [logs]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_VIRUS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) setVirusDB(parsed);
      }
      // Always start as guest; admin state is NOT persisted across sessions
      setIsAdmin(false);
      // Set default password if not exists (or recover if hash doesn't match default)
      if (!localStorage.getItem(STORAGE_KEY_ADMIN_HASH)) {
        localStorage.setItem(STORAGE_KEY_ADMIN_HASH, hashPassword('admin888'));
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_VIRUS, JSON.stringify(virusDB)); } catch {}
  }, [virusDB]);

  // ==================== Startup GitHub Sync ====================
  useEffect(() => {
    const initSync = async () => {
      try {
        await fetchDbFromGitHub();
      } catch (err) {
        console.error('Initial sync failed:', err);
        // Load from cache if available
        try {
          const cached = JSON.parse(localStorage.getItem(STORAGE_KEY_DB_CACHE) || 'null');
          if (cached) {
            if (Array.isArray(cached.virusData)) setVirusDB(cached.virusData);
            if (Array.isArray(cached.keywordData)) setKeywordDB(cached.keywordData);
            if (Array.isArray(cached.brandData)) setBrandDB(cached.brandData);
            if (Array.isArray(cached.protectedData)) setProtectedApps(cached.protectedData);
            setDbSyncStatus('offline');
          }
        } catch {}
      }
    };
    initSync();
  }, []);

  const exportVirusDat = useCallback(() => {
    if (!isAdmin) return null;
    const jsonStr = JSON.stringify(virusDB);
    return encryptData(jsonStr);
  }, [isAdmin, virusDB]);

  const importVirusDat = useCallback((encryptedStr) => {
    const data = decryptData(encryptedStr);
    if (!data) return { success: false, message: '文件格式错误或已损坏' };
    setVirusDB(data);
    return { success: true, count: data.length, message: `成功导入 ${data.length} 条病毒记录` };
  }, []);

  const isGuest = !isAdmin;

  const setGuestMode = useCallback(() => {
    setIsAdmin(false);
    localStorage.setItem(STORAGE_KEY_IS_ADMIN, 'false');
  }, []);

  const setAdminMode = useCallback(() => {
    setIsAdmin(true);
    localStorage.setItem(STORAGE_KEY_IS_ADMIN, 'true');
  }, []);

  const addVirus = useCallback((p) => {
    if (!isAdmin) return false;
    setVirusDB(v => [...new Set([...v, p])]);
    return true;
  }, [isAdmin]);

  const removeVirus = useCallback((p) => {
    setVirusDB(v => v.filter(x => x !== p));
    return true;
  }, []);

  const bulkAddVirus = useCallback((arr) => {
    if (!isAdmin) return 0;
    setVirusDB(v => {
      const cur = new Set(v);
      const toAdd = arr.filter(p => p && !cur.has(p));
      return [...new Set([...v, ...toAdd])];
    });
    // Return approximate count (actual dedup happens in state updater)
    return arr.length;
  }, [isAdmin]);

  const deviceRef = useRef(null);
  const waitingAuthRef = useRef(false);
  const authRetryTimerRef = useRef(null);
  const authRetryDoneRef = useRef(false);
  const pollIntervalRef = useRef(POLL_FAST);
  const burstCountRef = useRef(0);

  const addLog = useCallback((l) => setLogs(lg => [{ ...l, id: Date.now() + Math.random() }, ...lg]), []);

  const fetchDeviceInfo = useCallback(async (id) => {
    if (!id) return;
    try {
      const info = await Backend.getDeviceInfo(id);
      if (info && info.model) setDeviceInfo(info);
    } catch {}
  }, []);

  const applyDeviceState = useCallback((devices = []) => {
    if (devices.length > 0) {
      const unauthorized = devices.find(d => d.type === 'unauthorized');
      if (unauthorized) {
        if (!waitingAuthRef.current) { waitingAuthRef.current = true; setWaitingAuth(true); }
        if (deviceRef.current !== null) { deviceRef.current = null; setDevice(null); setDeviceInfo(null); }
        setDebugMsg('请保持手机亮屏解锁，USB选择文件传输(MTP)，并勾选“始终允许这台电脑”后点击允许');
        pollIntervalRef.current = POLL_FAST;
        if (!authRetryDoneRef.current && !authRetryTimerRef.current) {
          authRetryTimerRef.current = setTimeout(async () => {
            try { await Backend.quickConnectAdb(); } catch {}
            authRetryDoneRef.current = true;
            authRetryTimerRef.current = null;
          }, 10000);
        }
        return;
      }
      const usbDevice = devices.find(d => d.type === 'device');
      if (usbDevice) {
        const prev = deviceRef.current;
        const changed = !prev || prev.id !== usbDevice.id;
        deviceRef.current = usbDevice;
        if (waitingAuthRef.current) { waitingAuthRef.current = false; setWaitingAuth(false); }
        if (authRetryTimerRef.current) { clearTimeout(authRetryTimerRef.current); authRetryTimerRef.current = null; }
        authRetryDoneRef.current = false;
        pollIntervalRef.current = POLL_NORMAL;
        burstCountRef.current = 0;
        if (changed) {
          setDevice(usbDevice);
          setDebugMsg('Device connected');
          fetchDeviceInfo(usbDevice.id);
          addLog({ time: new Date().toLocaleString(), name: '系统', pkg: usbDevice.id, status: '设备已连接' });
        }
        return;
      }
    }

    if (waitingAuthRef.current) { waitingAuthRef.current = false; setWaitingAuth(false); }
    if (authRetryTimerRef.current) { clearTimeout(authRetryTimerRef.current); authRetryTimerRef.current = null; }
    authRetryDoneRef.current = false;
    if (deviceRef.current !== null) {
      const oldId = deviceRef.current.id;
      deviceRef.current = null;
      setDevice(null);
      setDeviceInfo(null);
      setDebugMsg('Device disconnected');
      addLog({ time: new Date().toLocaleString(), name: '系统', pkg: oldId, status: '设备断开' });
      pollIntervalRef.current = POLL_BURST;
      burstCountRef.current = 6;
    }
  }, [addLog, fetchDeviceInfo]);

  const refreshDevices = useCallback(async () => {
    if (isManualPaused) return;
    try {
      const raw = await Backend.listDevices();
      applyDeviceState(raw || []);

      if (burstCountRef.current > 0) {
        burstCountRef.current--;
        if (burstCountRef.current <= 0) {
          pollIntervalRef.current = POLL_FAST;
        }
      }
    } catch {}
  }, [isManualPaused, applyDeviceState]);

  const disconnectDevice = useCallback(() => {
    setIsManualPaused(true);
    deviceRef.current = null;
    setDevice(null);
    setDeviceInfo(null);
    setDebugMsg('Disconnected');
  }, []);

  const reconnect = useCallback(() => {
    Backend.quickConnectAdb().catch(() => {});
    setIsManualPaused(false);
    deviceRef.current = null;
    setDevice(null);
    setDeviceInfo(null);
    setDebugMsg('Scanning...');
    pollIntervalRef.current = POLL_FAST;
    burstCountRef.current = 0;
  }, []);

  useEffect(() => {
    let off = null;
    (async () => {
      off = await Backend.subscribeAdbDeviceEvents((payload) => {
        if (isManualPaused) return;
        applyDeviceState(payload?.devices || []);
      });
    })();
    return () => {
      if (authRetryTimerRef.current) {
        clearTimeout(authRetryTimerRef.current);
        authRetryTimerRef.current = null;
      }
      if (off) off();
    };
  }, [isManualPaused, applyDeviceState]);

  // Adaptive polling interval
  useEffect(() => {
    let timer = null;
    const poll = async () => {
      await refreshDevices();
      timer = setTimeout(poll, pollIntervalRef.current);
    };
    if (!isManualPaused) {
      timer = setTimeout(poll, pollIntervalRef.current);
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [isManualPaused, refreshDevices]);

  // Periodic device info refresh (every 30s when connected)
  useEffect(() => {
    if (!device || isManualPaused) return;
    const id = device.id;
    const t = setInterval(() => fetchDeviceInfo(id), 30000);
    return () => clearInterval(t);
  }, [device?.id, isManualPaused, fetchDeviceInfo]);

  const protectedSet = useRef(new Set(protectedApps));
  const brandSet = useRef(new Set(brandDB));
  useEffect(() => { protectedSet.current = new Set(protectedApps); }, [protectedApps]);
  useEffect(() => { brandSet.current = new Set(brandDB); }, [brandDB]);

  const isProtected = useCallback((pkg) => {
    if (!pkg) return false;
    if (pkg.startsWith('com.android.') || pkg.startsWith('com.samsung.')) return true;
    if (protectedSet.current.has(pkg) || brandSet.current.has(pkg)) return true;
    for (const p of OEM_PREFIXES) if (pkg.startsWith(p)) return true;
    return false;
  }, []);

  const matchesKeywords = useCallback((pkg) => {
    if (!pkg) return false;
    const lower = pkg.toLowerCase();
    return keywordDB.some(kw => {
      const kl = kw.toLowerCase();
      if (kl.length <= 4) {
        const idx = lower.indexOf(kl);
        if (idx === -1) return false;
        const before = idx > 0 ? lower[idx - 1] : '.';
        const after = idx + kl.length < lower.length ? lower[idx + kl.length] : '.';
        return before === '.' || after === '.';
      }
      return lower.includes(kl);
    });
  }, [keywordDB]);

  const resetADB = useCallback(async () => {
    try {
      setDebugMsg('姝ｅ湪閲嶇疆ADB...');
      setIsManualPaused(true);
      deviceRef.current = null;
      await Backend.resetAdb();
      await Backend.quickConnectAdb().catch(() => {});
      setWaitingAuth(false);
      setDevice(null);
      setDeviceInfo(null);
      setDebugMsg('ADB宸查噸缃紝2绉掑悗鑷姩閲嶆柊鎵弿...');
      setTimeout(() => {
        setIsManualPaused(false);
        pollIntervalRef.current = POLL_BURST;
        burstCountRef.current = 6;
        setDebugMsg('姝ｅ湪鎵弿璁惧...');
      }, 2000);
      addLog({ time: new Date().toLocaleString(), name: '系统', pkg: 'ADB', status: 'ADB服务已重置' });
    } catch {
      setDebugMsg('ADB閲嶇疆澶辫触');
      setIsManualPaused(false);
      addLog({ time: new Date().toLocaleString(), name: '绯荤粺', pkg: 'ADB', status: 'ADB閲嶇疆澶辫触' });
    }
  }, [addLog]);

  const reconnectAdb = useCallback(async () => {
    try {
      setDebugMsg('姝ｅ湪杩涜涓€閿繁搴︿慨澶?..');
      setIsManualPaused(true);
      deviceRef.current = null;
      await Backend.reconnectAdb();
      await Backend.quickConnectAdb().catch(() => {});
      setWaitingAuth(false);
      setDevice(null);
      setDeviceInfo(null);
      setDebugMsg('淇瀹屾垚锛屾鍦ㄩ噸鏂版壂鎻?..');
      setTimeout(() => {
        setIsManualPaused(false);
        pollIntervalRef.current = POLL_BURST;
        burstCountRef.current = 6;
      }, 2000);
      addLog({ time: new Date().toLocaleString(), name: '系统', pkg: 'Repair', status: '完成一键深度修复' });
      return true;
    } catch {
      setDebugMsg('淇杩囩▼閬囧埌闂');
      setIsManualPaused(false);
      return false;
    }
  }, [addLog]);

  const installDriver = useCallback(async () => {
    setDebugMsg('姝ｅ湪瀹夎ADB椹卞姩...');
    try {
      await Backend.installDriver();
      setDebugMsg('椹卞姩瀹夎鎴愬姛锛佽鎻掓嫈鎵嬫満閲嶈瘯');
      addLog({ time: new Date().toLocaleString(), name: '绯荤粺', pkg: 'Driver', status: '椹卞姩瀹夎鎴愬姛' });
      return true;
    } catch {
      setDebugMsg('椹卞姩瀹夎澶辫触锛岃浠ョ鐞嗗憳韬唤杩愯绋嬪簭');
      addLog({ time: new Date().toLocaleString(), name: '绯荤粺', pkg: 'Driver', status: '椹卞姩瀹夎澶辫触' });
      return false;
    }
  }, [addLog]);

  // Stable wrappers for device-dependent operations
  const getFiles = useCallback(async (p) => {
    if (!device) return [];
    return Backend.getFiles(device.id, p);
  }, [device]);

  const deleteFile = useCallback(async (p) => {
    if (!device) return { success: false };
    return Backend.deleteFile(device.id, p);
  }, [device]);

  const renameFile = useCallback(async (oldP, newP) => {
    if (!device) return { success: false };
    return Backend.renameFile(device.id, oldP, newP);
  }, [device]);

  const copyFile = useCallback(async (src, dest) => {
    if (!device) return { success: false };
    return Backend.copyFile(device.id, src, dest);
  }, [device]);

  const makeDir = useCallback(async (p) => {
    if (!device) return { success: false };
    return Backend.makeDir(device.id, p);
  }, [device]);

  const pullFile = useCallback(async (remote, local) => {
    if (!device) return { success: false };
    return Backend.pullFile(device.id, remote, local);
  }, [device]);

  const pushFile = useCallback(async (local, remote) => {
    if (!device) return { success: false };
    return Backend.pushFile(device.id, local, remote);
  }, [device]);

  const getScreenshot = useCallback(async () => {
    if (!device) return null;
    return Backend.getScreenshot(device.id);
  }, [device]);

  const uninstallApp = useCallback(async (p) => {
    if (!device) return { success: false };
    return Backend.uninstallApp(device.id, p);
  }, [device]);

  const getApps = useCallback(async () => {
    if (!device) return [];
    return Backend.getApps(device.id);
  }, [device]);

  const pickApkFile = useCallback(async () => {
    return Backend.pickApkFile();
  }, []);

  const installAPK = useCallback(async (file) => {
    if (!device) return { success: false };
    return Backend.installApk(device.id, file);
  }, [device]);

  const installAPKRemote = useCallback(async (remotePath) => {
    if (!device) return { success: false };
    return Backend.installApkRemote(device.id, remotePath);
  }, [device]);

  const getCurrentApp = useCallback(async () => {
    if (!device) return 'Unknown';
    return Backend.getCurrentApp(device.id);
  }, [device]);

  const behaviorScan = useCallback(async () => {
    if (!device) return null;
    return Backend.behaviorScan(device.id);
  }, [device]);

  const behaviorScanLight = useCallback(async () => {
    if (!device) return null;
    return Backend.behaviorScanLight(device.id);
  }, [device]);

  const getAppInstallTime = useCallback(async (pkg) => {
    if (!device || !pkg) return null;
    return Backend.getAppInstallTime(device.id, pkg);
  }, [device]);

  const sendCommand = useCallback(async (cmd) => {
    if (!device) return { error: 'no device' };
    return Backend.sendCommand(device.id, cmd);
  }, [device]);

  // Stub functions to prevent crashes (AppManager references these)
  const getRunningApps = useCallback(async () => {
    if (!device) return [];
    try {
      const result = await Backend.sendCommand(device.id, 'ps -A');
      const lines = (result?.output || '').split('\n').filter(l => l.trim() && !l.includes('PID'));
      const pkgs = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 8) {
          const name = parts[parts.length - 1];
          if (name.includes('.') && !name.startsWith('[')) pkgs.add(name);
        }
      }
      return Array.from(pkgs).map(pkg => ({ pkg, name: pkg.split('.').pop() }));
    } catch { return []; }
  }, [device]);

  const getPackagePermissions = useCallback(async (pkg) => {
    if (!device || !pkg) return null;
    try {
      const result = await Backend.sendCommand(device.id, `dumpsys package ${pkg} | grep -E "android\\.permission\\." | sort -u`);
      const perms = (result?.output || '').split('\n')
        .map(l => { const m = l.match(/(android\.permission\.\S+)/); return m ? m[1] : null; })
        .filter(Boolean);
      return { pkg, permissions: [...new Set(perms)] };
    } catch { return { pkg, permissions: [] }; }
  }, [device]);

  const addProtectedApp = useCallback((p) => setProtectedApps(v => [...new Set([...v, p])]), []);
  const removeProtectedApp = useCallback((p) => setProtectedApps(v => v.filter(x => x !== p)), []);
  const addBrand = useCallback((p) => setBrandDB(v => [...new Set([...v, p])]), []);
  const removeBrand = useCallback((p) => setBrandDB(v => v.filter(x => x !== p)), []);
  const addKeyword = useCallback((p) => setKeywordDB(v => [...new Set([...v, p])]), []);
  const removeKeyword = useCallback((p) => setKeywordDB(v => v.filter(x => x !== p)), []);
  const forceAuthPrompt = useCallback(async () => {
    try { await Backend.quickConnectAdb(); } catch {}
  }, []);

  const value = useMemo(() => ({
    virusDB, protectedApps, brandDB, keywordDB, logs, device, deviceInfo, debugMsg, waitingAuth,
    isAdmin, isGuest,
    refreshDevices: reconnect, disconnectDevice, resetADB, installDriver, reconnectAdb, forceAuthPrompt,
    getFiles, deleteFile, renameFile, copyFile, makeDir, pullFile, pushFile,
    getScreenshot, uninstallApp, getApps, pickApkFile, installAPK, installAPKRemote,
    getCurrentApp, behaviorScan, behaviorScanLight, getAppInstallTime, sendCommand,
    getRunningApps, getPackagePermissions,
    addProtectedApp, removeProtectedApp, addBrand, removeBrand, addKeyword, removeKeyword,
    addLog, isProtected, matchesKeywords,
    exportVirusDat, importVirusDat,
    addVirus, removeVirus, bulkAddVirus,
    setAdminMode, setGuestMode, verifyPassword, hasAdminPassword, changeAdminPassword, resetAdminPassword,
    // GitHub sync
    dbSyncStatus, dbVersion, dbLastSync, dbError, githubToken, githubRole,
    pendingIssues, issuesLoading,
    fetchDbFromGitHub, pushDbToGitHub, reportVirus, fetchPendingIssues,
    approveIssue, rejectIssue, saveGithubConfig,
  }), [virusDB, protectedApps, brandDB, keywordDB, logs, device, deviceInfo, debugMsg, waitingAuth, isManualPaused, isAdmin, forceAuthPrompt,
    dbSyncStatus, dbVersion, dbLastSync, dbError, githubToken, githubRole, pendingIssues, issuesLoading]);

  return <VirusContext.Provider value={value}>{children}</VirusContext.Provider>;
};
export const useVirus = () => useContext(VirusContext);

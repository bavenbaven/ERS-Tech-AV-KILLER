import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useVirus } from '../context/VirusContext';

const API_BASE = 'http://127.0.0.1:3001/api';

// Stable hash color from package name
function hashColor(pkg) {
  let h = 0;
  for (let i = 0; i < pkg.length; i++) h = pkg.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 65%, 55%)`;
}

// Dangerous permissions for static analysis display
const DANGEROUS_PERM_LIST = [
  'android.permission.READ_SMS','android.permission.RECEIVE_SMS','android.permission.SEND_SMS',
  'android.permission.READ_CONTACTS','android.permission.WRITE_CONTACTS',
  'android.permission.READ_CALL_LOG','android.permission.WRITE_CALL_LOG',
  'android.permission.CAMERA','android.permission.RECORD_AUDIO',
  'android.permission.READ_PHONE_STATE','android.permission.CALL_PHONE',
  'android.permission.ANSWER_PHONE_CALLS',
  'android.permission.READ_EXTERNAL_STORAGE','android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.ACCESS_FINE_LOCATION','android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.BIND_ACCESSIBILITY_SERVICE','android.permission.BIND_DEVICE_ADMIN',
  'android.permission.SYSTEM_ALERT_WINDOW','android.permission.WRITE_SETTINGS',
  'android.permission.REQUEST_INSTALL_PACKAGES','android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.PROCESS_OUTGOING_CALLS','android.permission.BODY_SENSORS',
];

// Cache of checked icons to avoid repeated requests
const iconCache = {};

// AppIcon: lazy loads real icon, falls back to letter
const AppIcon = React.memo(({ deviceId, pkg, name, isVirus }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isVirus || !deviceId || !pkg) return;
    // Check cache first
    const key = `${deviceId}:${pkg}`;
    if (iconCache[key] === true) { setLoaded(true); return; }
    if (iconCache[key] === false) { setFailed(true); return; }

    const img = new Image();
    img.onload = () => { iconCache[key] = true; setLoaded(true); };
    img.onerror = () => { iconCache[key] = false; setFailed(true); };
    img.src = `${API_BASE}/app-icon/${deviceId}/${pkg}`;
  }, [deviceId, pkg, isVirus]);

  if (isVirus) return <div style={{ width: '48px', height: '48px', flexShrink: 0, background: 'linear-gradient(135deg, #ef4444, #991b1b)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>💀</div>;
  if (loaded) return <img src={`${API_BASE}/app-icon/${deviceId}/${pkg}`} alt="" style={{ width: '48px', height: '48px', flexShrink: 0, borderRadius: '12px', objectFit: 'contain', background: 'rgba(255,255,255,0.05)' }} />;
  return <div style={{ width: '48px', height: '48px', flexShrink: 0, background: `linear-gradient(135deg, ${hashColor(pkg)}, #1e1b4b)`, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: 'white', fontWeight: 'bold', letterSpacing: '1px' }}>{name}</div>;
});

const Toast = ({ message, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const bg = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'info' ? '#3b82f6' : '#f59e0b';
  return <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 99999, background: bg, color: '#fff', padding: '14px 24px', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)', maxWidth: '400px', animation: 'slideIn 0.3s ease', fontSize: '14px', fontWeight: '600' }}>{message}</div>;
};

const BehaviorResultRow = React.memo(({ r, isSel, isV, isFore, isSelected, isProtected, onSelect, onToggleCapture, onOpenStatic }) => {
  return (
    <div className={`capture-row ${isSelected ? 'capture-row-selected' : ''} ${isFore ? 'capture-row-fore' : ''} ${r.risk === 'high' ? 'capture-row-high' : r.risk === 'medium' ? 'capture-row-med' : ''}`}
      onClick={() => onSelect(r)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div onClick={e => { e.stopPropagation(); onToggleCapture(r.pkg); }} style={{ width: '14px', height: '14px', borderRadius: '3px', border: `2px solid ${r.risk === 'high' ? '#ef4444' : r.risk === 'medium' ? '#f59e0b' : 'var(--border)'}`, background: isSel ? '#3b82f6' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#fff', flexShrink: 0, cursor: 'pointer' }}>{isSel ? '✓' : ''}</div>
        <span style={{ flex: 1, fontWeight: '700', fontSize: '12px', color: isFore ? '#10b981' : r.risk === 'high' ? '#ef4444' : r.risk === 'medium' ? '#f59e0b' : 'var(--text-main)', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {r.pkg}
          {isProtected ? <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(139,92,246,0.2)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)', fontWeight: '600' }}>🛡️ 系统</span> : <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', fontWeight: '600' }}>👤 用户</span>}
          {isV && ' 💀'}
          {isFore && <span style={{ background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '800', border: '1px solid #10b981', boxShadow: '0 0 10px rgba(16,185,129,0.5)', animation: 'pulse 1s infinite' }}>👁️ 当前屏幕前台</span>}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: r.risk === 'high' ? 'rgba(239,68,68,0.2)' : r.risk === 'medium' ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)', color: r.risk === 'high' ? '#ef4444' : r.risk === 'medium' ? '#f59e0b' : 'var(--text-muted)', fontWeight: '600' }}>
            {r.risk === 'high' ? '🔴' : r.risk === 'medium' ? '🟡' : '⚪'} {r.score}
          </span>
          <button onClick={e => { e.stopPropagation(); onOpenStatic(r.pkg); }} style={{ background: 'transparent', border: 'none', color: 'var(--neon-cyan)', fontSize: '10px', cursor: 'pointer', padding: '2px 4px', borderRadius: '3px' }} title="查看权限分析">🔍</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', paddingLeft: '22px' }}>
        {(r.signals||[]).map((s, j) => (
          <span key={j} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', fontWeight: '600',
            background: s.type === '前台' ? 'rgba(16,185,129,0.2)' : s.severity >= 3 ? 'rgba(239,68,68,0.12)' : s.severity >= 2 ? 'rgba(245,158,11,0.1)' : s.severity >= 1 ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.04)',
            color: s.type === '前台' ? '#10b981' : s.severity >= 3 ? '#ef4444' : s.severity >= 2 ? '#f59e0b' : s.severity >= 1 ? '#8b5cf6' : 'var(--text-muted)',
            border: s.type === '前台' ? '1px solid rgba(16,185,129,0.4)' : 'none' }}>
            {s.type === '前台' ? '🟢 ' + s.type : s.type}
          </span>
        ))}
      </div>
    </div>
  );
});

const AppManager = () => {
  const { virusDB, addVirus, removeVirus, bulkAddVirus, addLog, isProtected, device, getApps, uninstallApp, pickApkFile, installAPK, getRunningApps, behaviorScan, behaviorScanLight, getPackagePermissions, isAdmin } = useVirus();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApps, setSelectedApps] = useState([]);
  const [deviceApps, setDeviceApps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('user');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [toast, setToast] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureSelected, setCaptureSelected] = useState([]);
  const [manualVirusPkg, setManualVirusPkg] = useState('');
  const [isRunningPanel, setIsRunningPanel] = useState(false);
  const [runningApps, setRunningApps] = useState([]);
  const [runningSelected, setRunningSelected] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [behaviorFilter, setBehaviorFilter] = useState('all');
  const [installStatus, setInstallStatus] = useState(null); // null | 'selecting' | 'installing' | 'success' | 'error'
  const [installMsg, setInstallMsg] = useState('');
  const [staticAnalysisPkg, setStaticAnalysisPkg] = useState(null);
  const [staticData, setStaticData] = useState(null);
  const [staticLoading, setStaticLoading] = useState(false);
  const [selectedAppDetail, setSelectedAppDetail] = useState(null);
  const captureInterval = useRef(null);
  const fileInputRef = useRef(null);

  const detailLogRef = useRef(null);
  const showToast = (message, type = 'info') => setToast({ message, type, key: Date.now() });

  const fetchRealApps = async () => {
    if (!device) return;
    setLoading(true);
    try {
      const pkgs = await getApps();
      const unique = [...new Set(pkgs)];
      setDeviceApps(unique.map(pkg => ({ name: pkg.split('.').pop(), pkg })));
    } catch (e) { showToast('读取应用列表失败', 'error'); }
    setLoading(false);
  };

  useEffect(() => { device ? fetchRealApps() : (setDeviceApps([]), setSelectedApps([])); }, [device]);

  // Stop behavior monitoring when device disconnects
  useEffect(() => {
    if (!device && isCapturing) { stopCapture(); showToast('设备断开，监控已停止', 'info'); }
  }, [device]);

  const handleToggleSelect = (e, pkg) => { e.stopPropagation(); if (isProtected(pkg)) return; setSelectedApps(prev => prev.includes(pkg) ? prev.filter(p => p !== pkg) : [...prev, pkg]); };

  const executeDelete = async (pkgsToDelete) => {
    setLoading(true);
    let count = 0, failed = [];
    for (const pkg of pkgsToDelete) {
      try {
        const result = await uninstallApp(pkg);
        if (result.success) { count++; addLog({ time: new Date().toLocaleString(), name: pkg.split('.').pop(), pkg, status: '成功' }); }
        else failed.push(pkg.split('.').pop());
      } catch (e) { failed.push(pkg.split('.').pop()); }
    }
    setLoading(false); setSelectedApps([]); setConfirmDialog(null); fetchRealApps();
    showToast(failed.length > 0 ? `成功 ${count}，失败 ${failed.length}` : `成功删除 ${count} 个应用`, count > 0 ? 'success' : 'error');
  };

  const handleDelete = (pkgs = selectedApps) => {
    if (!pkgs.length) return;
    setConfirmDialog({ title: '确认删除', message: `确定要删除这 ${pkgs.length} 个应用吗？`, onConfirm: () => executeDelete(pkgs), onCancel: () => setConfirmDialog(null) });
  };
  const handleDeleteSingle = (e, pkg) => { e.stopPropagation(); setConfirmDialog({ title: '确认删除', message: `确定要删除「${pkg}」吗？`, onConfirm: () => executeDelete([pkg]), onCancel: () => setConfirmDialog(null) }); };
  const handleDeleteAllUser = () => handleDelete(deviceApps.filter(a => !isProtected(a.pkg) && !virusDB.includes(a.pkg)).map(a => a.pkg));

  const handleInstallAPK = async () => {
    setInstallStatus('selecting');
    setInstallMsg('请选择 APK 文件...');
    setLoading(true);
    
    // Force React to render the "selecting" UI before the blocking native dialog opens
    await new Promise(r => setTimeout(r, 100));
    
    try {
      const apkPath = await pickApkFile();
      if (!apkPath) {
        setInstallStatus(null);
        setLoading(false);
        return;
      }
      
      setInstallStatus('installing');
      setInstallMsg('正在安装，请稍候...');
      
      const authPromptTimer = setTimeout(() => {
        setInstallMsg('⚠️ 请留意手机屏幕！安全软件可能已拦截，需要您手动点击「继续安装」');
      }, 2500);
      
      // Force React to render the "installing" UI before the blocking ADB command runs
      await new Promise(r => setTimeout(r, 150));
      
      const r = await installAPK(apkPath);
      clearTimeout(authPromptTimer);
      
      if (r.success) {
        setInstallStatus('success');
        setInstallMsg('✅ APK 安装成功！');
        fetchRealApps();
      } else {
        setInstallStatus('error');
        setInstallMsg('❌ 安装失败: ' + (r.error || r.result || '未知错误'));
      }
    } catch (e) {
      setInstallStatus('error');
      setInstallMsg('❌ 安装失败: ' + e);
    }
    setLoading(false);
    setTimeout(() => setInstallStatus(null), 3000);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setLoading(true); showToast('正在安装 APK...', 'info');
    try { const r = await installAPK(file); r.success ? (showToast('安装成功！', 'success'), fetchRealApps()) : showToast('安装失败: ' + (r.error || ''), 'error'); }
    catch (e) { showToast('安装失败: 网络错误', 'error'); }
    setLoading(false); e.target.value = '';
  };

  // ========== 行为监控 ==========
  const [behaviorResults, setBehaviorResults] = useState(null);
  const [behaviorTimeline, setBehaviorTimeline] = useState([]);
  const [behaviorSummary, setBehaviorSummary] = useState(null);

  const captureTimer = useRef(null);
  const isScanningRef = useRef(false);

  const startCapture = async () => {
    setIsCapturing(true);
    setBehaviorResults(null);
    setBehaviorTimeline([]);
    setBehaviorSummary(null);
    setCaptureSelected([]);
    showToast('行为监控已启动', 'info');

    // 第一次立即扫描
    try {
      const scan = await behaviorScan();
      if (scan) {
        setBehaviorResults(scan.results || []);
        setBehaviorSummary(scan.summary || null);
        setBehaviorTimeline(prev => {
          const events = (scan.results || []).map(r => ({
            pkg: r.pkg,
            risk: r.risk,
            score: r.score,
            signals: r.signals,
            time: new Date().toLocaleTimeString(),
            id: Date.now() + Math.random()
          }));
          return [...events, ...prev].slice(0, 200);
        });
      }
    } catch (e) {}

    const runScanLoop = async () => {
      if (!isScanningRef.current && device) {
        isScanningRef.current = true;
        try {
          const scan = await behaviorScanLight();
          if (scan) {
            const now = new Date().toLocaleTimeString();
            setBehaviorResults(scan.results || []);
            setBehaviorSummary(scan.summary || null);

            const newEvents = (scan.results || []).filter(r => r.risk !== 'low').map(r => ({
              pkg: r.pkg, risk: r.risk, score: r.score, signals: r.signals,
              time: now, id: Date.now() + Math.random()
            }));
            if (newEvents.length > 0) {
              setBehaviorTimeline(prev => [...newEvents, ...prev].slice(0, 200));
            }
          }
        } catch (e) {
          console.error('Scan loop error:', e);
        } finally {
          isScanningRef.current = false;
        }
      }
      
      if (captureTimer.current !== 'stopped') {
        captureTimer.current = setTimeout(runScanLoop, 6000);
      }
    };
    
    captureTimer.current = setTimeout(runScanLoop, 3000);
  };

  const stopCapture = () => { 
    setIsCapturing(false); 
    if (captureTimer.current) {
      clearTimeout(captureTimer.current);
      captureTimer.current = 'stopped';
    }
  };

  const toggleCaptureSelect = (pkg) => setCaptureSelected(prev => prev.includes(pkg) ? prev.filter(p => p !== pkg) : [...prev, pkg]);

  const markSelectedAsVirus = () => {
    if (!isAdmin) { showToast('需要管理员权限才能修改病毒库', 'error'); return; }
    const pkgs = captureSelected.length ? captureSelected : (behaviorResults || []).filter(r => r.risk === 'high').map(r => r.pkg);
    if (!pkgs.length) { showToast('请先勾选要标记的应用', 'error'); return; }
    pkgs.forEach(p => addVirus(p));
    showToast(`已将 ${pkgs.length} 个应用标记为病毒`, 'success');
    setCaptureSelected([]); fetchRealApps();
  };

  const unmarkSelected = () => {
    const pkgs = captureSelected.length ? captureSelected : [];
    if (!pkgs.length) { showToast('请先勾选要取消标记的应用', 'error'); return; }
    pkgs.forEach(p => removeVirus(p));
    showToast(`已取消 ${pkgs.length} 个应用的病毒标记`, 'success');
    setCaptureSelected([]);
  };

  const addManualVirus = () => {
    if (!isAdmin) { showToast('需要管理员权限才能修改病毒库', 'error'); return; }
    const pkg = manualVirusPkg.trim();
    if (!pkg) { showToast('请输入包名', 'error'); return; }
    if (virusDB.includes(pkg)) { showToast(`跳过: 「${pkg}」已在病毒库中`, 'info'); return; }
    addVirus(pkg);
    setManualVirusPkg('');
    showToast(`✅ 添加成功! 已将「${pkg}」加入病毒库 (共 ${virusDB.length + 1} 条)`, 'success');
  };

  const virusFileRef = useRef(null);
  const handleBulkVirusImport = (e) => {
    if (!isAdmin) { showToast('需要管理员权限才能修改病毒库', 'error'); return; }
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const lines = evt.target.result.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && l.includes('.'));
      const uniqueLines = [...new Set(lines)];
      const beforeCount = virusDB.length;
      const added = bulkAddVirus(uniqueLines);
      showToast(`✅ 导入完成! 处理 ${uniqueLines.length} 条记录`, 'success');
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const uninstallCapturedPkgs = async () => {
    if (!captureSelected.length) { showToast('请先勾选要卸载的应用', 'error'); return; }
    setLoading(true);
    let count = 0;
    for (const pkg of captureSelected) {
      try { const r = await uninstallApp(pkg); if (r.success) { count++; addLog({ time: new Date().toLocaleString(), name: pkg.split('.').pop(), pkg, status: '成功' }); } } catch (e) {}
    }
    setLoading(false); showToast(`成功卸载 ${count}/${captureSelected.length}`, count > 0 ? 'success' : 'error');
    setCaptureSelected([]); fetchRealApps();
  };

  // ========== Running Apps ==========
  const openRunningPanel = async () => {
    setIsRunningPanel(true); setRunningSelected([]); setRunningApps([]);
    try { setRunningApps(await getRunningApps()); } catch (e) { showToast('读取失败', 'error'); }
  };
  const toggleRunningSelect = (pkg) => setRunningSelected(prev => prev.includes(pkg) ? prev.filter(p => p !== pkg) : [...prev, pkg]);

  const uninstallRunningPkgs = async () => {
    if (!runningSelected.length) return;
    let count = 0;
    for (const pkg of runningSelected) {
      try { const r = await uninstallApp(pkg); if (r.success) { count++; addLog({ time: new Date().toLocaleString(), name: pkg.split('.').pop(), pkg, status: '成功' }); } } catch (e) {}
    }
    showToast(`成功卸载 ${count}/${runningSelected.length}`, count > 0 ? 'success' : 'error');
    setRunningSelected([]); fetchRealApps();
  };

  // ========== Virus Scan (uses keywordDB too) ==========
  const startVirusScan = async () => {
    if (!deviceApps.length) { showToast('请先加载应用列表', 'error'); return; }
    setIsScanning(true); setScanResult(null);
    showToast('正在扫描病毒库...', 'info');
    await new Promise(r => setTimeout(r, 800));
    const found = deviceApps.filter(app => virusDB.includes(app.pkg));
    setScanResult({ found, total: deviceApps.length, virusCount: virusDB.length });
    setIsScanning(false);
    showToast(found.length > 0 ? `发现 ${found.length} 个威胁` : '扫描完成，未发现病毒', found.length > 0 ? 'error' : 'success');
  };

  // ========== Static Analysis ==========
  const openStaticAnalysis = async (pkg) => {
    setStaticAnalysisPkg(pkg);
    setStaticData(null);
    setStaticLoading(true);
    try {
      const data = await getPackagePermissions(pkg);
      setStaticData(data);
    } catch (e) { showToast('读取权限信息失败', 'error'); }
    setStaticLoading(false);
  };

  // ========== Export Report ==========
  const exportReport = () => {
    if (!behaviorResults?.length) return;
    const lines = ['=== 安卓病毒广告捕获分析报告 ===', `生成时间: ${new Date().toLocaleString()}`, ''];
    lines.push(`--- 摘要 ---`);
    lines.push(`活跃应用: ${behaviorSummary?.totalApps || 0}`);
    lines.push(`高危: ${behaviorSummary?.suspiciousCount || 0} 个`);
    lines.push(`叠加层: ${behaviorSummary?.overlayCount || 0}`);
    lines.push(`通知: ${behaviorSummary?.notificationCount || 0}`);
    lines.push('');
    lines.push('--- 高危应用详情 ---');
    for (const r of behaviorResults.filter(x => x.risk !== 'low')) {
      lines.push(`[${r.risk === 'high' ? '高危' : '中危'}] ${r.pkg} (评分: ${r.score})`);
      if (r.signals) for (const s of r.signals) lines.push(`  - ${s.type}: ${s.detail}`);
      lines.push('');
    }
    lines.push('--- 行为时间线 ---');
    for (const e of behaviorTimeline) {
      lines.push(`${e.time} | ${e.pkg} | ${e.risk === 'high' ? '高危' : '中危'}`);
      if (e.signals) for (const s of e.signals) lines.push(`  ${s.type}: ${s.detail}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `analysis_report_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click(); URL.revokeObjectURL(url);
    showToast('报告已导出', 'success');
  };

  const deleteAllViruses = async () => {
    if (!scanResult?.found?.length) return;
    let count = 0;
    for (const app of scanResult.found) {
      try { const r = await uninstallApp(app.pkg); if (r.success) { count++; addLog({ time: new Date().toLocaleString(), name: app.name, pkg: app.pkg, status: '成功' }); } } catch (e) {}
    }
    showToast(`成功删除 ${count} 个病毒应用`, count > 0 ? 'success' : 'error');
    setScanResult(null); fetchRealApps();
  };

  // ========== Filter ==========
  // 计算每个标签页的数量（独立过滤，不依赖 activeTab）
  const tabCounts = {
    user: deviceApps.filter(a => !isProtected(a.pkg) && !virusDB.includes(a.pkg)).length,
    system: deviceApps.filter(a => isProtected(a.pkg)).length,
    virus: deviceApps.filter(a => virusDB.includes(a.pkg)).length,
  };

  const categorizedApps = useMemo(() => deviceApps.filter(app => {
    const m = app.name.toLowerCase().includes(searchTerm.toLowerCase()) || app.pkg.toLowerCase().includes(searchTerm.toLowerCase());
    if (!m) return false;
    if (activeTab === 'virus') return virusDB.includes(app.pkg);
    if (activeTab === 'system') return isProtected(app.pkg);
    if (activeTab === 'user') return !isProtected(app.pkg) && !virusDB.includes(app.pkg);
    return true;
  }), [deviceApps, searchTerm, activeTab, virusDB, isProtected]);

  const memoizedBehaviorResults = useMemo(() => {
    if (!behaviorResults?.length) return [];
    return behaviorResults.filter(r => {
      if (behaviorFilter === 'all') return true;
      if (behaviorFilter === 'high') return r.risk === 'high';
      if (behaviorFilter === 'medium') return r.risk === 'medium';
      if (behaviorFilter === 'privacy') return (r.signals||[]).some(s => s.category === 'privacy');
      if (behaviorFilter === 'ads') return (r.signals||[]).some(s => s.category === 'ads');
      if (behaviorFilter === 'system') return (r.signals||[]).some(s => s.category === 'system');
      return true;
    }).sort((a, b) => {
      const aFore = (a.signals||[]).some(s => s.type === '前台');
      const bFore = (b.signals||[]).some(s => s.type === '前台');
      if (aFore && !bFore) return -1;
      if (!aFore && bFore) return 1;
      return b.score - a.score;
    });
  }, [behaviorResults, behaviorFilter]);

  return (
    <div style={{ animation: 'fadeIn 0.5s ease' }}>
      {toast && <Toast key={toast.key} message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* APK Install Progress Overlay */}
      {installStatus && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s ease' }}
          onClick={() => { if (installStatus === 'success' || installStatus === 'error') setInstallStatus(null); }}>
          <div className="glass-card" style={{ padding: '40px 50px', textAlign: 'center', border: `1px solid ${installStatus === 'success' ? 'var(--neon-green)' : installStatus === 'error' ? 'var(--accent-danger)' : 'var(--neon-cyan)'}`, minWidth: '360px', animation: 'dialogCardIn 0.3s ease' }}>
            {installStatus === 'selecting' && (
              <>
                <div style={{ fontSize: '50px', marginBottom: '16px' }}>📂</div>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-main)' }}>{installMsg}</p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>将打开文件选择窗口</p>
              </>
            )}
            {installStatus === 'installing' && (
              <>
                <div style={{ width: '50px', height: '50px', border: '4px solid var(--border)', borderTop: '4px solid var(--neon-cyan)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
                <p style={{ fontSize: '16px', fontWeight: '600', color: installMsg.includes('⚠️') ? '#f59e0b' : 'var(--neon-cyan)', transition: 'color 0.3s ease' }}>{installMsg}</p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>请勿断开设备连接</p>
              </>
            )}
            {installStatus === 'success' && (
              <>
                <div style={{ fontSize: '60px', marginBottom: '16px', animation: 'fadeIn 0.3s ease' }}>🎉</div>
                <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--neon-green)' }}>{installMsg}</p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '10px' }}>应用列表将自动刷新</p>
              </>
            )}
            {installStatus === 'error' && (
              <>
                <div style={{ fontSize: '60px', marginBottom: '16px', animation: 'fadeIn 0.3s ease' }}>😥</div>
                <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--accent-danger)', lineHeight: '1.5' }}>{installMsg}</p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '10px' }}>请检查 APK 文件是否完整，或尝试重新安装</p>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {confirmDialog && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card" style={{ width: '420px', padding: '35px', textAlign: 'center', border: '1px solid var(--accent-danger)' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>⚠️</div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px' }}>{confirmDialog.title}</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '30px', fontSize: '14px', lineHeight: '1.6' }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn btn-outline" style={{ padding: '12px 30px' }} onClick={confirmDialog.onCancel}>取消</button>
              <button className="btn btn-danger" style={{ padding: '12px 30px' }} onClick={confirmDialog.onConfirm}>确认</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Tabs + Search in one row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
        {['user', 'system', 'virus'].map(tab => (
          <div key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: '700', fontSize: '16px', color: activeTab === tab ? 'var(--neon-cyan)' : 'var(--text-muted)', borderBottom: activeTab === tab ? '3px solid var(--neon-cyan)' : '3px solid transparent', transition: 'all 0.3s', whiteSpace: 'nowrap' }}>
            {tab === 'user' ? '👤 用户软件' : tab === 'system' ? '⚙️ 系统软件' : '💀 致命病毒'}
            <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.5 }}>({tabCounts[tab] || 0})</span>
          </div>
        ))}
        <div style={{ position: 'relative', flex: 1, marginLeft: '10px' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
          <input type="text" placeholder="搜索应用名称或包名..." style={{ width: '100%', padding: '8px 12px 8px 36px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '13px', outline: 'none' }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={fetchRealApps} disabled={!device || loading} style={{ background: 'var(--accent-secondary)', padding: '8px 14px', fontSize: '12px' }}>{loading ? '读取中...' : '🔄 刷新'}</button>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '25px' }}>
        <button className="btn btn-primary" style={{ background: '#f59e0b' }} onClick={startCapture}>📡 广告捕获模式</button>
                        <button className="btn btn-primary" style={{ background: '#ef4444' }} onClick={startVirusScan} disabled={isScanning}>🔬 扫描病毒</button>
        <button className="btn btn-primary" style={{ background: '#10b981' }} onClick={handleInstallAPK} disabled={!!installStatus || loading}>➕ 安装 APK</button>
        <input type="file" ref={fileInputRef} hidden accept=".apk" onChange={handleFileUpload} />
        <button className="btn btn-danger" onClick={handleDelete} disabled={!selectedApps.length || loading}>🗑️ 删除选定 ({selectedApps.length})</button>
        {activeTab === 'user' && <button className="btn btn-danger" style={{ background: '#991b1b' }} onClick={handleDeleteAllUser} disabled={loading}>💣 删除所有用户软件</button>}
      </div>

      {/* Apps Grid */}
      {loading && !deviceApps.length ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}><div style={{ fontSize: '40px', marginBottom: '15px' }}>⏳</div><p>正在读取手机应用列表...</p></div>
      ) : (
        (() => {
          const virusKeywords = ['cleaner','booster','antivirus','security','shield','virus','malware','scan','optimizer','speed','battery','ram','cache','phone.clean','file.explorer','ads','spam','tracker','stealer','trojan','spy','hack'];
          const usedPkgs = new Set();

          // Group 1: Virus matches
          const virusApps = categorizedApps.filter(app => {
            if (virusDB.includes(app.pkg)) { usedPkgs.add(app.pkg); return true; }
            return false;
          });

          // Group 2: Suspect (keyword match, not already in virus group)
          const suspectApps = categorizedApps.filter(app => {
            if (usedPkgs.has(app.pkg)) return false;
            const lower = app.pkg.toLowerCase();
            const nameLower = app.name.toLowerCase();
            if (virusKeywords.some(kw => lower.includes(kw) || nameLower.includes(kw))) { usedPkgs.add(app.pkg); return true; }
            return false;
          });

          // Group 3: Everything else
          const normalApps = categorizedApps.filter(app => !usedPkgs.has(app.pkg));

          return (
            <>
              {virusApps.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '8px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <span style={{ fontSize: '16px' }}>💀</span>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#ef4444' }}>病毒库匹配 ({virusApps.length})</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                    {virusApps.map(app => (
                      <div key={app.pkg} className="app-card" onClick={e => handleToggleSelect(e, app.pkg)}
                        style={{ background: 'rgba(239,68,68,0.06)', border: '2px solid #ef4444', borderRadius: '10px', padding: '12px 14px', cursor: 'pointer', transition: 'all 0.3s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '42px', height: '42px', flexShrink: 0, background: 'linear-gradient(135deg, #ef4444, #991b1b)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>💀</div>
                          <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                            <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '2px', wordBreak: 'break-all', lineHeight: '1.3', color: '#ef4444' }}>{app.name}</h4>
                            <p style={{ fontSize: '10px', color: 'rgba(239,68,68,0.7)', wordBreak: 'break-all', fontFamily: 'monospace' }}>{app.pkg}</p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            <div onClick={e => handleToggleSelect(e, app.pkg)} style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid #ef4444', background: selectedApps.includes(app.pkg) ? '#ef4444' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', cursor: 'pointer' }}>{selectedApps.includes(app.pkg) && '✓'}</div>
                            <button onClick={e => { e.stopPropagation(); removeVirus(app.pkg); showToast(`已取消「${app.name}」的病毒标记`, 'success'); }} style={{ background: 'rgba(16,185,129,0.2)', border: 'none', color: '#10b981', fontSize: '14px', cursor: 'pointer', padding: '4px 6px', borderRadius: '4px' }} title="取消病毒标记">✅</button>
                            <button onClick={e => handleDeleteSingle(e, app.pkg)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '16px', cursor: 'pointer', padding: '4px' }}>🗑️</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {suspectApps.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '8px 14px', background: 'rgba(245,158,11,0.08)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#f59e0b' }}>疑似风险应用 ({suspectApps.length})</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>— 包名含病毒库常见关键词</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                    {suspectApps.map(app => (
                      <div key={app.pkg} className="app-card" onClick={e => handleToggleSelect(e, app.pkg)}
                        style={{ background: 'rgba(245,158,11,0.04)', border: '1.5px solid rgba(245,158,11,0.4)', borderRadius: '10px', padding: '12px 14px', cursor: 'pointer', transition: 'all 0.3s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <AppIcon deviceId={device?.id} pkg={app.pkg} name={app.name.charAt(0)} isVirus={false} />
                          <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                            <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '2px', wordBreak: 'break-all', lineHeight: '1.3', color: '#f59e0b' }}>{app.name}</h4>
                            <p style={{ fontSize: '10px', color: 'rgba(245,158,11,0.7)', wordBreak: 'break-all', fontFamily: 'monospace' }}>{app.pkg}</p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            <div onClick={e => handleToggleSelect(e, app.pkg)} style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid rgba(245,158,11,0.4)', background: selectedApps.includes(app.pkg) ? '#f59e0b' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', cursor: 'pointer' }}>{selectedApps.includes(app.pkg) && '✓'}</div>
                            <button onClick={e => handleDeleteSingle(e, app.pkg)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '16px', cursor: 'pointer', padding: '4px' }}>🗑️</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                {normalApps.map(app => {
                  const protectedApp = isProtected(app.pkg);
                  const isSelected = selectedApps.includes(app.pkg);
                  return (
                    <div key={app.pkg} className="app-card" onClick={e => handleToggleSelect(e, app.pkg)}
                      style={{ background: isSelected ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)', border: isSelected ? '2px solid var(--neon-cyan)' : '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', cursor: protectedApp ? 'not-allowed' : 'pointer', transition: 'all 0.3s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <AppIcon deviceId={device?.id} pkg={app.pkg} name={app.name.charAt(0)} isVirus={false} />
                        <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                          <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '2px', wordBreak: 'break-all', lineHeight: '1.3' }}>{app.name}</h4>
                          <p style={{ fontSize: '10px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{app.pkg}</p>
                        </div>
                        {!protectedApp ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            <div onClick={e => handleToggleSelect(e, app.pkg)} style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid var(--border)', background: isSelected ? 'var(--neon-cyan)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', cursor: 'pointer' }}>{isSelected && '✓'}</div>
                            <button onClick={e => handleDeleteSingle(e, app.pkg)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '16px', cursor: 'pointer', padding: '4px' }}>🗑️</button>
                          </div>
                        ) : <span style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '6px', flexShrink: 0, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' }}>🛡️ 系统</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()
      )}

      {isCapturing && createPortal(
        <div className="capture-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.96)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card" style={{ width: '95vw', maxWidth: '1600px', height: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #f59e0b' }}>
            {/* Header - Realtime Dashboard */}
            <div style={{ padding: '16px 25px', borderBottom: '1px solid var(--border)', background: 'rgba(245,158,11,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: '800', fontFamily: "'Orbitron', monospace", color: '#f59e0b' }}>📡 深度行为分析</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16,185,129,0.1)', padding: '4px 12px', borderRadius: '20px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', animation: 'pulse 1s infinite' }} />
                    <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '600', fontFamily: "'Rajdhani', sans-serif" }}>实时监控中</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={exportReport}>📥 导出报告</button>
                  <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={() => { setBehaviorTimeline([]); setBehaviorResults(null); setBehaviorSummary(null); setCaptureSelected([]); showToast('已重置', 'success'); }}>🔄 重置</button>
                  <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '12px', color: '#ef4444', borderColor: '#ef4444' }} onClick={stopCapture}>⏹ 停止</button>
                </div>
              </div>
              {/* Stats Row + Filter */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '4px 10px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', marginRight: '4px' }}>过滤:</span>
                  {[
                    { key: 'all', label: '全部' },
                    { key: 'high', label: '🔴 高危' },
                    { key: 'medium', label: '🟡 中危' },
                    { key: 'privacy', label: '🔒 隐私' },
                    { key: 'ads', label: '📢 广告' },
                    { key: 'system', label: '⚙️ 系统' },
                  ].map(f => (
                    <button key={f.key} onClick={() => setBehaviorFilter(f.key)}
                      style={{ padding: '3px 10px', borderRadius: '5px', border: behaviorFilter === f.key ? '1px solid var(--neon-cyan)' : '1px solid transparent', background: behaviorFilter === f.key ? 'rgba(0,240,255,0.12)' : 'transparent', color: behaviorFilter === f.key ? 'var(--neon-cyan)' : 'var(--text-muted)', fontSize: '11px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s', lineHeight: '1.4' }}>
                      {f.label}
                    </button>
                  ))}
                </div>
                {[
                  { label: '高危', value: behaviorSummary?.suspiciousCount || 0, color: '#ef4444' },
                  { label: '叠加层', value: behaviorSummary?.overlayCount || 0, color: '#f59e0b' },
                  { label: '通知', value: behaviorSummary?.notificationCount || 0, color: '#8b5cf6' },
                  { label: '隐私访问', value: behaviorSummary?.totalSensitiveAPIs || 0, color: '#ec4899' },
                  { label: '网络事件', value: behaviorSummary?.totalNetworkEvents || 0, color: '#06b6d4' },
                  { label: 'TCP连接', value: behaviorSummary?.tcpConnections || 0, color: '#14b8a6' },
                ].map((s, i) => (
                  <div key={i} style={{ padding: '6px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: `1px solid ${s.color}22`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.label}</span>
                    <span style={{ fontSize: '16px', fontWeight: '800', color: s.color, fontFamily: "'Orbitron', monospace" }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Bar */}
            <div style={{ padding: '8px 25px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="action-btn" style={{ border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }} onClick={() => { const pkgs = (behaviorResults || []).filter(r => !isProtected(r.pkg)).map(r => r.pkg); setCaptureSelected(pkgs); showToast(`已选中 ${pkgs.length} 个后台程序`, 'info'); }}>全选后台程序</button>
                <button className="action-btn" style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b' }} onClick={markSelectedAsVirus} disabled={!captureSelected.length && !(behaviorResults || []).filter(r => r.risk === 'high').length}>标记为病毒 ({captureSelected.length || (behaviorResults || []).filter(r => r.risk === 'high').length})</button>
                <button className="action-btn" style={{ border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }} onClick={unmarkSelected} disabled={!captureSelected.length}>取消标记 ({captureSelected.length})</button>
                <button className="action-btn" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }} onClick={uninstallCapturedPkgs} disabled={!captureSelected.length}>卸载 ({captureSelected.length})</button>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <input type="text" placeholder="输入包名回车添加" value={manualVirusPkg} onChange={e => setManualVirusPkg(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addManualVirus(); }}
                    style={{ padding: '6px 10px', paddingRight: '30px', fontSize: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-main)', width: '170px', outline: 'none', height: '32px' }} />
                  <button onClick={addManualVirus} style={{ position: 'absolute', right: '2px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--neon-green)', fontSize: '16px', cursor: 'pointer', padding: '2px 6px', lineHeight: '1' }} title="添加到病毒库">➕</button>
                </div>
                <input type="file" ref={virusFileRef} hidden accept=".txt" onChange={handleBulkVirusImport} />
                <button onClick={() => virusFileRef.current.click()} className="action-btn" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#8b5cf6' }}>📄 导入TXT</button>
              </div>
            </div>

            {/* 3-Panel Layout */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
              {/* Left: Behavior Results (filterable) */}
              <div style={{ width: '40%', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', fontSize: '13px', color: 'var(--text-muted)', fontWeight: '700', fontFamily: "'Orbitron', monospace", letterSpacing: '1px', display: 'flex', justifyContent: 'space-between' }}>
                   <span>🔍 所有后台运行程序</span>
                  <span style={{ fontSize: '11px', fontWeight: '400' }}>
                    {behaviorFilter === 'high' ? `${(behaviorResults||[]).filter(r=>r.risk==='high').length} 高危` :
                     behaviorFilter === 'medium' ? `${(behaviorResults||[]).filter(r=>r.risk==='medium').length} 中危` :
                     `${(behaviorResults||[]).length} 总计`}
                  </span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {!behaviorResults?.length && <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}><p style={{ fontSize: '14px' }}>正在分析手机行为...</p></div>}
                  {memoizedBehaviorResults.map((r, i) => {
                    const isV = virusDB.includes(r.pkg);
                    const isSel = captureSelected.includes(r.pkg);
                    const isFore = (r.signals||[]).some(s => s.type === '前台');
                    const isSelected = selectedAppDetail?.pkg === r.pkg;
                    return (
                      <BehaviorResultRow key={i} r={r} isSel={isSel} isV={isV} isFore={isFore} isSelected={isSelected} isProtected={isProtected(r.pkg)}
                        onSelect={setSelectedAppDetail} onToggleCapture={toggleCaptureSelect} onOpenStatic={openStaticAnalysis} />
                    );
                  })}
                </div>
              </div>

              {/* Center: Behavior Detail View - Terminal Style */}
              <div style={{ width: '35%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)' }}>
                {selectedAppDetail ? (
                  <>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: selectedAppDetail.risk === 'high' ? 'rgba(239,68,68,0.04)' : selectedAppDetail.risk === 'medium' ? 'rgba(245,158,11,0.03)' : 'transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: selectedAppDetail.risk === 'high' ? '#ef4444' : selectedAppDetail.risk === 'medium' ? '#f59e0b' : 'var(--text-main)', fontFamily: "'Consolas', monospace", wordBreak: 'break-all' }}>{selectedAppDetail.pkg}</span>
                          {isProtected(selectedAppDetail.pkg) ? <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', borderRadius: '4px', fontWeight: '700' }}>🛡️ 系统</span> : <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: '4px', fontWeight: '700' }}>👤 用户</span>}
                          {virusDB.includes(selectedAppDetail.pkg) && <span style={{ fontSize: '11px', padding: '2px 6px', background: 'rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: '4px', fontWeight: '700', fontFamily: 'monospace' }}>VIRUS</span>}
                        </div>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: selectedAppDetail.risk === 'high' ? 'rgba(239,68,68,0.2)' : selectedAppDetail.risk === 'medium' ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)', color: selectedAppDetail.risk === 'high' ? '#ef4444' : selectedAppDetail.risk === 'medium' ? '#f59e0b' : 'var(--text-muted)', fontWeight: '600', fontFamily: 'monospace' }}>
                          {selectedAppDetail.risk === 'high' ? '🔴 HIGH' : selectedAppDetail.risk === 'medium' ? '🟡 MED' : '🟢 LOW'} [{selectedAppDetail.score}]
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {(selectedAppDetail.signals||[]).map((s, j) => {
                          const cat = s.category === 'ads' ? 'ALERT' : s.category === 'privacy' ? 'WARNING' : s.category === 'system' ? 'SYSTEM' : 'INFO';
                          return (
                            <span key={j} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', fontWeight: '600', fontFamily: "'Consolas', monospace",
                              background: s.severity >= 3 ? 'rgba(239,68,68,0.12)' : s.severity >= 2 ? 'rgba(245,158,11,0.1)' : 'rgba(139,92,246,0.08)',
                              color: s.severity >= 3 ? '#ef4444' : s.severity >= 2 ? '#f59e0b' : '#8b5cf6' }}>
                              [{cat}]
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    {/* Terminal log area */}
                    <div ref={detailLogRef} key={selectedAppDetail.pkg} style={{ flex: 1, overflowY: 'auto', padding: '12px', background: '#0a0a12', fontFamily: "'Consolas', 'Courier New', monospace" }}>
                      {/* Header line */}
                      <div style={{ color: '#555', fontSize: '11px', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                        {'> '}analyzing <span style={{ color: '#00ff88' }}>{selectedAppDetail.pkg}</span> ...{' '}
                        <span style={{ color: selectedAppDetail.risk === 'high' ? '#ef4444' : selectedAppDetail.risk === 'medium' ? '#f59e0b' : '#10b981' }}>
                          [{selectedAppDetail.risk === 'high' ? 'THREAT DETECTED' : selectedAppDetail.risk === 'medium' ? 'SUSPICIOUS' : 'CLEAN'}]
                        </span>
                      </div>
                      {selectedAppDetail.signals?.map((s, i) => {
                        const cat = s.category === 'ads' ? 'ALERT' : s.category === 'privacy' ? 'WARNING' : s.category === 'system' ? 'SYSTEM' : 'INFO';
                        const catColor = s.severity >= 3 ? '#ef4444' : s.severity >= 2 ? '#f59e0b' : s.severity >= 1 ? '#8b5cf6' : '#10b981';
                        const ts = selectedAppDetail.time || '--:--:--';
                        return (
                          <div key={i} className="terminal-log-entry" style={{ marginBottom: '6px', padding: '6px 8px', background: s.severity >= 3 ? 'rgba(239,68,68,0.06)' : s.severity >= 2 ? 'rgba(245,158,11,0.03)' : 'rgba(255,255,255,0.015)', borderLeft: `2px solid ${catColor}`, borderRadius: '0 3px 3px 0', animation: 'logFadeIn 0.3s ease forwards', animationDelay: `${i * 0.08}s`, opacity: 0 }}>
                            <div style={{ fontSize: '10px', color: '#444' }}>
                              <span style={{ color: '#555' }}>{ts}</span>
                              {' '}
                              <span style={{ color: catColor, fontWeight: '700' }}>[{cat}]</span>
                            </div>
                            <div style={{ fontSize: '11px', color: catColor, fontWeight: '600', marginTop: '1px' }}>{'> '}{s.type}</div>
                            <div style={{ fontSize: '10px', color: '#777', marginTop: '1px' }}>{s.detail}</div>
                          </div>
                        );
                      })}
                      {/* Cursor blink */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                        <span style={{ color: '#00ff88', fontSize: '11px' }}>{'>'}</span>
                        <span className="terminal-cursor" style={{ display: 'inline-block', width: '7px', height: '14px', background: '#00ff88', animation: 'blink 1s step-end infinite' }}></span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontFamily: "'Consolas', monospace", color: '#333', fontSize: '12px', textAlign: 'center', lineHeight: '1.8' }}>
                      <div style={{ marginBottom: '12px' }}>{'>'} <span style={{ color: '#00ff88' }}>SYSTEM</span> ready<span className="terminal-cursor" style={{ display: 'inline-block', width: '7px', height: '12px', background: '#00ff88', animation: 'blink 1s step-end infinite', verticalAlign: 'middle' }}></span></div>
                      <div style={{ color: '#444', marginBottom: '8px' }}>{'>'} waiting for target selection...</div>
                      <div style={{ color: '#333', fontSize: '11px' }}>← 点击左侧应用查看行为详情</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Overview */}
              <div style={{ width: '25%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', color: 'var(--text-muted)', fontWeight: '700', fontFamily: "'Orbitron', monospace", letterSpacing: '1px' }}>📊 后台程序分析表</div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--neon-cyan)', fontWeight: '700', marginBottom: '8px' }}>行为分布</p>
                    {[
                      { label: '隐私访问', value: behaviorSummary?.permissionStats?.privacy || 0, color: '#ec4899', icon: '🔒' },
                      { label: '系统行为', value: behaviorSummary?.permissionStats?.system || 0, color: '#8b5cf6', icon: '⚙️' },
                      { label: '广告行为', value: behaviorSummary?.permissionStats?.ads || 0, color: '#f59e0b', icon: '📢' },
                      { label: '存储访问', value: behaviorSummary?.permissionStats?.storage || 0, color: '#14b8a6', icon: '💾' },
                    ].map((c, i) => (
                      <div key={i} style={{ marginBottom: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.icon} {c.label}</span>
                          <span style={{ fontSize: '11px', fontWeight: '700', color: c.color }}>{c.value}</span>
                        </div>
                        <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, (c.value / Math.max(1, (behaviorSummary?.totalApps || 1))) * 100)}%`, background: c.color, borderRadius: '2px', transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--neon-cyan)', fontWeight: '700', marginBottom: '8px' }}>网络连接</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <div style={{ padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', textAlign: 'center' }}>
                        <p style={{ fontSize: '18px', fontWeight: '800', color: '#14b8a6', fontFamily: "'Orbitron', monospace" }}>{behaviorSummary?.tcpConnections || 0}</p>
                        <p style={{ fontSize: '9px', color: 'var(--text-muted)' }}>TCP</p>
                      </div>
                      <div style={{ padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', textAlign: 'center' }}>
                        <p style={{ fontSize: '18px', fontWeight: '800', color: '#06b6d4', fontFamily: "'Orbitron', monospace" }}>{behaviorSummary?.udpConnections || 0}</p>
                        <p style={{ fontSize: '9px', color: 'var(--text-muted)' }}>UDP</p>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--neon-cyan)', fontWeight: '700', marginBottom: '8px' }}>风险分布</p>
                    {[
                      { label: '高危', count: behaviorResults?.filter(r => r.risk === 'high').length || 0, color: '#ef4444' },
                      { label: '中危', count: behaviorResults?.filter(r => r.risk === 'medium').length || 0, color: '#f59e0b' },
                      { label: '正常', count: behaviorResults?.filter(r => r.risk === 'low').length || 0, color: '#10b981' },
                    ].map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.color }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', flex: 1 }}>{r.label}</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: r.color }}>{r.count}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '14px', background: 'rgba(16,185,129,0.06)', borderRadius: '10px', border: '1.5px solid rgba(16,185,129,0.3)' }}>
                    <p style={{ fontSize: '12px', color: '#10b981', fontWeight: '700', marginBottom: '8px', letterSpacing: '0.5px' }}>🟢 当前前台</p>
                    <p style={{ fontSize: '16px', fontWeight: '700', color: '#34d399', wordBreak: 'break-all', fontFamily: "'Rajdhani', monospace", lineHeight: '1.4' }}>{behaviorResults?.find(r => (r.signals||[]).some(s => s.type === '前台'))?.pkg || '---'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '8px 25px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
              <span>叠加层弹窗+25 · 广告SDK+12 · 假通知+10 · CPU+8 · 高危≥15 | 中危≥5</span>
                       <span>{behaviorTimeline.length} 条记录 · {captureSelected.length} 已选</span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Running Apps Modal - removed */}

      {/* Scan Result */}
      {isScanning && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card" style={{ width: '400px', padding: '50px', textAlign: 'center', border: '1px solid var(--accent-danger)' }}>
            <div style={{ fontSize: '50px', marginBottom: '20px', animation: 'spin 1s linear infinite' }}>🔬</div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px' }}>正在扫描病毒...</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>对比病毒库，扫描 {deviceApps.length} 个应用</p>
          </div>
        </div>,
        document.body
      )}
      {scanResult && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card" style={{ width: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid ' + (scanResult.found.length ? 'var(--accent-danger)' : '#10b981') }}>
            <div style={{ padding: '25px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>{scanResult.found.length ? '🚨' : '✅'}</div>
              <h2 style={{ fontSize: '20px', fontWeight: '700' }}>{scanResult.found.length ? `发现 ${scanResult.found.length} 个病毒` : '扫描完成，未发现病毒'}</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>扫描了 {scanResult.total} 个应用，病毒库 {scanResult.virusCount} 条</p>
            </div>
            {scanResult.found.length > 0 && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 25px', maxHeight: '40vh' }}>
                {scanResult.found.map((app, i) => (
                  <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px' }}>💀</span>
                    <div style={{ flex: 1 }}><p style={{ fontSize: '13px', fontWeight: '700', color: '#ef4444' }}>{app.name}</p><p style={{ fontSize: '10px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{app.pkg}</p></div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding: '15px 25px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'center' }}>
              {scanResult.found.length > 0 && <button className="btn btn-danger" style={{ padding: '10px 24px', fontSize: '13px' }} onClick={deleteAllViruses}>🗑️ 一键删除所有病毒</button>}
              <button className="btn btn-outline" style={{ padding: '10px 24px', fontSize: '13px' }} onClick={() => setScanResult(null)}>关闭</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .app-card:hover { border-color: var(--neon-cyan) !important; transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,240,255,0.15); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes logFadeIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
      `}</style>
    </div>
  );
};

export default AppManager;

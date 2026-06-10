import React, { useState, useRef, useMemo, useCallback, memo } from 'react';
import { useVirus } from '../context/VirusContext';
import { useDebounce } from '../hooks/useDebounce';
import { useVirtualList } from '../hooks/useVirtualList';
import { save, open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';

// Report Modal
const ReportModal = memo(({ onClose, onSubmit }) => {
  const [pkgName, setPkgName] = useState('');
  const [reason, setReason] = useState('');
  const [reporter, setReporter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async () => {
    if (!pkgName.trim()) return;
    setSubmitting(true);
    const res = await onSubmit(pkgName.trim(), reason.trim() || 'Suspicious app detected', reporter.trim() || 'anonymous');
    setResult(res);
    setSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '520px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)', padding: '35px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '20px', color: 'var(--accent-danger)' }}>🦠 上报新病毒</h2>
        {result ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>{result.success ? '✅' : '❌'}</div>
            <p style={{ fontSize: '16px', marginBottom: '8px', fontWeight: '600' }}>{result.success ? '上报成功！' : '上报失败'}</p>
            {result.success && <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '5px' }}>Issue #{result.issueNumber} 已创建</p>}
            {result.error && <p style={{ fontSize: '13px', color: 'var(--accent-danger)' }}>{result.error}</p>}
            {result.issueUrl && <a href={result.issueUrl} target="_blank" rel="noopener" style={{ fontSize: '13px', color: 'var(--accent-primary)' }}>在 GitHub 查看 →</a>}
            <button onClick={onClose} style={{ marginTop: '20px', background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 30px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>关闭</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>包名 *</label>
              <input type="text" placeholder="例: com.example.malware" value={pkgName} onChange={e => setPkgName(e.target.value)}
                style={{ width: '100%', padding: '12px 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '15px', outline: 'none', fontFamily: 'monospace' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>原因</label>
              <textarea placeholder="描述为什么认为这是恶意软件..." value={reason} onChange={e => setReason(e.target.value)} rows={3}
                style={{ width: '100%', padding: '12px 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '15px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div style={{ marginBottom: '25px' }}>
              <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>你的名字（可选）</label>
              <input type="text" placeholder="anonymous" value={reporter} onChange={e => setReporter(e.target.value)}
                style={{ width: '100%', padding: '12px 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '15px', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 25px', cursor: 'pointer', fontSize: '14px' }}>取消</button>
              <button onClick={handleSubmit} disabled={!pkgName.trim() || submitting} style={{ background: pkgName.trim() ? 'var(--accent-danger)' : 'var(--border)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 25px', cursor: pkgName.trim() ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: '600', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? '提交中...' : '📤 提交上报'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

// Issue Review Modal
const IssueReviewModal = memo(({ onClose, issues, onApprove, onReject, loading }) => {
  const [selectedPkg, setSelectedPkg] = useState({});

  const extractPackageName = (title) => {
    const match = title.match(/Report:\s*(.+)/i);
    return match ? match[1].trim() : title;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '700px', maxHeight: '80vh', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)', padding: '35px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '20px', color: 'var(--accent-primary)' }}>📋 待审核上报 ({issues.length})</h2>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>加载中...</div>
        ) : issues.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>没有待审核的上报</div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {issues.map(issue => {
              const pkg = extractPackageName(issue.title);
              return (
                <div key={issue.number} style={{ padding: '18px', marginBottom: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--accent-warning)', fontWeight: '600' }}>#{issue.number}</span>
                      <h3 style={{ fontSize: '16px', fontWeight: '700', margin: '4px 0 0', fontFamily: 'monospace' }}>{pkg}</h3>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(issue.created_at).toLocaleDateString()}</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.5' }}>
                    {issue.body?.slice(0, 200) || 'No description'}{issue.body?.length > 200 ? '...' : ''}
                  </p>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input type="text" placeholder="确认包名（可修改）" value={selectedPkg[issue.number] || pkg}
                      onChange={e => setSelectedPkg(prev => ({ ...prev, [issue.number]: e.target.value }))}
                      style={{ flex: 1, padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-main)', fontSize: '13px', outline: 'none', fontFamily: 'monospace' }} />
                    <button onClick={() => onApprove(issue.number, selectedPkg[issue.number] || pkg)} style={{ background: 'var(--accent-success)', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>✅ 通过</button>
                    <button onClick={() => onReject(issue.number)} style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--accent-danger)', border: '1px solid var(--accent-danger)', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>❌ 拒绝</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button onClick={onClose} style={{ marginTop: '15px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 25px', cursor: 'pointer', fontSize: '14px', alignSelf: 'flex-end' }}>关闭</button>
      </div>
    </div>
  );
});

const DetailPanel = memo(({ title, subtitle, data, color, icon, onAdd, onRemove, onClose, searchPlaceholder, onBulkAdd }) => {
  const [search, setSearch] = useState('');
  const [newItem, setNewItem] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const debouncedSearch = useDebounce(search, 300);
  const filtered = debouncedSearch ? data.filter(p => p.toLowerCase().includes(debouncedSearch.toLowerCase())) : null;
  const displayData = filtered || data;
  const { onScroll, startIdx, endIdx, totalHeight, offsetY, ROW_HEIGHT } = useVirtualList(displayData.length, scrollContainerRef);
  const visibleItems = displayData.slice(startIdx, endIdx);

  const handleAdd = () => {
    if (!newItem.trim()) return;
    const item = newItem.trim();
    if (!data.includes(item)) { onAdd(item); setAddedCount(c => c + 1); setNewItem(''); }
  };

  const handleTxtImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const lines = evt.target.result.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (onBulkAdd) {
        const result = onBulkAdd(lines);
        setImportResult({ total: lines.length, added: result.added, skipped: result.skipped });
        setAddedCount(c => c + result.added);
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: '0' }}>
      <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', border: `1px solid ${color}`, borderRadius: '0', background: 'var(--bg-card)', boxShadow: '0 0 40px rgba(0,0,0,0.5)', margin: '0' }}>
        {/* Header */}
        <div style={{ padding: '25px 35px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
            <div>
              <h2 style={{ fontSize: '26px', fontWeight: '700' }}>{icon} {title}</h2>
              <p style={{ fontSize: '16px', color: 'var(--text-muted)', marginTop: '4px' }}>共 <b style={{ color }}>{data.length}</b> 条{addedCount > 0 && <span> (本次新增 {addedCount} 条)</span>}</p>
            </div>
            <button onClick={() => { onClose(); setSearch(''); setNewItem(''); setImportResult(null); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '24px', cursor: 'pointer', padding: '5px' }}>✕</button>
          </div>
          {/* Import result banner */}
          {importResult && (
            <div style={{ marginBottom: '15px', padding: '12px 20px', borderRadius: '10px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '18px' }}>✅</span>
              <span style={{ fontSize: '14px', color: 'var(--accent-success)' }}>导入完成！共 {importResult.total} 行，新增 <b>{importResult.added}</b> 条，重复跳过 {importResult.skipped} 条</span>
              <button onClick={() => setImportResult(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 'auto', fontSize: '16px' }}>✕</button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input type="text" placeholder={searchPlaceholder || '搜索...'} value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '14px 20px 14px 50px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-main)', fontSize: '18px', outline: 'none' }} />
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '20px' }}>🔍</span>
            </div>
            <div style={{ position: 'relative', flex: 1 }}>
              <input type="text" placeholder="输入新条目后回车或点击添加" value={newItem} onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                style={{ width: '100%', padding: '14px 120px 14px 50px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-main)', fontSize: '18px', outline: 'none' }} />
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '20px' }}>➕</span>
              <button onClick={handleAdd} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: color, color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer', fontSize: '16px', fontWeight: '700', whiteSpace: 'nowrap' }}>添加</button>
            </div>
            <input type="file" ref={fileInputRef} hidden accept=".txt" onChange={handleTxtImport} />
            <button onClick={() => fileInputRef.current.click()} style={{ background: color, color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer', fontSize: '16px', fontWeight: '700', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📄 导入TXT
            </button>
          </div>
        </div>

        {/* Content - Virtual List */}
        <div ref={scrollContainerRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '0 35px' }}>
          {filtered && <p style={{ fontSize: '18px', color: 'var(--text-muted)', margin: '15px 0 10px' }}>搜索结果: {filtered.length} 条</p>}
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)`, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 40px' }}>
              {visibleItems.map((pkg, vi) => {
                const globalIdx = startIdx + vi;
                return (
                  <div key={globalIdx} style={{ display: 'flex', alignItems: 'center', height: ROW_HEIGHT, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ width: '60px', fontSize: '18px', fontFamily: 'monospace', color: 'var(--text-muted)', flexShrink: 0 }}>{globalIdx + 1}</span>
                    <span style={{ flex: 1, fontSize: '17px', fontFamily: 'monospace', color: 'var(--text-main)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pkg}</span>
                    <button onClick={() => onRemove(pkg)} style={{ background: 'transparent', border: 'none', color: '#ef4444', borderRadius: '6px', padding: '4px 12px', fontSize: '16px', cursor: 'pointer', fontWeight: '600', flexShrink: 0 }}>🗑️</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '15px 35px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-muted)' }}>
          <span>{subtitle}</span>
          <button onClick={() => { onClose(); setSearch(''); setNewItem(''); }} style={{ background: color, color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 25px', cursor: 'pointer', fontSize: '15px', fontWeight: '600' }}>关闭</button>
        </div>
      </div>
    </div>
  );
});

const Dashboard = () => {
  const { virusDB, addVirus, removeVirus, bulkAddVirus, protectedApps, addProtectedApp, removeProtectedApp, brandDB, addBrand, removeBrand, keywordDB, addKeyword, removeKeyword, device, deviceInfo, refreshDevices, isAdmin, exportVirusDat, importVirusDat,
    // GitHub sync
    dbSyncStatus, dbVersion, dbLastSync, dbError, githubToken, githubRole,
    pendingIssues, issuesLoading,
    fetchDbFromGitHub, pushDbToGitHub, reportVirus, fetchPendingIssues,
    approveIssue, rejectIssue, saveGithubConfig,
  } = useVirus();
  const [activePanel, setActivePanel] = useState(null);
  const [virusSource, setVirusSource] = useState('本地内置');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsToken, setSettingsToken] = useState(githubToken || '');
  const [settingsRole, setSettingsRole] = useState(githubRole || 'guest');
  const [pushing, setPushing] = useState(false);
  const datFileRef = useRef(null);
  const isWireless = device?.id?.includes('_tcp') || device?.id?.includes(':');

  const stats = useMemo(() => [
    { label: '恶意软件数据库', value: virusDB.length, sub: '已知威胁', icon: '🛡️', color: 'var(--accent-danger)', key: 'virus' },
    { label: '受保护的应用', value: protectedApps.length, sub: '安全名单', icon: '✅', color: 'var(--accent-success)', key: 'protected' },
    { label: '品牌库', value: brandDB.length, sub: '受保护品牌', icon: '🏢', color: 'var(--accent-primary)', key: 'brand' },
    { label: '病毒库关键词', value: keywordDB.length, sub: '特征记录', icon: '🔑', color: 'var(--accent-warning)', key: 'keyword' },
  ], [virusDB.length, protectedApps.length, brandDB.length, keywordDB.length]);

  const hardware = useMemo(() => [
    { label: '存储空间', value: device ? (deviceInfo?.storage?.percent || '---') : '---', detail: device ? `${deviceInfo?.storage?.used || 0} GB / ${deviceInfo?.storage?.total || 0} GB` : '0 GB / 0 GB', color: 'var(--accent-primary)' },
    { label: '内存状态', value: device ? (deviceInfo?.memory?.percent || '---') : '---', detail: device ? `${deviceInfo?.memory?.used || 0} GB / ${deviceInfo?.memory?.total || 0} GB` : '0 GB / 0 GB', color: 'var(--accent-secondary)' },
    { label: '当前电量', value: device ? `${deviceInfo?.battery?.level || 0}%` : '---', detail: device ? `${deviceInfo?.battery?.status || '未知'} · ${deviceInfo?.battery?.temp || '--'}` : '未连接', color: 'var(--accent-success)' },
  ], [device, deviceInfo?.storage?.percent, deviceInfo?.storage?.used, deviceInfo?.storage?.total, deviceInfo?.memory?.percent, deviceInfo?.memory?.used, deviceInfo?.memory?.total, deviceInfo?.battery?.level, deviceInfo?.battery?.status, deviceInfo?.battery?.temp]);

  const handleBulkVirusAdd = useCallback((lines) => {
    const uniqueLines = [...new Set(lines.map(l => l.trim()).filter(l => l.length > 0))];
    const existing = new Set(virusDB);
    const newItems = uniqueLines.filter(l => !existing.has(l));
    bulkAddVirus(newItems);
    return { total: lines.length, added: newItems.length, skipped: uniqueLines.length - newItems.length };
  }, [virusDB, bulkAddVirus]);

  const handleCardClick = (key) => {
    if (!isAdmin) return;
    setActivePanel(key);
  };

  const handleExportDat = async () => {
    const jsonStr = JSON.stringify(virusDB);
    // Use the existing encrypt logic if possible, but Dashboard only has exportVirusDat which returns length.
    // Wait, exportVirusDat in VirusContext actually returns the length AFTER downloading.
    // I should modify VirusContext or just do the encryption here.
    // Actually, it's better to modify VirusContext's exportVirusDat to return the encrypted string, and do the save here.
    // But since encryptData is in VirusContext, I'll update VirusContext.jsx in the next step.
    const encryptedStr = await exportVirusDat(); // Assume I'll change it to return the string
    if (!encryptedStr) return;
    
    try {
      const filePath = await save({
        filters: [{ name: 'Virus DB', extensions: ['dat'] }],
        defaultPath: `ERS_VirusDB_${new Date().toISOString().slice(0,10)}.dat`
      });
      if (filePath) {
        await writeTextFile(filePath, encryptedStr);
        alert('导出成功！');
      }
    } catch (e) {
      console.error(e);
      alert('导出失败: ' + e);
    }
  };

  const handleImportDat = async () => {
    try {
      const filePath = await openDialog({
        filters: [{ name: 'Virus DB', extensions: ['dat'] }],
        multiple: false
      });
      if (filePath) {
        const content = await readTextFile(filePath);
        const result = importVirusDat(content);
        if (result && result.success) {
          setVirusSource('已导入');
          alert(result.message || '导入成功！');
        } else {
          alert((result && result.message) ? result.message : '导入失败，文件格式错误或已损坏');
        }
      }
    } catch (e) {
      console.error(e);
      alert('导入失败: ' + e);
    }
  };

  const handlePushToGitHub = async () => {
    if (!githubToken) {
      alert('请先在设置中配置 GitHub Token');
      return;
    }
    setPushing(true);
    try {
      const result = await pushDbToGitHub(githubToken);
      if (result.success) {
        alert('数据库已同步到 GitHub！');
      } else {
        alert('同步失败: ' + (result.error || 'Unknown error'));
      }
    } finally {
      setPushing(false);
    }
  };

  const handleSaveSettings = () => {
    saveGithubConfig(settingsToken, settingsRole);
    setShowSettingsModal(false);
    alert('设置已保存');
  };

  const handleOpenIssues = async () => {
    const issues = await fetchPendingIssues();
    setShowIssueModal(true);
  };

  const panelConfig = useMemo(() => ({
    virus: { title: '🛡️ 恶意软件数据库', subtitle: '涵盖：广告注入/间谍窃取/木马后门/付费扣费/挖矿/勒索锁屏/钓鱼/恶意SDK/已知恶意家族', color: 'var(--accent-danger)', icon: '🛡️', searchPlaceholder: '搜索包名...', data: virusDB, onAdd: addVirus, onRemove: removeVirus, onBulkAdd: handleBulkVirusAdd },
    protected: { title: '✅ 受保护的应用', subtitle: '系统核心应用和安全服务，这些应用被标记为受保护，误删可能导致系统异常', color: 'var(--accent-success)', icon: '✅', searchPlaceholder: '搜索受保护应用...', data: protectedApps, onAdd: addProtectedApp, onRemove: removeProtectedApp },
    brand: { title: '🏢 品牌库', subtitle: '各大品牌官方应用（Google/Samsung/华为/小米/Meta/Microsoft/Amazon等），确保不误删品牌应用', color: 'var(--accent-primary)', icon: '🏢', searchPlaceholder: '搜索品牌应用...', data: brandDB, onAdd: addBrand, onRemove: removeBrand },
    keyword: { title: '🔑 病毒库关键词', subtitle: '用于检测应用名称/描述中的危险特征词，涵盖恶意行为/权限/SDK/已知家族名', color: 'var(--accent-warning)', icon: '🔑', searchPlaceholder: '搜索关键词...', data: keywordDB, onAdd: addKeyword, onRemove: removeKeyword },
  }), [virusDB, addVirus, removeVirus, handleBulkVirusAdd, protectedApps, addProtectedApp, removeProtectedApp, brandDB, addBrand, removeBrand, keywordDB, addKeyword, removeKeyword]);

  const cfg = useMemo(() => activePanel ? panelConfig[activePanel] : null, [activePanel, panelConfig]);

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', display: 'flex', flexDirection: 'column', gap: '30px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
        {stats.map((stat, i) => (
          <div
            key={i}
            className="glass-card"
            onClick={() => handleCardClick(stat.key)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = stat.color}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <div>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '10px' }}>{stat.label}</p>
              <h3 style={{ fontSize: '28px', fontWeight: 'bold' }}>{stat.value}</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{stat.sub} (点击查看)</p>
            </div>
            <div style={{ fontSize: '24px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '12px' }}>{stat.icon}</div>
          </div>
        ))}
      </div>

      {/* 病毒库管理 */}
      <div className="glass-card" style={{ padding: '20px 30px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>📦</span>
          <div>
            <p style={{ fontSize: '15px', fontWeight: '700' }}>病毒库管理</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>当前来源: <span style={{ color: virusSource === '本地内置' ? 'var(--accent-success)' : 'var(--accent-primary)', fontWeight: '600' }}>{virusSource}</span> · 共 {virusDB.length} 条记录</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAdmin ? (
            <>
              <button onClick={handleExportDat} style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📤 导出 .dat 加密文件
              </button>
              <button onClick={handleImportDat} style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📥 导入 .dat 文件
              </button>
            </>
          ) : (
            <>
              <button onClick={handleImportDat} style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📥 导入 .dat 文件
              </button>
            </>
          )}
        </div>
      </div>

      {/* GitHub 同步状态 */}
      <div className="glass-card" style={{ padding: '20px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>☁️</span>
            <div>
              <p style={{ fontSize: '15px', fontWeight: '700' }}>GitHub 云端同步</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                状态: <span style={{
                  color: dbSyncStatus === 'synced' ? 'var(--accent-success)' :
                         dbSyncStatus === 'syncing' ? 'var(--accent-warning)' :
                         dbSyncStatus === 'offline' ? 'var(--accent-secondary)' : 'var(--accent-danger)',
                  fontWeight: '600'
                }}>
                  {dbSyncStatus === 'synced' ? '✅ 已同步' :
                   dbSyncStatus === 'syncing' ? '🔄 同步中...' :
                   dbSyncStatus === 'offline' ? '📴 离线模式' :
                   dbSyncStatus === 'error' ? '❌ 同步失败' : '⚪ 就绪'}
                </span>
                {dbVersion && <span> · 版本: {dbVersion}</span>}
                {dbLastSync && <span> · 上次同步: {dbLastSync}</span>}
              </p>
              {dbError && <p style={{ fontSize: '12px', color: 'var(--accent-danger)', marginTop: '4px' }}>{dbError}</p>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => fetchDbFromGitHub()} disabled={dbSyncStatus === 'syncing'}
              style={{
                background: dbSyncStatus === 'syncing' ? 'var(--border)' : 'var(--accent-primary)',
                color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px',
                cursor: dbSyncStatus === 'syncing' ? 'not-allowed' : 'pointer',
                fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px'
              }}>
              {dbSyncStatus === 'syncing' ? '🔄 同步中...' : '🔄 立即同步'}
            </button>
            {isAdmin && (
              <button onClick={handlePushToGitHub} disabled={pushing || !githubToken}
                style={{
                  background: pushing || !githubToken ? 'var(--border)' : 'var(--accent-success)',
                  color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px',
                  cursor: pushing || !githubToken ? 'not-allowed' : 'pointer',
                  fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                {pushing ? '📤 推送中...' : '📤 推送到 GitHub'}
              </button>
            )}
            <button onClick={() => setShowReportModal(true)}
              style={{ background: 'var(--accent-danger)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🦠 上报新病毒
            </button>
            {isAdmin && githubRole !== 'guest' && (
              <button onClick={handleOpenIssues}
                style={{ background: 'var(--accent-warning)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📋 审核上报 {pendingIssues.length > 0 && `(${pendingIssues.length})`}
              </button>
            )}
            <button onClick={() => { setSettingsToken(githubToken); setSettingsRole(githubRole); setShowSettingsModal(true); }}
              style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚙️ 设置
            </button>
          </div>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <span>角色: <b style={{ color: githubRole === 'owner' ? 'var(--accent-success)' : githubRole === 'contributor' ? 'var(--accent-primary)' : 'var(--text-muted)' }}>{githubRole === 'owner' ? '👑 所有者' : githubRole === 'contributor' ? '🔧 贡献者' : '👤 访客'}</b></span>
          <span>Token: {githubToken ? '✅ 已配置' : '❌ 未配置'}</span>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '480px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)', padding: '35px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '20px' }}>⚙️ GitHub 设置</h2>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>GitHub Token</label>
              <input type="password" placeholder="ghp_xxx..." value={settingsToken} onChange={e => setSettingsToken(e.target.value)}
                style={{ width: '100%', padding: '12px 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '14px', outline: 'none', fontFamily: 'monospace' }} />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>Owner Token: 完整权限 | 贡献者: 留空使用内置 Token</p>
            </div>
            <div style={{ marginBottom: '25px' }}>
              <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>角色</label>
              <select value={settingsRole} onChange={e => setSettingsRole(e.target.value)}
                style={{ width: '100%', padding: '12px 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '14px', outline: 'none' }}>
                <option value="guest">👤 访客 - 只能上报</option>
                <option value="contributor">🔧 贡献者 - 可上报</option>
                <option value="owner">👑 所有者 - 可推送/审核</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSettingsModal(false)} style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 25px', cursor: 'pointer', fontSize: '14px' }}>取消</button>
              <button onClick={handleSaveSettings} style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 25px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>保存设置</button>
            </div>
          </div>
        </div>
      )}

      {/* Device Info Card */}
      <div className="glass-card" style={{ padding: '25px 30px', position: 'relative' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', fontFamily: "'Orbitron', monospace", color: device ? 'var(--neon-green)' : 'var(--text-muted)', border: `2px solid ${device ? 'var(--neon-green)' : 'var(--border)'}`, boxShadow: device ? '0 0 15px rgba(0,255,136,0.2)' : 'none', flexShrink: 0 }}>{device ? 'ONLINE' : 'OFFLINE'}</div>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: '800', fontFamily: "'Orbitron', monospace", color: 'var(--neon-cyan)', textShadow: '0 0 10px rgba(0,240,255,0.3)', margin: 0 }}>{device ? (deviceInfo?.model || '读取中...') : '等待设备连接...'}</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', fontFamily: "'Rajdhani', sans-serif" }}>{device ? `${deviceInfo?.brand || '--'} / ${deviceInfo?.manufacturer || '--'}` : '请连接Android设备'} · SN: {device?.id || 'N/A'}</p>
            </div>
          </div>
          <button onClick={refreshDevices} className="btn btn-outline" style={{ fontSize: '13px', padding: '8px 16px' }}>🔄 刷新</button>
        </div>

        {/* Device Details Grid - Scrollable */}
        <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '5px' }}>
          {/* Basic Info */}
          <h3 style={{ fontSize: '14px', color: 'var(--neon-cyan)', fontWeight: '700', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border)', fontFamily: "'Orbitron', monospace", letterSpacing: '1px' }}>📱 BASIC INFO</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '25px' }}>
            {[
              { label: '品牌', value: deviceInfo?.brand },
              { label: '制造商', value: deviceInfo?.manufacturer },
              { label: '型号', value: deviceInfo?.model },
              { label: '设备名', value: deviceInfo?.deviceName },
              { label: '产品名', value: deviceInfo?.productName },
              { label: '序列号', value: device?.id },
              { label: '连接状态', value: device ? '已授权' : '未连接', color: device ? 'var(--neon-green)' : 'var(--neon-pink)' },
              { label: '连接类型', value: device ? (isWireless ? 'WiFi' : 'USB') : '--' },
            ].map((item, i) => (
              <div key={i} style={{ padding: '10px 14px', background: 'rgba(0,240,255,0.03)', borderRadius: '8px', border: '1px solid rgba(0,240,255,0.08)' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '500' }}>{item.label}</p>
                <p style={{ fontSize: '15px', fontWeight: '700', color: item.color || 'var(--neon-cyan)', fontFamily: "'Rajdhani', sans-serif", wordBreak: 'break-all' }}>{item.value || '--'}</p>
              </div>
            ))}
          </div>

          {/* System Info */}
          <h3 style={{ fontSize: '14px', color: 'var(--neon-cyan)', fontWeight: '700', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border)', fontFamily: "'Orbitron', monospace", letterSpacing: '1px' }}>⚙️ SYSTEM</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '25px' }}>
            {[
              { label: '安卓版本', value: deviceInfo?.version },
              { label: 'SDK', value: deviceInfo?.sdk },
              { label: '首次API', value: deviceInfo?.firstApi },
              { label: '安全补丁', value: deviceInfo?.securityPatch },
              { label: '构建号', value: deviceInfo?.incremental },
              { label: '构建类型', value: deviceInfo?.buildType },
              { label: '构建标签', value: deviceInfo?.build?.tags },
              { label: '可调试', value: deviceInfo?.debuggable },
            ].map((item, i) => (
              <div key={i} style={{ padding: '10px 14px', background: 'rgba(0,240,255,0.03)', borderRadius: '8px', border: '1px solid rgba(0,240,255,0.08)' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '500' }}>{item.label}</p>
                <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--neon-cyan)', fontFamily: "'Rajdhani', sans-serif", wordBreak: 'break-all' }}>{item.value || '--'}</p>
              </div>
            ))}
          </div>

          {/* Hardware */}
          <h3 style={{ fontSize: '14px', color: 'var(--neon-green)', fontWeight: '700', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border)', fontFamily: "'Orbitron', monospace", letterSpacing: '1px' }}>🔧 HARDWARE</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '25px' }}>
            {[
              { label: 'CPU架构', value: deviceInfo?.cpu },
              { label: '处理器', value: deviceInfo?.hardware },
              { label: '芯片平台', value: deviceInfo?.board },
              { label: '基带版本', value: deviceInfo?.baseband },
              { label: '屏幕分辨率', value: deviceInfo?.display?.size },
              { label: '屏幕密度', value: deviceInfo?.display?.density ? deviceInfo.display.density + ' dpi' : '--' },
              { label: '内存总量', value: deviceInfo?.memory?.total ? deviceInfo.memory.total + ' GB' : '--' },
              { label: '内存已用', value: deviceInfo?.memory?.used ? deviceInfo.memory.used + ' GB (' + deviceInfo.memory.percent + ')' : '--' },
            ].map((item, i) => (
              <div key={i} style={{ padding: '10px 14px', background: 'rgba(0,255,136,0.03)', borderRadius: '8px', border: '1px solid rgba(0,255,136,0.08)' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '500' }}>{item.label}</p>
                <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--neon-green)', fontFamily: "'Rajdhani', sans-serif", wordBreak: 'break-all' }}>{item.value || '--'}</p>
              </div>
            ))}
          </div>

          {/* Battery */}
          <h3 style={{ fontSize: '14px', color: 'var(--accent-warning)', fontWeight: '700', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border)', fontFamily: "'Orbitron', monospace", letterSpacing: '1px' }}>🔋 BATTERY</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '25px' }}>
            {[
              { label: '电量', value: deviceInfo?.battery?.level ? deviceInfo.battery.level + '%' : '--', color: parseInt(deviceInfo?.battery?.level) > 50 ? 'var(--neon-green)' : parseInt(deviceInfo?.battery?.level) > 20 ? 'var(--accent-warning)' : 'var(--neon-pink)' },
              { label: '状态', value: deviceInfo?.battery?.status },
              { label: '温度', value: deviceInfo?.battery?.temp },
              { label: '电压', value: deviceInfo?.battery?.voltage },
              { label: '健康', value: deviceInfo?.battery?.health },
              { label: '电池类型', value: deviceInfo?.battery?.technology },
              { label: '存储容量', value: deviceInfo?.storage?.total ? deviceInfo.storage.total + ' GB' : '--' },
              { label: '存储已用', value: deviceInfo?.storage?.used ? deviceInfo.storage.used + ' GB (' + deviceInfo.storage.percent + ')' : '--' },
            ].map((item, i) => (
              <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,184,0,0.03)', borderRadius: '8px', border: '1px solid rgba(255,184,0,0.08)' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '500' }}>{item.label}</p>
                <p style={{ fontSize: '15px', fontWeight: '700', color: item.color || 'var(--accent-warning)', fontFamily: "'Rajdhani', sans-serif" }}>{item.value || '--'}</p>
              </div>
            ))}
          </div>

          {/* Network & Build */}
          <h3 style={{ fontSize: '14px', color: 'var(--accent-secondary)', fontWeight: '700', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border)', fontFamily: "'Orbitron', monospace", letterSpacing: '1px' }}>🌐 NETWORK & BUILD</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '15px' }}>
            {[
              { label: 'WiFi接口', value: deviceInfo?.network?.wifi },
              { label: 'MAC地址', value: deviceInfo?.network?.mac },
              { label: '网关IP', value: deviceInfo?.network?.ip },
              { label: '网络类型', value: deviceInfo?.network?.wifi || '--' },
              { label: '语言', value: deviceInfo?.lang },
              { label: '地区', value: deviceInfo?.locale },
            ].map((item, i) => (
              <div key={i} style={{ padding: '10px 14px', background: 'rgba(123,45,255,0.03)', borderRadius: '8px', border: '1px solid rgba(123,45,255,0.08)' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '500' }}>{item.label}</p>
                <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--accent-secondary)', fontFamily: "'Rajdhani', sans-serif", wordBreak: 'break-all' }}>{item.value || '--'}</p>
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 14px', background: 'rgba(123,45,255,0.03)', borderRadius: '8px', border: '1px solid rgba(123,45,255,0.08)', marginBottom: '5px' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '500' }}>Build指纹</p>
            <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--accent-secondary)', fontFamily: "'Rajdhani', sans-serif", wordBreak: 'break-all', lineHeight: '1.4' }}>{deviceInfo?.build?.fingerprint || '--'}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
        {hardware.map((hw, i) => (
          <div key={i} className="glass-card" style={{ textAlign: 'center', padding: '30px' }}>
            <p style={{ fontSize: '14px', marginBottom: '20px', color: 'var(--text-muted)', fontWeight: '600' }}>{hw.label}</p>
            <div style={{ width: '130px', height: '130px', margin: '0 auto 20px', border: `10px solid rgba(255,255,255,0.05)`, borderTop: `10px solid ${device ? hw.color : 'var(--border)'}`, borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: device ? `0 0 20px ${hw.color}22` : 'none' }}>
              <span style={{ fontSize: '28px', fontWeight: '800' }}>{hw.value}</span>
            </div>
            <p style={{ fontSize: '13px', fontWeight: '500' }}>{hw.detail}</p>
          </div>
        ))}
      </div>

      {cfg && <DetailPanel {...cfg} onClose={() => setActivePanel(null)} />}
      {showReportModal && <ReportModal onClose={() => setShowReportModal(false)} onSubmit={reportVirus} />}
      {showIssueModal && (
        <IssueReviewModal
          onClose={() => setShowIssueModal(false)}
          issues={pendingIssues}
          onApprove={approveIssue}
          onReject={rejectIssue}
          loading={issuesLoading}
        />
      )}

      <style>{`
        .info-label { font-size: 11px; color: var(--text-muted); margin-bottom: 5px; }
        .info-value { font-size: 16px; font-weight: 700; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default Dashboard;

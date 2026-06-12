import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useVirus } from '../context/VirusContext';
import { save, open as openDialog } from '@tauri-apps/plugin-dialog';

const getFileIcon = (name, isDir) => {
  if (isDir) return '📁';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = {
    jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',webp:'🖼️',heic:'🖼️',bmp:'🖼️',
    mp4:'🎬',mkv:'🎬',avi:'🎬',mov:'🎬',
    mp3:'🎵',wav:'🎵',flac:'🎵',aac:'🎵',m4a:'🎵',
    apk:'📦',zip:'🗜️',rar:'🗜️','7z':'🗜️',tar:'🗜️',gz:'🗜️',
    pdf:'📋',txt:'📝',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',
    json:'📄',xml:'📄',log:'📄',md:'📄',html:'📄',css:'📄',js:'📄',
  };
  return map[ext] || '📄';
};

const formatSize = (bytes) => {
  if (!bytes || bytes === 0) return '--';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
};

const Toast = ({ msg, type }) => msg ? (
  <div style={{ position:'fixed', bottom:30, left:'50%', transform:'translateX(-50%)', zIndex:99999,
    padding:'12px 28px', borderRadius:12, fontWeight:700, fontSize:14,
    background: type==='error'?'rgba(239,68,68,0.95)':type==='success'?'rgba(16,185,129,0.95)':'rgba(30,30,60,0.95)',
    border:`1px solid ${type==='error'?'#ef4444':type==='success'?'#10b981':'#7b2dff'}`,
    color:'#fff', boxShadow:'0 8px 32px rgba(0,0,0,0.5)', pointerEvents:'none' }}>
    {msg}
  </div>
) : null;

const ContextMenu = ({ x, y, item, onClose, onAction }) => {
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const isApk = item && !item.isDir && item.name.toLowerCase().endsWith('.apk');
  const menus = [
    { label: '📋 复制', key: 'copy' },
    { label: '✂️ 剪切', key: 'cut' },
    { label: '📝 重命名', key: 'rename' },
    { label: '💾 下载到电脑', key: 'download' },
    isApk && { label: '📦 安装 APK', key: 'install' },
    { label: '🗑️ 删除', key: 'delete', danger: true },
  ].filter(Boolean);

  return (
    <div ref={ref} style={{ position:'fixed', top:y, left:x, zIndex:99998, minWidth:180,
      background:'rgba(10,10,30,0.97)', border:'1px solid rgba(123,45,255,0.4)',
      borderRadius:12, padding:'6px 0', boxShadow:'0 12px 40px rgba(0,0,0,0.7)' }}>
      <div style={{ padding:'8px 16px 6px', fontSize:11, color:'rgba(255,255,255,0.4)', borderBottom:'1px solid rgba(255,255,255,0.06)', marginBottom:4 }}>
        {item?.isDir ? '📁' : getFileIcon(item?.name||'','')}&nbsp;{item?.name}
      </div>
      {menus.map(m => (
        <div key={m.key} onClick={() => { onAction(m.key); onClose(); }}
          style={{ padding:'10px 18px', fontSize:13, cursor:'pointer', color: m.danger ? '#ef4444' : '#e2e8f0',
            transition:'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = m.danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          {m.label}
        </div>
      ))}
    </div>
  );
};

const ConfirmDialog = ({ msg, onYes, onNo }) => (
  <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:99999, display:'flex', alignItems:'center', justifyContent:'center' }}>
    <div style={{ background:'rgba(10,10,30,0.98)', border:'1px solid rgba(239,68,68,0.5)', borderRadius:16, padding:'32px 40px', textAlign:'center', maxWidth:400 }}>
      <div style={{ fontSize:36, marginBottom:16 }}>⚠️</div>
      <p style={{ fontSize:15, color:'#e2e8f0', marginBottom:24, lineHeight:1.6 }}>{msg}</p>
      <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
        <button onClick={onNo} style={{ padding:'10px 28px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'transparent', color:'#e2e8f0', cursor:'pointer', fontSize:14 }}>取消</button>
        <button onClick={onYes} style={{ padding:'10px 28px', borderRadius:8, border:'none', background:'#ef4444', color:'#fff', cursor:'pointer', fontSize:14, fontWeight:700 }}>确认删除</button>
      </div>
    </div>
  </div>
);

const RenameDialog = ({ item, onConfirm, onCancel }) => {
  const [val, setVal] = useState(item?.name || '');
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:99999, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'rgba(10,10,30,0.98)', border:'1px solid rgba(123,45,255,0.4)', borderRadius:16, padding:'32px 40px', minWidth:380 }}>
        <h3 style={{ marginBottom:20, fontSize:16, color:'#e2e8f0' }}>📝 重命名</h3>
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter') onConfirm(val); if (e.key==='Escape') onCancel(); }}
          style={{ width:'100%', padding:'12px 16px', borderRadius:8, border:'1px solid rgba(123,45,255,0.4)', background:'rgba(0,0,0,0.4)', color:'#e2e8f0', fontSize:14, outline:'none', boxSizing:'border-box' }} />
        <div style={{ display:'flex', gap:12, marginTop:20, justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{ padding:'9px 22px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'transparent', color:'#e2e8f0', cursor:'pointer', fontSize:13 }}>取消</button>
          <button onClick={() => onConfirm(val)} style={{ padding:'9px 22px', borderRadius:8, border:'none', background:'#7b2dff', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700 }}>确认</button>
        </div>
      </div>
    </div>
  );
};

const NewFolderDialog = ({ onConfirm, onCancel }) => {
  const [val, setVal] = useState('新建文件夹');
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:99999, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'rgba(10,10,30,0.98)', border:'1px solid rgba(0,240,255,0.3)', borderRadius:16, padding:'32px 40px', minWidth:380 }}>
        <h3 style={{ marginBottom:20, fontSize:16, color:'#e2e8f0' }}>📁 新建文件夹</h3>
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter') onConfirm(val); if (e.key==='Escape') onCancel(); }}
          style={{ width:'100%', padding:'12px 16px', borderRadius:8, border:'1px solid rgba(0,240,255,0.3)', background:'rgba(0,0,0,0.4)', color:'#e2e8f0', fontSize:14, outline:'none', boxSizing:'border-box' }} />
        <div style={{ display:'flex', gap:12, marginTop:20, justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{ padding:'9px 22px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'transparent', color:'#e2e8f0', cursor:'pointer', fontSize:13 }}>取消</button>
          <button onClick={() => onConfirm(val)} style={{ padding:'9px 22px', borderRadius:8, border:'none', background:'var(--neon-cyan,#00f0ff)', color:'#000', cursor:'pointer', fontSize:13, fontWeight:700 }}>创建</button>
        </div>
      </div>
    </div>
  );
};

const FileManager = () => {
  const { device, getFiles, deleteFile, renameFile, copyFile, makeDir, pullFile, pushFile, installAPK, installAPKRemote } = useVirus();
  const [currentPath, setCurrentPath] = useState('/sdcard/');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(['/sdcard/']);
  const [selected, setSelected] = useState(null);
  const [clipboard, setClipboard] = useState(null); // { item, op: 'copy'|'cut', fromPath }
  const [contextMenu, setContextMenu] = useState(null); // { x, y, item }
  const [dialog, setDialog] = useState(null); // 'delete'|'rename'|'newfolder'
  const [toast, setToast] = useState({ msg: '', type: 'info' });
  const [busy, setBusy] = useState(false);
  const uploadRef = useRef(null);

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'info' }), 2800);
  };

  const loadDir = useCallback(async (p) => {
    if (!device) return;
    setLoading(true);
    setSelected(null);
    try {
      const files = await getFiles(p);
      if (Array.isArray(files)) {
        setItems(files.map(f => {
          const name = typeof f === 'string' ? f : f.name;
          const isDir = typeof f === 'object' ? f.isDir : !name.includes('.');
          const size = typeof f === 'object' ? (f.size || 0) : 0;
          return { name, isDir, size, icon: getFileIcon(name, isDir) };
        }));
      }
    } catch (e) { showToast('加载失败: ' + e.message, 'error'); }
    setLoading(false);
  }, [device, getFiles]);

  useEffect(() => {
    if (device) loadDir(currentPath);
    else { setItems([]); setCurrentPath('/sdcard/'); setHistory(['/sdcard/']); }
  }, [device]);

  const navigate = (item) => {
    if (!item.isDir) return;
    const newPath = currentPath + item.name + '/';
    setHistory(h => [...h, newPath]);
    setCurrentPath(newPath);
    loadDir(newPath);
  };

  const goUp = () => {
    if (history.length <= 1) return;
    const newHistory = history.slice(0, -1);
    const newPath = newHistory[newHistory.length - 1];
    setHistory(newHistory);
    setCurrentPath(newPath);
    loadDir(newPath);
  };

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(item);
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const handleAction = async (key) => {
    if (!contextMenu?.item) return;
    const item = contextMenu.item;
    const fullPath = currentPath + item.name;

    if (key === 'copy') { setClipboard({ item, op: 'copy', fromPath: fullPath }); showToast(`已复制: ${item.name}`, 'info'); }
    if (key === 'cut')  { setClipboard({ item, op: 'cut',  fromPath: fullPath }); showToast(`已剪切: ${item.name}`, 'info'); }
    if (key === 'rename') setDialog('rename');
    if (key === 'delete') setDialog('delete');
    if (key === 'download') handleDownload(item, fullPath);
    if (key === 'install') handleInstallApk(item, fullPath);
  };

  const handleDelete = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await deleteFile(currentPath + selected.name);
      showToast(`✅ 已删除: ${selected.name}`, 'success');
      setSelected(null);
      await loadDir(currentPath);
    } catch (e) { showToast('删除失败: ' + e.message, 'error'); }
    setBusy(false);
    setDialog(null);
  };

  const handleRename = async (newName) => {
    if (!selected || !newName.trim() || newName === selected.name) { setDialog(null); return; }
    setBusy(true);
    try {
      await renameFile(currentPath + selected.name, currentPath + newName.trim());
      showToast(`✅ 已重命名为: ${newName.trim()}`, 'success');
      await loadDir(currentPath);
    } catch (e) { showToast('重命名失败: ' + e.message, 'error'); }
    setBusy(false);
    setDialog(null);
  };

  const handlePaste = async () => {
    if (!clipboard) return;
    setBusy(true);
    const destPath = currentPath + clipboard.item.name;
    try {
      await copyFile(clipboard.fromPath, destPath);
      if (clipboard.op === 'cut') await deleteFile(clipboard.fromPath);
      showToast(`✅ 已${clipboard.op === 'cut' ? '移动' : '复制'}: ${clipboard.item.name}`, 'success');
      setClipboard(null);
      await loadDir(currentPath);
    } catch (e) { showToast('粘贴失败: ' + e.message, 'error'); }
    setBusy(false);
  };

  const handleNewFolder = async (name) => {
    setBusy(true);
    try {
      await makeDir(currentPath + name.trim());
      showToast(`✅ 文件夹已创建: ${name}`, 'success');
      await loadDir(currentPath);
    } catch (e) { showToast('创建失败: ' + e.message, 'error'); }
    setBusy(false);
    setDialog(null);
  };

  const handleDownload = async (item, fullPath) => {
    try {
      const savePath = await save({ defaultPath: item.name });
      if (!savePath) return;
      setBusy(true);
      showToast('⏳ 正在下载...', 'info');
      await pullFile(fullPath, savePath);
      showToast(`✅ 已保存到: ${savePath}`, 'success');
    } catch (e) { showToast('下载失败: ' + e.message, 'error'); }
    setBusy(false);
  };

  const handleUpload = async () => {
    try {
      const selectedFile = await openDialog({
        multiple: false,
        directory: false,
      });
      if (!selectedFile) return;

      setBusy(true);
      showToast('⏳ 正在上传...', 'info');
      
      const fileName = selectedFile.split(/[\\/]/).pop();
      await pushFile(selectedFile, currentPath + fileName);
      showToast(`✅ 上传完成: ${fileName}`, 'success');
      await loadDir(currentPath);
    } catch (e) { 
      showToast('上传失败: ' + e.message, 'error'); 
    } finally {
      setBusy(false);
    }
  };

  const handleInstallApk = async (item, fullPath) => {
    setBusy(true);
    showToast('⏳ 正在安装 APK，请稍候...', 'info');
    try {
      const result = await installAPKRemote(fullPath);
      if (result?.success) showToast(`✅ APK 安装成功！`, 'success');
      else showToast('安装失败: ' + (result?.result || result?.error || '未知错误'), 'error');
    } catch (e) { showToast('安装失败: ' + e.message, 'error'); }
    setBusy(false);
  };

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  if (!device) {
    return (
      <div className="glass-card" style={{ height:'500px', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:20 }}>
        <span style={{ fontSize:64 }}>📁</span>
        <h3 style={{ fontSize:20, color:'var(--text-main)' }}>文件管理器</h3>
        <p style={{ color:'var(--text-muted)', fontSize:14 }}>连接设备后即可浏览和管理文件</p>
      </div>
    );
  }

  const dirs = items.filter(i => i.isDir);
  const files = items.filter(i => !i.isDir);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeIn 0.5s ease' }}
      onClick={() => setContextMenu(null)}>

      {/* Toolbar */}
      <div className="glass-card" style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 18px', flexWrap:'wrap' }}>
        <button className="btn btn-outline" onClick={goUp} disabled={history.length <= 1 || busy} style={{ fontSize:13, padding:'7px 14px' }}>⬆ 上级</button>
        <button className="btn btn-outline" onClick={() => loadDir(currentPath)} disabled={busy} style={{ fontSize:13, padding:'7px 14px' }}>🔄 刷新</button>
        <button className="btn btn-outline" onClick={() => setDialog('newfolder')} disabled={busy} style={{ fontSize:13, padding:'7px 14px' }}>📁+ 新建文件夹</button>
        <button className="btn btn-outline" onClick={handleUpload} disabled={busy} style={{ fontSize:13, padding:'7px 14px' }}>📤 上传文件</button>
        {clipboard && (
          <button onClick={handlePaste} disabled={busy} style={{ fontSize:13, padding:'7px 14px', background:'rgba(123,45,255,0.2)', border:'1px solid #7b2dff', borderRadius:8, color:'#c4b5fd', cursor:'pointer', fontWeight:700 }}>
            📋 粘贴 ({clipboard.op === 'cut' ? '移动' : '复制'}) {clipboard.item.name}
          </button>
        )}
        {/* Input removed as we use native dialog */}

        {/* Breadcrumb */}
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:4, padding:'7px 14px', background:'rgba(0,0,0,0.3)', borderRadius:8, fontFamily:'monospace', fontSize:13, color:'var(--neon-cyan)', minWidth:0, overflowX:'auto' }}>
          <span style={{ cursor:'pointer', flexShrink:0 }} onClick={() => { setCurrentPath('/sdcard/'); setHistory(['/sdcard/']); loadDir('/sdcard/'); }}>/</span>
          {breadcrumbs.map((seg, i) => {
            const path = '/' + breadcrumbs.slice(0, i+1).join('/') + '/';
            return (
              <React.Fragment key={i}>
                <span style={{ opacity:0.4, flexShrink:0 }}>/</span>
                <span onClick={() => { setCurrentPath(path); setHistory(h => [...h, path]); loadDir(path); }}
                  style={{ cursor:'pointer', flexShrink:0, whiteSpace:'nowrap' }}
                  onMouseEnter={e => e.currentTarget.style.color='#fff'}
                  onMouseLeave={e => e.currentTarget.style.color=''}>{seg}</span>
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{dirs.length} 夹 · {files.length} 文件</div>
      </div>

      {/* File List */}
      {loading ? (
        <div className="glass-card" style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
          <p style={{ fontSize:36 }}>⏳</p><p style={{ fontSize:14, marginTop:12 }}>加载中...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card" style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
          <p style={{ fontSize:36 }}>📭</p><p style={{ fontSize:14, marginTop:12 }}>空目录</p>
        </div>
      ) : (
        <div className="glass-card" style={{ padding:0, overflow:'hidden' }}>
          {/* Header */}
          <div style={{ display:'grid', gridTemplateColumns:'36px 1fr 90px 80px 32px', gap:8, padding:'10px 18px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px' }}>
            <span></span><span>名称</span><span>类型</span><span style={{ textAlign:'right' }}>大小</span><span></span>
          </div>

          <div style={{ maxHeight:'calc(100vh - 340px)', overflowY:'auto' }}>
            {/* Dirs */}
            {dirs.map((item, i) => (
              <div key={`d-${i}`}
                onDoubleClick={() => navigate(item)}
                onClick={() => setSelected(item)}
                onContextMenu={e => handleContextMenu(e, item)}
                style={{ display:'grid', gridTemplateColumns:'36px 1fr 90px 80px 32px', gap:8,
                  padding:'9px 18px', cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,0.03)',
                  background: selected?.name === item.name ? 'rgba(0,240,255,0.07)' : 'transparent',
                  transition:'background 0.12s', alignItems:'center', fontSize:13 }}
                onMouseEnter={e => { if (selected?.name !== item.name) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (selected?.name !== item.name) e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ fontSize:20 }}>📁</span>
                <span style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--neon-cyan)' }}>{item.name}</span>
                <span style={{ color:'var(--text-muted)', fontSize:11 }}>文件夹</span>
                <span></span>
                <span style={{ color:'var(--text-muted)', fontSize:16, cursor:'pointer' }} onClick={e => handleContextMenu(e, item)}>⋮</span>
              </div>
            ))}

            {/* Files */}
            {files.map((item, i) => {
              const isApk = item.name.toLowerCase().endsWith('.apk');
              return (
                <div key={`f-${i}`}
                  onClick={() => setSelected(item)}
                  onContextMenu={e => handleContextMenu(e, item)}
                  style={{ display:'grid', gridTemplateColumns:'36px 1fr 90px 80px 32px', gap:8,
                    padding:'9px 18px', cursor:'context-menu', borderBottom:'1px solid rgba(255,255,255,0.03)',
                    background: selected?.name === item.name ? 'rgba(123,45,255,0.08)' : 'transparent',
                    transition:'background 0.12s', alignItems:'center', fontSize:13 }}
                  onMouseEnter={e => { if (selected?.name !== item.name) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                  onMouseLeave={e => { if (selected?.name !== item.name) e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ fontSize:18 }}>{item.icon}</span>
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: isApk ? '#a78bfa' : 'var(--text-main)', fontWeight: isApk ? 700 : 400 }}>{item.name}</span>
                  <span style={{ color:'var(--text-muted)', fontSize:11 }}>{item.name.includes('.') ? item.name.split('.').pop().toUpperCase() : '--'}</span>
                  <span style={{ textAlign:'right', color:'var(--text-muted)', fontSize:11 }}>{formatSize(item.size)}</span>
                  <span style={{ color:'var(--text-muted)', fontSize:16, cursor:'pointer' }} onClick={e => handleContextMenu(e, item)}>⋮</span>
                </div>
              );
            })}
          </div>

          <div style={{ padding:'10px 18px', borderTop:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)', display:'flex', justifyContent:'space-between' }}>
            <span>{dirs.length} 个文件夹，{files.length} 个文件</span>
            <span style={{ fontSize:11, opacity:0.6 }}>双击打开文件夹 · 右键操作文件</span>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} item={contextMenu.item}
          onClose={() => setContextMenu(null)}
          onAction={handleAction} />
      )}

      {/* Dialogs */}
      {dialog === 'delete' && selected && (
        <ConfirmDialog msg={`确定要删除「${selected.name}」吗？此操作不可恢复！`}
          onYes={handleDelete} onNo={() => setDialog(null)} />
      )}
      {dialog === 'rename' && selected && (
        <RenameDialog item={selected} onConfirm={handleRename} onCancel={() => setDialog(null)} />
      )}
      {dialog === 'newfolder' && (
        <NewFolderDialog onConfirm={handleNewFolder} onCancel={() => setDialog(null)} />
      )}

      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
};

export default FileManager;

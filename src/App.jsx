import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import AppManager from './pages/AppManager';
import Log from './pages/Log';
import FileManager from './pages/FileManager';
import RemoteControl from './pages/RemoteControl';
import Help from './pages/Help';
import { useVirus } from './context/VirusContext';
import { openExternal } from './utils/shell';
import './index.css';

const SHOP_URL = 'https://shopee.com.my/shop/146154950';
const TIKTOK_URL = 'https://www.tiktok.com/@bavenyang?_r=1&_t=ZS-96Mu2A5wTzM';
const SPLASH_SECONDS = 10;

function SplashScreen({ onSkip }) {
  const [countdown, setCountdown] = useState(SPLASH_SECONDS);
  const onSkipRef = useRef(onSkip);

  useEffect(() => {
    onSkipRef.current = onSkip;
  }, [onSkip]);

  useEffect(() => {
    if (countdown <= 0) { onSkipRef.current(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  return (
    <div className="splash-screen" style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'linear-gradient(135deg, #050510 0%, #0a1628 50%, #050510 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {/* Animated background particles */}
      <div className="splash-particles" />

      <div style={{ marginBottom: '30px', animation: 'splashFadeIn 0.8s ease' }}>
        <h1 style={{ fontSize: '36px', fontWeight: '800', fontFamily: "'Orbitron', monospace", letterSpacing: '3px', color: 'var(--neon-cyan)', textShadow: '0 0 30px rgba(0,240,255,0.5), 0 0 60px rgba(0,240,255,0.2)' }}>
          ERS Tech <span style={{ fontSize: '20px', color: 'var(--neon-green)' }}>AV Killer</span>
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '2px', textAlign: 'center' }}>Android 恶意软件检测与清除工具</p>
      </div>

      <div style={{ display: 'flex', gap: '24px', marginBottom: '30px', animation: 'splashFadeIn 1s ease 0.2s both' }}>
        <a onClick={(e) => { e.preventDefault(); openExternal(SHOP_URL); }} style={{ textDecoration: 'none' }}>
          <div className="splash-card splash-card-shopee">
            <p style={{ fontSize: '30px', marginBottom: '10px' }}>🛒</p>
            <p style={{ fontSize: '22px', color: '#ff4a00', fontWeight: '800', marginBottom: '6px' }}>Shopee 商店</p>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>手机配件 · 维修工具</p>
            <p style={{ fontSize: '12px', color: '#ff4a00', marginTop: '8px', fontWeight: '600' }}>点击前往选购 →</p>
          </div>
        </a>
        <a onClick={(e) => { e.preventDefault(); openExternal(TIKTOK_URL); }} style={{ textDecoration: 'none' }}>
          <div className="splash-card splash-card-tiktok">
            <p style={{ fontSize: '30px', marginBottom: '10px' }}>🎵</p>
            <p style={{ fontSize: '22px', color: '#fe2c55', fontWeight: '800', marginBottom: '6px' }}>TikTok 商店</p>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>短视频 · 热门商品</p>
            <p style={{ fontSize: '12px', color: '#fe2c55', marginTop: '8px', fontWeight: '600' }}>点击前往选购 →</p>
          </div>
        </a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', animation: 'splashFadeIn 1s ease 0.4s both' }}>
        <button onClick={onSkip} className="splash-enter-btn">进入软件</button>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{countdown} 秒后自动进入</span>
      </div>
    </div>
  );
}

function TitleBar({ appVersion }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const windowRef = useRef(null);

  useEffect(() => {
    let unlisten = null;
    (async () => {
      try {
        const electron = window.electronAPI;
        if (electron) {
          setIsMaximized(await electron.isMaximized());
          unlisten = electron.onMaximizedChanged?.(setIsMaximized);
          return;
        }
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        windowRef.current = win;
        setIsMaximized(await win.isMaximized());
        
        unlisten = await win.onResized(async () => {
          setIsMaximized(await win.isMaximized());
        });
      } catch {
        windowRef.current = null;
      }
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);
  
  const handleDrag = async (e) => {
    if (e.button === 0) { // Left click
      if (windowRef.current) {
        try {
          await windowRef.current.startDragging();
        } catch (err) {
          console.error('Failed to drag window natively:', err);
        }
      }
    }
  };

  const handleMinimize = async () => {
    const electron = window.electronAPI;
    if (electron) electron.minimize();
    else if (windowRef.current) await windowRef.current.minimize();
  };
  const handleMaximize = async () => {
    const electron = window.electronAPI;
    if (electron) electron.maximize();
    else if (windowRef.current) await windowRef.current.toggleMaximize();
  };
  const handleClose = async () => {
    const electron = window.electronAPI;
    if (electron) electron.close();
    else if (windowRef.current) await windowRef.current.close();
  };

  return (
    <div className="titlebar">
      <div className="titlebar-drag" data-tauri-drag-region onDoubleClick={handleMaximize} onPointerDown={handleDrag}>
        <span className="titlebar-title">🔧 ERS Tech AV Killer {appVersion ? `V${appVersion}` : ""}</span>
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-btn titlebar-minimize" onClick={handleMinimize} title="最小化">―</button>
        <button className="titlebar-btn titlebar-maximize" onClick={handleMaximize} title={isMaximized ? '还原' : '最大化'}>{isMaximized ? '❐' : '□'}</button>
        <button className="titlebar-btn titlebar-close" onClick={handleClose} title="关闭">✕</button>
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [appVersion, setAppVersion] = useState('');
  const [showSplash, setShowSplash] = useState(true);
  const [pageTransition, setPageTransition] = useState(false);
  const { device, waitingAuth, disconnectDevice, refreshDevices, resetADB, installDriver, isAdmin, setAdminMode, setGuestMode, verifyPassword, hasAdminPassword, changeAdminPassword, resetAdminPassword } = useVirus();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showChangePassDialog, setShowChangePassDialog] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmNewPass, setConfirmNewPass] = useState('');
  const [passError, setPassError] = useState('');

  
  const [isLocked, setIsLocked] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loginMode, setLoginMode] = useState('key');
  const [loginKey, setLoginKey] = useState('');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
    invoke('check_auth_status').then((status) => {
      setIsLocked(!status);
      setCheckingAuth(false);
    }).catch(() => {
      setIsLocked(true);
      setCheckingAuth(false);
    });
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError('');
    try {
      let payload = {};
      if (loginMode === 'key') {
        if (!loginKey) { setLoginError('请输入激活码'); setIsLoggingIn(false); return; }
        payload = { key: loginKey, username: null, password: null };
      } else {
        if (!loginUser || !loginPass) { setLoginError('请输入账号和密码'); setIsLoggingIn(false); return; }
        payload = { username: loginUser, password: loginPass, key: null };
      }
      const success = await invoke('verify_license', payload);
      if (success) {
        setIsLocked(false);
      }
    } catch (err) {
      setLoginError(err.toString());
    }
    setIsLoggingIn(false);
  };

  const isWireless = device?.id?.includes('_tcp') || device?.id?.includes(':');


  const handleSkipSplash = useCallback(() => setShowSplash(false), []);

  const handleTabChange = useCallback((tab) => {
    if (tab === activeTab) return;
    setPageTransition(true);
    setTimeout(() => {
      setActiveTab(tab);
      setPageTransition(false);
    }, 150);
  }, [activeTab]);

  const contentClass = `page-content ${pageTransition ? 'page-exit' : 'page-enter'}`;


  if (showSplash) return <SplashScreen onSkip={handleSkipSplash} />;

  if (checkingAuth) {
    return <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TitleBar appVersion={appVersion} />
      <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #050510 0%, #0a1628 50%, #050510 100%)'}}>
        <p style={{color: 'var(--neon-cyan)', fontSize: '18px', fontWeight: 'bold', animation: 'splashFadeIn 1s infinite alternate'}}>正在验证安全授权...</p>
      </div>
    </div>;
  }

  if (isLocked) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <TitleBar appVersion={appVersion} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyItems: 'center', background: 'linear-gradient(135deg, #050510 0%, #0a1628 50%, #050510 100%)', justifyContent: 'center' }}>
          <div className="glass-card" style={{ width: '400px', border: '1px solid var(--neon-cyan)', textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>🛡️</div>
            <h1 style={{ fontSize: '28px', fontWeight: '800', fontFamily: "'Orbitron', monospace", color: 'var(--neon-cyan)', marginBottom: '5px', textShadow: '0 0 10px rgba(0,240,255,0.4)' }}>ERS Tech</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '30px', fontSize: '14px', letterSpacing: '1px' }}>Android 恶意软件清理专家 - 安全授权系统</p>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: 'center' }}>
              <button className={`btn ${loginMode === 'key' ? 'btn-primary' : 'btn-outline'}`} style={{flex:1}} onClick={() => {setLoginMode('key'); setLoginError('');}}>卡密激活</button>
              <button className={`btn ${loginMode === 'account' ? 'btn-primary' : 'btn-outline'}`} style={{flex:1}} onClick={() => {setLoginMode('account'); setLoginError('');}}>账号登录</button>
            </div>

            {loginMode === 'key' ? (
              <input type="text" className="dialog-input" style={{ marginBottom: '15px', textAlign: 'center' }} placeholder="输入您的授权卡密" value={loginKey} onChange={e => setLoginKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            ) : (
              <>
                <input type="text" className="dialog-input" style={{ marginBottom: '15px', textAlign: 'center' }} placeholder="登录账号" value={loginUser} onChange={e => setLoginUser(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                <input type="password" className="dialog-input" style={{ marginBottom: '15px', textAlign: 'center' }} placeholder="登录密码" value={loginPass} onChange={e => setLoginPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              </>
            )}

            {loginError && <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '15px', background: 'rgba(239,68,68,0.1)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.3)' }}>{loginError}</p>}
            
            <button className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '15px', fontWeight: 'bold' }} onClick={handleLogin} disabled={isLoggingIn}>
              {isLoggingIn ? '正在验证并连接服务器...' : '解 锁 软 件'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (

    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Custom Title Bar */}
      <TitleBar appVersion={appVersion} />

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar activeTab={activeTab} setActiveTab={handleTabChange} appVersion={appVersion} />
        <main style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
          <header className="app-header">
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '800', fontFamily: "'Orbitron', monospace", letterSpacing: '1px' }}>
                <span style={{ color: 'var(--neon-cyan)', textShadow: '0 0 10px rgba(0,240,255,0.4)' }}>ERS</span>
                <span style={{ color: 'var(--text-main)', marginLeft: '6px' }}>Tech</span>
                <span style={{ fontSize: '13px', color: 'var(--neon-green)', marginLeft: '10px', fontFamily: "'Rajdhani', sans-serif", fontWeight: '600', letterSpacing: '2px' }}>AV Killer</span>
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '1px' }}>Android 恶意软件检测与清除工具</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'nowrap' }}>
              {isAdmin ? (
                <>
                  <div className="status-badge status-badge-admin" style={{ fontSize: '11px', padding: '4px 10px' }}>🔑 管理员</div>
                  <button onClick={() => setShowChangePassDialog(true)} className="btn btn-outline" style={{ fontSize: '11px', padding: '4px 10px', borderColor: 'rgba(0,240,255,0.3)' }}>修改密码</button>
                  <button onClick={setGuestMode} className="btn btn-outline" style={{ fontSize: '11px', padding: '4px 10px' }}>切换为客人</button>
                </>
              ) : (
                <>
                  <div className="status-badge status-badge-guest" style={{ fontSize: '11px', padding: '4px 10px' }}>👤 访客</div>
                  <button onClick={() => setShowPasswordDialog(true)} className="btn btn-outline" style={{ fontSize: '11px', padding: '4px 10px' }}>🔑 切换为管理员</button>
                </>
              )}
              {device ? (
                <>
                  <div className="device-status device-connected" style={{ fontSize: '11px', padding: '4px 10px' }}>
                    <span className="status-dot status-dot-online" />
                    {device.id} {isWireless ? '(无线)' : '(USB)'}
                  </div>
                  <div className="btn btn-danger" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={disconnectDevice}>断开</div>
                  <div className="btn btn-danger" style={{ fontSize: '11px', padding: '4px 10px', background: '#991b1b' }} onClick={resetADB}>重置ADB</div>
                </>
              ) : waitingAuth ? (
                <>
                  <div className="device-status device-auth-waiting" style={{ fontSize: '11px', padding: '4px 10px' }}>
                    <span className="status-dot status-dot-waiting" />
                    手机上请点"允许USB调试"
                  </div>
                  <div className="btn btn-danger" style={{ fontSize: '11px', padding: '4px 10px', background: '#991b1b' }} onClick={resetADB}>重置ADB</div>
                </>
              ) : (
                <>
                  <div className="device-status device-disconnected" style={{ fontSize: '11px', padding: '4px 10px' }}>
                    <span className="status-dot status-dot-offline" />
                    等待连接...
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={refreshDevices}>🔄 扫描连接</button>
                  <div className="btn btn-outline btn-install-driver" onClick={async () => { await installDriver(); refreshDevices(); }} title="以管理员身份运行才能安装驱动" style={{ fontSize: '11px', padding: '4px 10px' }}>
                    ⚙ 装驱动
                  </div>
                </>
              )}
            </div>
          </header>
          <div className={contentClass}>
            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'app-manager' && <AppManager />}
            {activeTab === 'file-manager' && <FileManager />}
            {activeTab === 'remote-control' && <RemoteControl />}
            {activeTab === 'log' && <Log />}
            {activeTab === 'help' && <Help />}
          </div>
        </main>
      </div>

      {/* Login Dialog */}
      {showPasswordDialog && (
        <div className="dialog-overlay">
          <div className="glass-card dialog-card" style={{ width: '380px', border: '1px solid var(--neon-cyan)' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>🔐</div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '10px' }}>{hasAdminPassword() ? '管理员登录' : '设置管理员密码'}</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '13px' }}>{hasAdminPassword() ? '请输入管理员密码' : '首次使用，请设置密码'}</p>
            <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') {
                if (!hasAdminPassword()) { setOldPass(''); setNewPass(''); setConfirmNewPass(''); setPassError(''); setShowPasswordDialog(false); setShowChangePassDialog(true); return; }
                if (verifyPassword(passwordInput)) { setAdminMode(); setShowPasswordDialog(false); setPasswordInput(''); }
                else { setPassError('密码错误'); }
              }}}
              autoFocus className="dialog-input" placeholder="输入密码" />
            {passError && <p style={{ color: 'var(--accent-danger)', fontSize: '12px', marginBottom: '10px' }}>{passError}</p>}
            {passError && <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <span onClick={() => { resetAdminPassword(); setAdminMode(); setShowPasswordDialog(false); setPasswordInput(''); setPassError(''); }} style={{ color: 'var(--neon-cyan)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', opacity: 0.7 }}>忘记密码？点击重置为 admin888</span>
            </div>}
            <div className="dialog-actions">
              <button className="btn btn-outline" style={{ padding: '10px 24px' }} onClick={() => { setShowPasswordDialog(false); setPasswordInput(''); setPassError(''); }}>取消</button>
              <button className="btn btn-primary" style={{ padding: '10px 24px' }} onClick={() => {
                if (!hasAdminPassword()) { setOldPass(''); setNewPass(''); setConfirmNewPass(''); setPassError(''); setShowPasswordDialog(false); setShowChangePassDialog(true); return; }
                if (verifyPassword(passwordInput)) { setAdminMode(); setShowPasswordDialog(false); setPasswordInput(''); }
                else { setPassError('密码错误'); }
              }}>确认</button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Dialog */}
      {showChangePassDialog && (
        <div className="dialog-overlay">
          <div className="glass-card dialog-card" style={{ width: '400px', border: '1px solid var(--neon-cyan)' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>{isAdmin ? '🔑' : '🔐'}</div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '10px' }}>{isAdmin ? '修改密码' : '设置管理员密码'}</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '13px' }}>{isAdmin ? '输入旧密码和新密码' : '请设置管理员密码（至少4位）'}</p>

            {isAdmin && (
              <input type="password" value={oldPass} onChange={e => setOldPass(e.target.value)}
                className="dialog-input" placeholder="旧密码" />
            )}
            <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
              className="dialog-input" placeholder="新密码（至少4位）" />
            <input type="password" value={confirmNewPass} onChange={e => setConfirmNewPass(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') {
                if (newPass !== confirmNewPass) { setPassError('两次密码不一致'); return; }
                if (!newPass || newPass.length < 4) { setPassError('密码至少4位'); return; }
                const result = changeAdminPassword(isAdmin ? oldPass : 'any', newPass);
                if (result.success) {
                  if (!isAdmin) setAdminMode();
                  setShowChangePassDialog(false); setOldPass(''); setNewPass(''); setConfirmNewPass(''); setPassError('');
                } else { setPassError(result.message); }
              }}}
              className="dialog-input" placeholder="确认新密码" />
            {passError && <p style={{ color: 'var(--accent-danger)', fontSize: '12px', marginBottom: '10px' }}>{passError}</p>}
            <div className="dialog-actions">
              <button className="btn btn-outline" style={{ padding: '10px 24px' }} onClick={() => { setShowChangePassDialog(false); setOldPass(''); setNewPass(''); setConfirmNewPass(''); setPassError(''); }}>取消</button>
              <button className="btn btn-primary" style={{ padding: '10px 24px' }} onClick={() => {
                if (newPass !== confirmNewPass) { setPassError('两次密码不一致'); return; }
                if (!newPass || newPass.length < 4) { setPassError('密码至少4位'); return; }
                const result = changeAdminPassword(isAdmin ? oldPass : 'any', newPass);
                if (result.success) {
                  if (!isAdmin) setAdminMode();
                  setShowChangePassDialog(false); setOldPass(''); setNewPass(''); setConfirmNewPass(''); setPassError('');
                } else { setPassError(result.message); }
              }}>确认</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

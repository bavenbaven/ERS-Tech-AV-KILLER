import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import invoke
content = content.replace("import { useState, useEffect, useRef, useCallback } from 'react';", 
"import { useState, useEffect, useRef, useCallback } from 'react';\nimport { invoke } from '@tauri-apps/api/core';")

# Inject states and logic
states_logic = """
  const [isLocked, setIsLocked] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loginMode, setLoginMode] = useState('key');
  const [loginKey, setLoginKey] = useState('');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
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
"""
content = content.replace("const isWireless = device?.id?.includes('_tcp') || device?.id?.includes(':');", states_logic)

# Inject rendering
render_logic = """
  if (showSplash) return <SplashScreen onSkip={handleSkipSplash} />;

  if (checkingAuth) {
    return <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TitleBar />
      <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #050510 0%, #0a1628 50%, #050510 100%)'}}>
        <p style={{color: 'var(--neon-cyan)', fontSize: '18px', fontWeight: 'bold', animation: 'splashFadeIn 1s infinite alternate'}}>正在验证安全授权...</p>
      </div>
    </div>;
  }

  if (isLocked) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <TitleBar />
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
"""

content = content.replace("""  if (showSplash) return <SplashScreen onSkip={handleSkipSplash} />;

  return (""", render_logic)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

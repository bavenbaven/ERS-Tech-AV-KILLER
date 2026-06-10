import { useState, useRef, useEffect, useCallback } from 'react';
import { useVirus } from '../context/VirusContext';

const ControlBtn = ({ onClick, children, style: extraStyle }) => (
  <button className="btn btn-outline control-btn" onClick={onClick} style={{ padding: '12px 8px', fontSize: '14px', ...extraStyle }}>{children}</button>
);

const RemoteControl = () => {
  const { device, sendCommand, getScreenshot } = useVirus();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [shellInput, setShellInput] = useState('');
  const [cmdOutput, setCmdOutput] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(2000);
  const [screenSize, setScreenSize] = useState({ w: 1080, h: 2400 });
  const [fps, setFps] = useState(0);
  const [hasFrame, setHasFrame] = useState(false);
  const canvasRef = useRef(null);
  const fpsCountRef = useRef(0);
  const lastFpsTimeRef = useRef(0);

  // Get screen resolution once
  useEffect(() => {
    if (!device) return;
    (async () => {
      try {
        const res = await sendCommand('wm size');
        const match = (res?.output || '').match(/(\d+)x(\d+)/);
        if (match) setScreenSize({ w: parseInt(match[1]), h: parseInt(match[2]) });
      } catch {
        setScreenSize({ w: 1080, h: 2400 });
      }
    })();
  }, [device, sendCommand]);

  // FPS counter
  useEffect(() => {
    lastFpsTimeRef.current = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastFpsTimeRef.current) / 1000;
      if (elapsed > 0) {
        setFps(Math.round(fpsCountRef.current / elapsed));
        fpsCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const isFetchingRef = useRef(false);

  const drawFrame = useCallback((imgSrc) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      // Set canvas to match image dimensions (maintains aspect ratio via CSS)
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      fpsCountRef.current++;
      setHasFrame(true);
      // Revoke blob URL if applicable
      if (typeof imgSrc === 'string' && imgSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imgSrc);
      }
    };
    img.onerror = () => {
      if (typeof imgSrc === 'string' && imgSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imgSrc);
      }
    };
    img.src = imgSrc;
  }, []);

  const takeScreenshot = useCallback(async () => {
    if (!device || isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const result = await getScreenshot();
      if (result) {
        let url;
        if (result instanceof Blob) {
          url = URL.createObjectURL(result);
        } else {
          url = result; // data URI
        }
        drawFrame(url);
      }
    } catch (e) {
      console.error('Screenshot error:', e);
    } finally {
      isFetchingRef.current = false;
    }
  }, [device, getScreenshot, drawFrame]);

  // Auto take first screenshot
  useEffect(() => { if (device) takeScreenshot(); }, [device, takeScreenshot]);

  // Auto-refresh loop
  useEffect(() => {
    let timer = null;
    const loop = async () => {
      if (autoRefresh && device) {
        await takeScreenshot();
        timer = setTimeout(loop, refreshInterval);
      }
    };
    if (autoRefresh && device) {
      loop();
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [autoRefresh, refreshInterval, device, takeScreenshot]);

  const runCmd = useCallback(async (command) => {
    if (!device) return '';
    const result = await sendCommand(command);
    return result?.output || '';
  }, [device, sendCommand]);

  // Handle click on canvas → send tap to phone
  const handleCanvasClick = useCallback(async (e) => {
    if (!device || autoRefresh) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = screenSize.w / rect.width;
    const scaleY = screenSize.h / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    await runCmd(`input tap ${x} ${y}`);
    setTimeout(takeScreenshot, 400);
  }, [device, autoRefresh, screenSize, takeScreenshot, runCmd]);

  // Swipe using real screen coordinates
  const handleSwipe = async (x1, y1, x2, y2, dur = 400) => {
    await runCmd(`input swipe ${x1} ${y1} ${x2} ${y2} ${dur}`);
    setTimeout(takeScreenshot, 500);
  };

  const handleKey = async (code) => {
    await runCmd(`input keyevent ${code}`);
    setTimeout(takeScreenshot, 400);
  };

  const handleSendText = async () => {
    if (!textInput.trim()) return;
    await runCmd(`input text "${textInput.replace(/"/g, '\\"').replace(/ /g, '%s')}"`);
    setCmdOutput(`已发送: ${textInput}`);
    setTextInput('');
    setTimeout(takeScreenshot, 400);
  };

  const handleSendCommand = async () => {
    if (!shellInput.trim()) return;
    const result = await runCmd(shellInput);
    setCmdOutput(result || 'OK');
    setShellInput('');
  };

  if (!device) {
    return (
      <div className="page-content page-enter" style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div className="glass-card" style={{ display: 'inline-block', padding: '60px 80px' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px', filter: 'drop-shadow(0 0 20px rgba(0,240,255,0.3))' }}>📱</div>
          <h3 style={{ fontSize: '20px', color: 'var(--text-main)', marginBottom: '10px' }}>屏幕镜像与控制</h3>
          <p style={{ color: 'var(--text-muted)' }}>请先连接设备</p>
        </div>
      </div>
    );
  }

  const midX = Math.floor(screenSize.w / 2);
  const midY = Math.floor(screenSize.h / 2);
  const topThird = Math.floor(screenSize.h * 0.3);
  const botThird = Math.floor(screenSize.h * 0.7);
  const leftThird = Math.floor(screenSize.w * 0.3);
  const rightThird = Math.floor(screenSize.w * 0.7);

  return (
    <div className="page-content page-enter" style={{ display: 'flex', gap: '30px', alignItems: 'flex-start' }}>
      {/* Phone Screen - 3D Frame */}
      <div className="phone-frame-wrapper">
        <div className="phone-frame">
          {/* Notch */}
          <div className="phone-notch" />
          {/* Screen */}
          <div className="phone-screen" onClick={handleCanvasClick}>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: hasFrame ? 'block' : 'none' }}
            />
            {!hasFrame && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#444' }}>
                <div style={{ fontSize: '40px' }}>📱</div>
                <p style={{ fontSize: '14px', marginTop: '10px' }}>点击截屏</p>
              </div>
            )}
          </div>
          {/* Home button indicator */}
          <div className="phone-home-bar" />
        </div>
        <div style={{ textAlign: 'center', marginTop: '8px', display: 'flex', justifyContent: 'center', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{screenSize.w}×{screenSize.h}</span>
          {autoRefresh && (
            <span style={{ fontSize: '11px', color: 'var(--neon-green)', fontFamily: "'Orbitron', monospace", fontWeight: 700 }}>
              {fps} FPS
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '18px', minWidth: '400px' }}>
        {/* Header with auto-refresh toggle */}
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', flex: 1, fontFamily: "'Orbitron', monospace", color: 'var(--neon-cyan)' }}>📱 MIRROR</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-main)' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--neon-cyan)' }} />
            自动刷新
          </label>
          {autoRefresh && (
            <select value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))} className="refresh-select">
              <option value={500}>0.5秒</option>
              <option value={1000}>1秒</option>
              <option value={2000}>2秒</option>
              <option value={3000}>3秒</option>
              <option value={5000}>5秒</option>
            </select>
          )}
          <button className="btn btn-primary" onClick={takeScreenshot} style={{ background: 'var(--neon-cyan)', color: '#000', padding: '8px 16px', fontSize: '13px' }}>
            📸 截屏
          </button>
        </div>

        {/* Navigation */}
        <div className="control-section">
          <p className="control-label">导航</p>
          <div className="control-grid-4">
            <ControlBtn onClick={() => handleKey(3)}>🏠 主页</ControlBtn>
            <ControlBtn onClick={() => handleKey(4)}>⬅ 返回</ControlBtn>
            <ControlBtn onClick={() => handleKey(187)}>📋 最近</ControlBtn>
            <ControlBtn onClick={() => handleKey(82)}>📋 菜单</ControlBtn>
          </div>
        </div>

        {/* Volume & Power */}
        <div className="control-section">
          <p className="control-label">控制</p>
          <div className="control-grid-4">
            <ControlBtn onClick={() => handleKey(24)}>🔊 +</ControlBtn>
            <ControlBtn onClick={() => handleKey(25)}>🔉 -</ControlBtn>
            <ControlBtn onClick={() => handleKey(26)}>⚡ 电源</ControlBtn>
            <ControlBtn onClick={() => handleKey(27)}>📷 拍照</ControlBtn>
          </div>
        </div>

        {/* Swipe */}
        <div className="control-section">
          <p className="control-label">滑动手势</p>
          <div className="control-grid-4">
            <ControlBtn onClick={() => handleSwipe(midX, botThird, midX, topThird, 500)}>👆 上滑</ControlBtn>
            <ControlBtn onClick={() => handleSwipe(midX, topThird, midX, botThird, 500)}>👇 下滑</ControlBtn>
            <ControlBtn onClick={() => handleSwipe(rightThird, midY, leftThird, midY, 500)}>👈 左滑</ControlBtn>
            <ControlBtn onClick={() => handleSwipe(leftThird, midY, rightThird, midY, 500)}>👉 右滑</ControlBtn>
          </div>
        </div>

        {/* Text Input - Separate from Shell */}
        <div className="control-section">
          <p className="control-label">文本输入</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input type="text" className="control-input" placeholder="输入文字发送到手机..."
              value={textInput} onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendText()} />
            <button className="btn btn-primary" style={{ background: 'var(--neon-cyan)', color: '#000', padding: '12px 15px' }} onClick={handleSendText}>发送</button>
          </div>
        </div>

        {/* Shell Command - Separate state */}
        <div className="control-section">
          <p className="control-label">ADB Shell</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input type="text" className="control-input" style={{ fontFamily: 'monospace' }}
              placeholder="shell命令..."
              value={shellInput} onChange={e => setShellInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendCommand()} />
            <button className="btn btn-primary" style={{ padding: '12px 15px' }} onClick={handleSendCommand}>执行</button>
          </div>
        </div>

        {cmdOutput && (
          <div className="cmd-output">{cmdOutput}</div>
        )}
      </div>
    </div>
  );
};

export default RemoteControl;

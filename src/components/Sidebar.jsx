import React from 'react';
import { useVirus } from '../context/VirusContext';
import { openExternal } from '../utils/shell';
import logoImg from '../assets/logo.png';

const NavItem = React.memo(({ item, activeTab, setActiveTab }) => (
  <div
    className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
    onClick={() => setActiveTab(item.id)}
    style={{
      padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', marginBottom: '3px',
      display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.2s',
      background: activeTab === item.id ? 'rgba(0, 240, 255, 0.08)' : 'transparent',
      color: activeTab === item.id ? 'var(--neon-cyan)' : 'var(--text-muted)',
      borderLeft: activeTab === item.id ? '3px solid var(--neon-cyan)' : '3px solid transparent',
      fontSize: 'var(--fs-md)', fontWeight: '500'
    }}
  >
    <span style={{ fontSize: '15px' }}>{item.icon}</span>
    <span>{item.label}</span>
  </div>
));

const SidebarStatus = () => {
  const { device, debugMsg } = useVirus();
  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'rgba(0, 240, 255, 0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: device ? 'var(--neon-green)' : 'var(--neon-pink)', boxShadow: device ? '0 0 8px var(--neon-green)' : '0 0 8px var(--neon-pink)' }} />
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: '600', fontFamily: "'Rajdhani', sans-serif", color: device ? 'var(--neon-green)' : 'var(--neon-pink)', letterSpacing: '0.5px' }}>{device ? 'DEVICE CONNECTED' : 'NO DEVICE'}</span>
      </div>
      <p style={{ fontSize: '10px', color: 'var(--text-muted)', wordBreak: 'break-all', lineHeight: '1.4', fontFamily: "'Rajdhani', sans-serif", minHeight: '28px' }}>
        {debugMsg}
      </p>
    </div>
  );
};

const Sidebar = React.memo(({ activeTab, setActiveTab, appVersion }) => {
  const menuItems = [
    { id: 'dashboard', label: '仪表板', icon: '📊' },
    { id: 'app-manager', label: '应用管理器', icon: '🤖' },
    { id: 'file-manager', label: '文件管理器', icon: '📁' },
    { id: 'remote-control', label: '屏幕镜像', icon: '📱' },
    { id: 'log', label: '操作记录', icon: '📜' },
    { id: 'help', label: '帮助与支持', icon: '❓' },
  ];

  return (
    <aside className="sidebar" style={{ width: '230px', background: 'var(--bg-sidebar)', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--neon-cyan), transparent)', animation: 'scanline 4s linear infinite', opacity: 0.3, pointerEvents: 'none', zIndex: 1 }} />

      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          width: '72px', height: '72px', margin: '0 auto 10px',
          borderRadius: '50%', overflow: 'hidden',
          border: '2px solid var(--neon-cyan)',
          boxShadow: '0 0 20px rgba(0, 240, 255, 0.3), inset 0 0 15px rgba(0, 240, 255, 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0, 240, 255, 0.05)',
          animation: 'glow 3s ease-in-out infinite'
        }}>
          <img src={logoImg} alt="ERS Tech" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(1.1) contrast(1.1)' }} />
        </div>
        <h1 style={{ fontSize: 'var(--fs-lg)', fontWeight: '800', margin: 0, fontFamily: "'Orbitron', monospace", letterSpacing: '2px' }}>
          <span style={{ color: 'var(--neon-cyan)', textShadow: '0 0 10px rgba(0, 240, 255, 0.5)' }}>ERS</span>
          <span style={{ color: 'var(--text-main)', marginLeft: '6px' }}>Tech</span>
        </h1>
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--neon-green)', margin: '4px 0 0', letterSpacing: '3px', fontWeight: '600', fontFamily: "'Orbitron', monospace" }}>AV KILLER</p>
        <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(0, 255, 136, 0.08)', border: '1px solid rgba(0, 255, 136, 0.2)', borderRadius: '20px', padding: '2px 10px' }}>
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--neon-green)', boxShadow: '0 0 6px var(--neon-green)' }} />
          <span style={{ fontSize: '10px', color: 'var(--neon-green)', fontWeight: '600', fontFamily: "'Orbitron', monospace" }}>{appVersion ? `V${appVersion}` : ''}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '8px 10px' }}>
        <p style={{ fontSize: '10px', color: 'var(--neon-cyan)', padding: '0 12px 8px', textTransform: 'uppercase', letterSpacing: '3px', fontWeight: '700', fontFamily: "'Orbitron', monospace", opacity: 0.6 }}>TOOLS</p>
        {menuItems.map(item => (
          <NavItem key={item.id} item={item} activeTab={activeTab} setActiveTab={setActiveTab} />
        ))}
      </nav>

      {/* Shop Banners */}
      <div style={{ margin: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <a onClick={(e) => { e.preventDefault(); openExternal("https://shopee.com.my/shop/146154950"); }}
          style={{ textDecoration: 'none', padding: '10px 12px', background: 'linear-gradient(135deg, rgba(255,74,0,0.2), rgba(255,74,0,0.08))', border: '1.5px solid rgba(255,74,0,0.5)', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.3s', display: 'flex', alignItems: 'center', gap: '10px' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#ff4a00'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,74,0,0.5)'}>
          <span style={{ fontSize: '20px' }}>🛒</span>
          <div>
            <p style={{ fontSize: '13px', color: '#ff4a00', fontWeight: '800', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.5px' }}>Shopee 商店</p>
            <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>手机配件 · 维修工具</p>
          </div>
        </a>
        <a onClick={(e) => { e.preventDefault(); openExternal("https://www.tiktok.com/@bavenyang?_r=1&_t=ZS-96Mu2A5wTzM"); }}
          style={{ textDecoration: 'none', padding: '10px 12px', background: 'linear-gradient(135deg, rgba(254,44,85,0.2), rgba(254,44,85,0.08))', border: '1.5px solid rgba(254,44,85,0.5)', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.3s', display: 'flex', alignItems: 'center', gap: '10px' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#fe2c55'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(254,44,85,0.5)'}>
          <span style={{ fontSize: '20px' }}>🎵</span>
          <div>
            <p style={{ fontSize: '13px', color: '#fe2c55', fontWeight: '800', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.5px' }}>TikTok 商店</p>
            <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>短视频 · 热门商品</p>
          </div>
        </a>
      </div>

      <SidebarStatus />
    </aside>
  );
});

export default Sidebar;

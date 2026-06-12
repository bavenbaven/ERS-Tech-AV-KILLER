import React, { useState } from 'react';
import { useVirus } from '../context/VirusContext';
import doitnowImg from '../assets/doitnow.jpg';
import wechatpayImg from '../assets/wechatpay.jpg';
import bianceImg from '../assets/biance.jpg';
import wechatImg from '../assets/wechat.jpg';

const Help = () => {
  const { installDriver, resetADB, reconnectAdb, forceAuthPrompt, device } = useVirus();
  const [diagResult, setDiagResult] = useState('');
  const [diagLoading, setDiagLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState('');

  const runDiagnose = async () => {
    setDiagLoading(true);
    setDiagResult('正在诊断，请稍候...');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke('adb_diagnose');
      setDiagResult(result);
    } catch (e) {
      setDiagResult('诊断失败: ' + e);
    }
    setDiagLoading(false);
  };

  const handleInstallDriver = async () => {
    setInstalling(true);
    setInstallMsg('正在安装驱动...');
    try {
      await installDriver();
      setInstallMsg('驱动安装完成，请重新插拔手机后刷新。');
    } catch (e) {
      setInstallMsg('安装失败，请右键以管理员身份运行程序后重试。');
    }
    setInstalling(false);
  };

  const handleDeepRepair = async () => {
    setInstalling(true);
    setInstallMsg('正在进行一键深度修复（环境配置+驱动刷新+ADB重连）...');
    try {
      await reconnectAdb();
      setInstallMsg('深度修复完成，如仍未识别，请尝试更换USB口或数据线。');
    } catch (e) {
      setInstallMsg('深度修复失败: ' + e);
    }
    setInstalling(false);
  };

  const steps = [
    { num: 1, title: '确认 USB 调试已开启', color: '#00f0ff', items: [
      '设置 -> 关于手机 -> 连续点击版本号 7 次',
      '回到设置 -> 系统 -> 开发者选项',
      '开启 USB 调试开关',
      '用 USB 数据线连接电脑',
    ]},
    { num: 2, title: '手机上允许 USB 调试授权', color: '#10b981', items: [
      '连接后手机会弹出 USB 调试授权框',
      '点击允许 USB 调试',
      '勾选始终允许这台电脑',
      '如果没弹窗，点击下方“重新触发ADB授权弹窗”',
    ]},
    { num: 3, title: '连接失败时安装驱动', color: '#f59e0b', items: [
      '以管理员身份运行本程序',
      '点击“重装 ADB 驱动”',
      '安装后重新插拔 USB',
    ]},
    { num: 4, title: '仍无法连接时', color: '#ef4444', items: [
      '更换可传输数据的 USB 线',
      '更换电脑 USB 端口（优先机箱后置）',
      '点击“重置 ADB 服务”再重试',
      '关闭电脑上其他 Android 工具（模拟器、手机助手等）',
    ]},
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="glass-card" style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '18px 24px',
        border: `1px solid ${device ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.3)'}`,
        background: device ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.04)',
      }}>
        <div style={{ fontSize: 36 }}>{device ? '✅' : '❌'}</div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 16, color: device ? '#10b981' : '#ef4444' }}>
            {device ? ('手机已成功连接 - ' + device.id) : '未检测到手机'}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {device ? '所有功能可以正常使用' : '请按以下步骤排查连接问题'}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {steps.map(s => (
          <div key={s.num} className="glass-card" style={{ border: `1px solid ${s.color}22` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#000', flexShrink: 0 }}>{s.num}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.title}</h3>
            </div>
            <ol style={{ paddingLeft: 20, margin: 0 }}>
              {s.items.map((item, i) => (
                <li key={i} style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.5 }}>{item}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <div className="glass-card">
        <h3 style={{ marginBottom: 16, fontSize: 16 }}>一键修复工具</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" style={{ background: '#10b981', padding: '12px 24px', fontSize: 14 }} onClick={handleDeepRepair} disabled={installing}>
            {installing ? '修复中...' : '一键深度修复连接'}
          </button>
          <button className="btn btn-outline" style={{ padding: '12px 24px', fontSize: 14 }} onClick={handleInstallDriver} disabled={installing}>
            {installing ? '处理中...' : '重装 ADB 驱动'}
          </button>
          <button className="btn btn-outline" style={{ padding: '12px 24px', fontSize: 14 }} onClick={resetADB}>
            重置 ADB 服务
          </button>
          <button className="btn btn-outline" style={{ padding: '12px 24px', fontSize: 14, borderColor: '#10b981', color: '#10b981' }} onClick={forceAuthPrompt}>
            重新触发ADB授权弹窗
          </button>
          <button className="btn btn-outline" style={{ padding: '12px 24px', fontSize: 14, borderColor: '#f59e0b', color: '#f59e0b' }} onClick={runDiagnose} disabled={diagLoading}>
            {diagLoading ? '诊断中...' : '诊断连接问题'}
          </button>
        </div>
        {installMsg && <p style={{ marginTop: 14, fontSize: 13, color: installMsg.includes('完成') ? '#10b981' : '#ef4444', fontWeight: 600 }}>{installMsg}</p>}
        {diagResult && (
          <div style={{ marginTop: 16, padding: '14px 18px', background: 'rgba(0,0,0,0.4)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ fontSize: 12, color: 'var(--neon-cyan)', fontWeight: 700, marginBottom: 8 }}>诊断结果:</p>
            <pre style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, lineHeight: 1.7 }}>{diagResult}</pre>
          </div>
        )}
      </div>

      <div className="glass-card">
        <h3 style={{ marginBottom: 16 }}>联系我们与支持</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { img: doitnowImg, label: 'Doitnow', sub: '立即行动', color: '#00f0ff' },
            { img: wechatpayImg, label: '微信支付', sub: '扫码支付', color: '#07c160' },
            { img: bianceImg, label: '币安', sub: '加密货币', color: '#f0b90b', zoom: true },
            { img: wechatImg, label: '微信', sub: '扫码联系', color: '#07c160' },
          ].map((item, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 16, textAlign: 'center', border: `1px solid ${item.color}22`, transition: 'all 0.3s' }}>
              <div style={{ width: '100%', aspectRatio: '1', maxWidth: 180, margin: '0 auto 10px', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <img src={item.img} alt={item.label} style={{ width: '100%', height: '100%', objectFit: item.zoom ? 'cover' : 'contain', transform: item.zoom ? 'scale(1.5)' : 'none' }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.label}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Help;

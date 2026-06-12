import React from 'react';
import { useVirus } from '../context/VirusContext';

const Log = () => {
  const { logs } = useVirus();

  const exportCSV = () => {
    if (!logs.length) return;
    const headers = ['Time', 'Package', 'Name', 'Status'];
    const rows = logs.map(l => [l.time || '', l.pkg || '', l.name || '', l.status || '']);
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `aiva_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: "'Orbitron', monospace" }}>📜 Operation Log</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{logs.length} records</span>
          <button className="btn btn-outline" style={{ fontSize: '12px', padding: '6px 14px' }} onClick={exportCSV} disabled={!logs.length}>📥 Export CSV</button>
        </div>
      </div>
      {!logs.length ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
          <p style={{ fontSize: '14px' }}>No records yet</p>
          <p style={{ fontSize: '12px', marginTop: '6px', opacity: 0.6 }}>Operations will appear here</p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 0' }}>Time</th>
              <th style={{ padding: '12px 0' }}>Package</th>
              <th style={{ padding: '12px 0' }}>Name</th>
              <th style={{ padding: '12px 0' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((record, i) => (
              <tr key={record.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '12px 0', fontSize: '13px', color: 'var(--text-muted)' }}>{record.time}</td>
                <td style={{ padding: '12px 0', fontSize: '13px', fontFamily: 'monospace' }}>{record.pkg}</td>
                <td style={{ padding: '12px 0', fontWeight: '600' }}>{record.name}</td>
                <td style={{ padding: '12px 0' }}>
                  <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-success)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>{record.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Log;

import re

with open('src/pages/Dashboard.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "    dbSyncStatus, dbVersion, dbLastSync, dbError, githubToken, githubRole,",
    "    dbSyncStatus, dbVersion, dbLastSync, dbError, githubToken, githubApiProxy, githubRole,"
)

content = content.replace(
    "  const [settingsRole, setSettingsRole] = useState(githubRole || 'guest');",
    "  const [settingsRole, setSettingsRole] = useState(githubRole || 'guest');\n  const [settingsApiProxy, setSettingsApiProxy] = useState(githubApiProxy || '');"
)

content = content.replace(
    "      <button onClick={() => { setSettingsToken(githubToken); setSettingsRole(githubRole); setShowSettingsModal(true); }}",
    "      <button onClick={() => { setSettingsToken(githubToken); setSettingsRole(githubRole); setSettingsApiProxy(githubApiProxy); setShowSettingsModal(true); }}"
)

content = content.replace(
    "            <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '20px' }}>⚙️ GitHub 设置</h2>",
    "            <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '20px' }}>⚙️ GitHub 设置</h2>\n            <div style={{ marginBottom: '15px' }}>\n              <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>GitHub API Proxy (可选)</label>\n              <input type=\"text\" placeholder=\"https://your-worker.workers.dev\" value={settingsApiProxy} onChange={e => setSettingsApiProxy(e.target.value)}\n                style={{ width: '100%', padding: '12px 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '14px', outline: 'none', fontFamily: 'monospace' }} />\n              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>留空则直连。国内用户推荐填入 Cloudflare Worker 代理域名以确保丝滑体验。</p>\n            </div>"
)

content = content.replace(
    "    saveGithubConfig(settingsToken, settingsRole);",
    "    saveGithubConfig(settingsToken, settingsRole, settingsApiProxy);"
)

with open('src/pages/Dashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

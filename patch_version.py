import re

# Patch App.jsx
with open('src/App.jsx', 'r', encoding='utf-8') as f:
    app_content = f.read()

# Add getVersion import
if 'getVersion' not in app_content:
    app_content = app_content.replace(
        "import { invoke } from '@tauri-apps/api/core';", 
        "import { invoke } from '@tauri-apps/api/core';\nimport { getVersion } from '@tauri-apps/api/app';"
    )

# Modify TitleBar signature and title
app_content = app_content.replace("function TitleBar() {", "function TitleBar({ appVersion }) {")
app_content = app_content.replace(
    '<span className="titlebar-title">🔧 ERS Tech AV Killer</span>',
    '<span className="titlebar-title">🔧 ERS Tech AV Killer {appVersion ? `V${appVersion}` : ""}</span>'
)

# Modify App component
if 'const [appVersion' not in app_content:
    app_content = app_content.replace(
        "const [activeTab, setActiveTab] = useState('dashboard');", 
        "const [activeTab, setActiveTab] = useState('dashboard');\n  const [appVersion, setAppVersion] = useState('');"
    )
    app_content = app_content.replace(
        "invoke('check_auth_status')", 
        "getVersion().then(setAppVersion).catch(() => {});\n    invoke('check_auth_status')"
    )

# Pass appVersion to TitleBar
app_content = app_content.replace("<TitleBar />", "<TitleBar appVersion={appVersion} />")

# Pass appVersion to Sidebar
app_content = app_content.replace(
    "<Sidebar activeTab={activeTab} setActiveTab={handleTabChange} />", 
    "<Sidebar activeTab={activeTab} setActiveTab={handleTabChange} appVersion={appVersion} />"
)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(app_content)


# Patch Sidebar.jsx
with open('src/components/Sidebar.jsx', 'r', encoding='utf-8') as f:
    sidebar_content = f.read()

sidebar_content = sidebar_content.replace(
    "const Sidebar = React.memo(({ activeTab, setActiveTab }) => {", 
    "const Sidebar = React.memo(({ activeTab, setActiveTab, appVersion }) => {"
)
sidebar_content = sidebar_content.replace(
    "V1.88</span>",
    "{appVersion ? `V${appVersion}` : ''}</span>"
)

with open('src/components/Sidebar.jsx', 'w', encoding='utf-8') as f:
    f.write(sidebar_content)

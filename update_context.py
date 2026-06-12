import re

with open('src/context/VirusContext.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "const STORAGE_KEY_GITHUB_TOKEN = 'aiva_github_token';",
    "const STORAGE_KEY_GITHUB_TOKEN = 'aiva_github_token';\nconst STORAGE_KEY_GITHUB_API_PROXY = 'aiva_github_api_proxy';"
)

content = content.replace(
    "const [githubToken, setGithubToken] = useState(() => localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN) || '');",
    "const [githubToken, setGithubToken] = useState(() => localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN) || '');\n  const [githubApiProxy, setGithubApiProxy] = useState(() => localStorage.getItem(STORAGE_KEY_GITHUB_API_PROXY) || '');\n\n  const getGitHubApiUrl = useCallback((path) => {\n    const base = githubApiProxy.trim() ? githubApiProxy.trim() : 'https://api.github.com';\n    const cleanBase = base.replace(/\\/+$/, '');\n    const cleanPath = path.replace(/^\\/+/, '');\n    return cleanBase + '/' + cleanPath;\n  }, [githubApiProxy]);"
)

content = content.replace("`https://api.github.com/", "getGitHubApiUrl(`")
content = content.replace(",\n          { headers: { Authorization: `Bearer ${token}` } }", "),\n          { headers: { Authorization: `Bearer ${token}` } }")
content = content.replace(",\n        { headers: { Authorization: `Bearer ${token}` } }", "),\n        { headers: { Authorization: `Bearer ${token}` } }")
content = content.replace(",\n        { headers: { Authorization: `Bearer ${githubToken}` } }", "),\n        { headers: { Authorization: `Bearer ${githubToken}` } }")
content = content.replace(",\n          {\n            method: 'PUT',", "),\n          {\n            method: 'PUT',")
content = content.replace(",\n        {\n          method: 'PUT',", "),\n        {\n          method: 'PUT',")
content = content.replace(",\n        {\n          method: 'POST',", "),\n        {\n          method: 'POST',")
content = content.replace(",\n        {\n          method: 'PATCH',", "),\n        {\n          method: 'PATCH',")

content = content.replace(
    "const saveGithubConfig = useCallback((token, role) => {\n    localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN, token);\n    localStorage.setItem('aiva_github_role', role);\n    setGithubToken(token);\n    setGithubRole(role);\n  }, []);",
    "const saveGithubConfig = useCallback((token, role, proxy = '') => {\n    const cleanToken = token ? token.trim() : '';\n    const cleanProxy = proxy ? proxy.trim() : '';\n    localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN, cleanToken);\n    localStorage.setItem(STORAGE_KEY_GITHUB_API_PROXY, cleanProxy);\n    localStorage.setItem('aiva_github_role', role);\n    setGithubToken(cleanToken);\n    setGithubApiProxy(cleanProxy);\n    setGithubRole(role);\n  }, []);"
)

content = content.replace(
    "githubToken, githubRole,",
    "githubToken, githubApiProxy, githubRole,"
)

content = content.replace(
    "pendingIssues, issuesLoading]);",
    "pendingIssues, issuesLoading, getGitHubApiUrl]);"
)

with open('src/context/VirusContext.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

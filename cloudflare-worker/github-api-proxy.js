/**
 * ERS Tech AV KILLER - GitHub API Proxy (Cloudflare Worker)
 * 
 * 部署方法：
 * 1. 登录 Cloudflare 控制台，进入 Workers & Pages
 * 2. 创建一个新的 Worker
 * 3. 将此代码粘贴进 worker 的代码编辑器中并点击保存部署
 * 4. 复制生成的 Worker 域名（例如: https://your-worker-name.your-subdomain.workers.dev）
 * 5. 将该域名填入 ERS Tech AV KILLER 软件的「GitHub API Proxy」设置中即可享受丝滑的国内直连体验。
 */

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 如果是 GET 请求获取仓库内容：
    // - 无 Authorization 头 = 只读同步（拉取病毒库），走 raw.githubusercontent.com 快速通道，绕过限流
    // - 有 Authorization 头 = 推送前获取 SHA（需要真实 sha），走真实 GitHub API
    const match = request.method === 'GET' && url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
    const hasAuth = request.headers.has('Authorization');
    if (match && !hasAuth) {
      const owner = match[1];
      const repo = match[2];
      const path = match[3];
      const ref = url.searchParams.get('ref') || 'main';
      
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
      try {
        const rawResp = await fetch(rawUrl, {
          headers: {
            'User-Agent': 'ERS-Tech-AV-Killer'
          }
        });
        if (rawResp.ok) {
          const arrayBuffer = await rawResp.arrayBuffer();
          const base64Content = arrayBufferToBase64(arrayBuffer);
          
          const responseBody = JSON.stringify({
            sha: "dummy-sha",
            content: base64Content
          });
          
          return new Response(responseBody, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
              'X-Proxy-Source': 'GitHub-Raw'
            }
          });
        }
      } catch (rawErr) {
        console.error('Failed to fetch from raw github:', rawErr);
        // 如果获取 raw 失败，继续走下面的标准 API 代理流程作为兜底
      }
    }
    
    // 我们要代理的目标是 GitHub API
    const targetUrl = new URL(url.pathname + url.search, 'https://api.github.com');
    
    // 克隆请求头，但要剔除可能影响请求的头
    const newHeaders = new Headers(request.headers);
    newHeaders.set('Host', 'api.github.com');
    
    // 如果 Cloudflare 环境变量中绑定了 GITHUB_TOKEN 且客户端没有传递 Authorization，则自动补全
    if (env.GITHUB_TOKEN && !newHeaders.has('Authorization')) {
      const tokenVal = env.GITHUB_TOKEN.trim();
      const authHeader = tokenVal.startsWith('token ') || tokenVal.startsWith('Bearer ') ? tokenVal : `token ${tokenVal}`;
      newHeaders.set('Authorization', authHeader);
    }
    
    // 如果浏览器发送了 Origin 或 Referer，我们不需要带去 GitHub
    newHeaders.delete('Origin');
    newHeaders.delete('Referer');
    
    // 构建新的请求发送给 GitHub
    const modifiedRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: 'follow'
    });
    
    try {
      const response = await fetch(modifiedRequest);
      
      // 添加跨域支持 (CORS) 以允许我们在 Electron/Tauri 客户端使用
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};

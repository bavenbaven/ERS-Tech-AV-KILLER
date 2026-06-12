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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 我们要代理的目标是 GitHub API
    const targetUrl = new URL(url.pathname + url.search, 'https://api.github.com');
    
    // 克隆请求头，但要剔除可能影响请求的头
    const newHeaders = new Headers(request.headers);
    newHeaders.set('Host', 'api.github.com');
    
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

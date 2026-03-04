// ============================================
// GitHub Stats Proxy Worker для Pti4kaBeats
// Версия 2.0 - Production Ready
// ============================================

const CONFIG = {
  USERNAME: 'Pti4kaBeats',
  ALLOWED_DOMAINS: ['github.com', 'githubusercontent.com'],
  CACHE_TTL: 3600, // 1 час
  ALLOW_DIRECT_ACCESS: true,
};

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
          }
        });
      }
      
      if (!isFromGitHub(request)) {
        return new Response('❌ Доступ запрещен: запросы только с GitHub', {
          status: 403,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
      
      if (url.pathname === '/health' || url.pathname === '/') {
        return new Response(
          `✅ Worker Health Check\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Username: ${CONFIG.USERNAME}\n` +
          `Cache TTL: ${CONFIG.CACHE_TTL}s\n` +
          `Token: ${env.GITHUB_TOKEN?.trim() ? '✓ Loaded' : '✗ Not set'}\n` +
          `Direct access: ${CONFIG.ALLOW_DIRECT_ACCESS ? '✓ Allowed' : '✗ Blocked'}\n` +
          `Timestamp: ${new Date().toISOString()}`,
          { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }
      
      if (url.pathname.startsWith('/api')) {
        return await fetchStats('https://github-readme-stats.vercel.app/api', url.search, env, ctx);
      }
      
      if (url.pathname.startsWith('/top-langs')) {
        return await fetchStats('https://github-readme-stats.vercel.app/api/top-langs', url.search, env, ctx);
      }
      
      return new Response('❌ Эндпоинт не найден. Используйте /api или /top-langs', { 
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
      
    } catch (error) {
      console.error('🔥 Критическая ошибка:', error);
      
      if (env.ANALYTICS) {
        ctx.waitUntil(
          env.ANALYTICS.writeDataPoint({
            indexes: ['error'],
            blobs: [JSON.stringify({
              timestamp: new Date().toISOString(),
              error: error.message,
              stack: error.stack,
            })],
          })
        );
      }
      
      return new Response('⚠️ Внутренняя ошибка сервера', { 
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  },
};

function isFromGitHub(request) {
  const referer = request.headers.get('Referer');
  const origin = request.headers.get('Origin');
  const source = referer || origin;
  
  if (!source) return CONFIG.ALLOW_DIRECT_ACCESS;
  
  try {
    const url = new URL(source);
    const isAllowed = CONFIG.ALLOWED_DOMAINS.includes(url.hostname);
    
    if (!isAllowed) {
      console.warn(`🚫 Заблокирован запрос с домена: ${url.hostname}`);
    }
    
    return isAllowed;
  } catch {
    return false;
  }
}

async function fetchStats(baseUrl, queryString, env, ctx) {
  const params = new URLSearchParams(queryString.slice(1));
  
  params.set('username', CONFIG.USERNAME);
  
  if (env.GITHUB_TOKEN?.trim()) {
    params.set('token', env.GITHUB_TOKEN.trim());
  }
  
  const apiUrl = `${baseUrl}?${params.toString()}`;
  const endpoint = baseUrl.split('/').pop();
  
  console.log(`📡 [${endpoint}] Запрос к API`);
  
  try {
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Cloudflare Worker/GitHub-Stats-Proxy',
        'Accept': 'image/svg+xml,image/*,*/*'
      },
      cf: {
        cacheTtl: CONFIG.CACHE_TTL,
        cacheEverything: true,
      }
    });
    
    if (env.ANALYTICS) {
      ctx.waitUntil(
        env.ANALYTICS.writeDataPoint({
          indexes: [endpoint],
          blobs: [JSON.stringify({
            timestamp: new Date().toISOString(),
            status: response.status,
            cacheStatus: response.headers.get('CF-Cache-Status'),
            params: Array.from(params.keys()).join(','),
          })],
        })
      );
    }
    
    if (!response.ok) {
      console.error(`❌ [${endpoint}] Ошибка ${response.status}: ${response.statusText}`);
      return new Response(`Ошибка API: ${response.status}`, { 
        status: response.status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Cache-Control', `public, max-age=${CONFIG.CACHE_TTL}`);
    newResponse.headers.set('X-Served-By', 'Cloudflare Worker');
    newResponse.headers.set('X-Endpoint', endpoint);
    
    console.log(`✅ [${endpoint}] Успешно (${response.status})`);
    return newResponse;
    
  } catch (error) {
    console.error(`❌ [${endpoint}] Ошибка подключения:`, error.message);
    return new Response('Не удалось подключиться к GitHub API', { 
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
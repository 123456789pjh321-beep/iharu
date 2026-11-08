/* Connection fallback only: never cache authenticated HTML, API responses, or family data. */
const offlineHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#ffffff"><title>연결 확인 · 아이하루</title><style>body{margin:0;background:#f3f7fc;color:#14324b;font:17px/1.7 system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}main{box-sizing:border-box;width:min(100%,520px);padding:32px}h1{font-size:26px;line-height:1.4}p{color:#587088}a{display:block;padding:13px 18px;margin:14px 0;border-radius:12px;text-align:center;text-decoration:none;font-weight:700;color:#fff;background:#0876cc}a.secondary{background:#fff;color:#0876cc;border:1px solid #cbdced}small{display:block;color:#587088}</style></head><body><main><b>아이하루</b><h1>잠시 연결할 수 없어요</h1><p>인터넷 연결이 끊겼거나 서비스가 잠시 응답하지 않아요. 연결 상태를 확인한 후 다시 시도해 주세요.</p><a href="">다시 연결</a><a class="secondary" href="/timetable">시간표로 이동</a><small>입력 중이던 내용은 저장되지 않았을 수 있어요.</small></main></body></html>`;
const fallback = () => new Response(offlineHtml, {status:200,headers:{
  'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options':'nosniff'
}});
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin
      || /^\/api(?:\/|$)/.test(url.pathname) || url.pathname.startsWith('/.well-known/')) return;
  event.respondWith((async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),10000);
    try {
      const response = await fetch(request,{signal:controller.signal});
      return response.status >= 500 ? fallback() : response;
    } catch {
      return fallback();
    } finally {
      clearTimeout(timer);
    }
  })());
});

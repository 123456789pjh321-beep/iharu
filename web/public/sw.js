/* Connection fallback only: never cache authenticated HTML, API responses, or family data. */
const offlineHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#ffffff"><title>연결 확인 · 아이하루</title><style>body{margin:0;background:#f7f9f6;color:#273b32;font:17px/1.7 system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}main{box-sizing:border-box;width:min(100%,520px);padding:32px}h1{font-size:26px;line-height:1.4}p{color:#64756b}a{display:block;padding:13px 18px;margin:14px 0;border-radius:12px;text-align:center;text-decoration:none;font-weight:700;color:#fff;background:#147d64}a.secondary{background:#fff;color:#147d64;border:1px solid #e1e8e2}small{display:block;color:#64756b}</style></head><body><main><b>아이하루</b><h1>잠시 연결할 수 없어요</h1><p>인터넷 연결이 끊겼거나 서비스가 잠시 응답하지 않아요. 연결 상태를 확인한 후 다시 시도해 주세요.</p><a href="">다시 연결</a><a class="secondary" href="/timetable">시간표로 이동</a><small>입력 중이던 내용은 저장되지 않았을 수 있어요.</small></main></body></html>`;
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

// Only an opaque active profile ID is stored; messages and calendar data are never cached.
function pushProfile(value) {
  return new Promise(resolve => {
    const request = indexedDB.open('iharu-push-context',1);
    request.onupgradeneeded = () => request.result.createObjectStore('context');
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db=request.result,write=arguments.length>0;
      const transaction=db.transaction('context',write?'readwrite':'readonly');
      const operation=write?transaction.objectStore('context').put(value,'profile'):transaction.objectStore('context').get('profile');
      operation.onerror=()=>{db.close();resolve(null);};
      operation.onsuccess=()=>{const result=operation.result;transaction.oncomplete=()=>{db.close();resolve(write?value:result);};};
    };
  });
}
self.addEventListener('message',event=>{
  if(event.data?.type!=='IHARU_PUSH_PROFILE')return;
  const profileId=event.data.profileId;
  if(profileId!==null&&(typeof profileId!=='string'||!/^[0-9a-f-]{36}$/i.test(profileId)))return;
  event.waitUntil((async()=>{const previous=await pushProfile();await pushProfile(profileId);if(previous!==profileId){for(const notification of await self.registration.getNotifications())notification.close();}})());
});
const pushPaths=new Set(['/chat','/today/calendar','/notification-settings']);
self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let payload;try{payload=event.data?.json();}catch{return;}
    if(!payload||typeof payload.title!=='string'||typeof payload.body!=='string'||!pushPaths.has(payload.url))return;
    if(!Number.isFinite(Date.parse(payload.expiresAt))||Date.parse(payload.expiresAt)<=Date.now())return;
    const profile=await pushProfile(),sameAccount=profile===payload.profileId;
    await self.registration.showNotification(sameAccount?payload.title.slice(0,80):'아이하루 알림',{
      body:sameAccount?payload.body.slice(0,180):'로그인한 계정의 알림설정을 확인해 주세요.',
      icon:'/push-icon.png',badge:'/push-badge.png',tag:typeof payload.tag==='string'?payload.tag.slice(0,100):'iharu-update',
      data:{url:sameAccount?payload.url:'/notification-settings',profileId:payload.profileId},
    });
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const profile=await pushProfile();
    const path=profile===event.notification.data?.profileId&&pushPaths.has(event.notification.data?.url)?event.notification.data.url:'/notification-settings';
    const url=new URL(path,self.location.origin).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(existing){await existing.navigate(url);await existing.focus();}else await self.clients.openWindow(url);
    // Opening a push never marks data read; the loaded page's existing read receipt does that.
  })());
});

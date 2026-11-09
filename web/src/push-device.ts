// Device subscriptions are created only by an explicit user gesture in notification settings.
export async function deviceSubscription(){
 if(!window.isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window))return null;
 const registration=await navigator.serviceWorker.getRegistration('/');return registration?await registration.pushManager.getSubscription():null;
}
export function pushSupported(){return window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
export function bindPushProfile(profileId:string|null){
 if(!('serviceWorker' in navigator))return;
 void navigator.serviceWorker.getRegistration('/').then(r=>r?.active?.postMessage({type:'IHARU_PUSH_PROFILE',profileId})).catch(()=>{});
}
export async function clearDevicePush(){
 bindPushProfile(null);
 try{const subscription=await deviceSubscription();await subscription?.unsubscribe();}catch{/* Server session revocation independently prevents subsequent deliveries. */}
 if('serviceWorker' in navigator)try{const r=await navigator.serviceWorker.getRegistration('/');for(const n of await r?.getNotifications()||[])n.close();}catch{/* Unsupported notification enumeration is harmless. */}
}
export function applicationKey(value:string){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}

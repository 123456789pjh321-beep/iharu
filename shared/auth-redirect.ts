import {entryReturnPath} from './entry-intent.js';
export type AuthRedirectField='callbackURL'|'newUserCallbackURL'|'errorCallbackURL'|'redirectTo';
/** Explicit app destinations only; keep the same policy at POST start and email verification. */
export function authRedirectAllowed(value:unknown,origin:string,path:string,field:AuthRedirectField):boolean{
 if(typeof value!=='string'||!value||value.length>2048||/[\u0000-\u0020\\]/.test(value)||value.startsWith('//')||(!value.startsWith('/')&&!/^https?:\/\//.test(value)))return false;
 let url:URL;try{url=new URL(value,origin);}catch{return false;}
 if(url.origin!==new URL(origin).origin||url.username||url.password||url.hash)return false;
 const params=url.searchParams,keys=[...params.keys()];
 if(keys.some(key=>params.getAll(key).length!==1))return false;
 const next=params.get('next'),validNext=next===null||entryReturnPath(next)===next;
 if(field==='redirectTo')return url.pathname==='/reset-password'&&!url.search;
 if(field==='errorCallbackURL')return url.pathname==='/login'&&keys.every(key=>key==='next')&&validNext;
 if(path==='/sign-up/email'||path==='/send-verification-email'||path==='/verify-email')return url.pathname==='/login'&&params.get('verified')==='1'&&keys.every(key=>key==='verified'||key==='next')&&validNext;
 if(path==='/sign-in/social'){const target=url.pathname+url.search;return target==='/today'||entryReturnPath(target)===target;}
 return url.pathname==='/account'&&!url.search;
}

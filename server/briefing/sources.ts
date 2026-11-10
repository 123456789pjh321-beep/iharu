import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {isIP} from 'node:net';
export type BriefingEvidence={id:string;url:string;title:string;text:string;checkedAt:string};
export function officialSourceUrl(value:string):URL|null{
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||value.length>2048)return null;
 if(!u.hostname.endsWith('.go.kr')&&!['library.kr','www.library.kr','airkorea.or.kr','www.airkorea.or.kr'].includes(u.hostname))return null;
 u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))u.searchParams.delete(key);return u;
 }catch{return null;}
}
export function publicIPv4(value:string){if(isIP(value)!==4)return false;const [a,b,c]=value.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
export function plainText(html:string){return html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();}
/** Pin a verified public IPv4 address while retaining TLS hostname verification. */
async function page(url:URL,redirects=0):Promise<string>{
 const addresses=await Promise.race([lookup(url.hostname,{all:true,family:4}),new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new Error('SOURCE_TIMEOUT')),2500);timer.unref();})]);
 if(!addresses.length||addresses.some(a=>!publicIPv4(a.address)))throw Error('SOURCE_BLOCKED');
 return new Promise((resolve,reject)=>{
  const req=request(url,{method:'GET',servername:url.hostname,family:4,lookup:(_host,_options,callback)=>callback(null,addresses[0].address,4),headers:{'User-Agent':'iHaruBriefing/1.0 (+https://myiharu.com)','Accept':'text/html,application/xhtml+xml'}},res=>{
   if(res.statusCode&&res.statusCode>=300&&res.statusCode<400){res.resume();const next=res.headers.location&&officialSourceUrl(new URL(res.headers.location,url).href);if(!next||redirects>=2){reject(Error('SOURCE_REDIRECT'));return;}void page(next,redirects+1).then(resolve,reject);return;}
   if(res.statusCode!==200||!/^text\/html|^application\/xhtml\+xml/i.test(res.headers['content-type']||'')){res.resume();reject(Error('SOURCE_UNAVAILABLE'));return;}
   const chunks:Buffer[]=[];let length=0;res.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>512000){req.destroy(Error('SOURCE_SIZE'));return;}chunks.push(chunk);});
   res.on('end',()=>{try{const charset=/charset=([^;\s]+)/i.exec(res.headers['content-type']||'')?.[1]||'utf-8';resolve(new TextDecoder(charset).decode(Buffer.concat(chunks)));}catch{reject(Error('SOURCE_ENCODING'));}});res.on('error',reject);
  });const timer=setTimeout(()=>req.destroy(Error('SOURCE_TIMEOUT')),5500);timer.unref();req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
 });
}
export async function fetchBriefingEvidence(value:string,id:string):Promise<BriefingEvidence>{const url=officialSourceUrl(value);if(!url)throw Error('SOURCE_BLOCKED');const html=await page(url),text=plainText(html);if(text.length<60)throw Error('SOURCE_EMPTY');return {id,url:url.href,title:plainText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]||url.hostname).slice(0,150),text:text.slice(0,18000),checkedAt:new Date().toISOString()};}

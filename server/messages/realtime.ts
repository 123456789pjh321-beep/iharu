import {createPrivateKey,sign,type KeyObject} from 'node:crypto';
import {z} from 'zod';
export type RealtimeConfig={url:string;publishableKey:string;key:KeyObject;kid:string};
const jwkSchema=z.object({kty:z.literal('EC'),crv:z.literal('P-256'),kid:z.uuid(),d:z.string().min(40),x:z.string().min(40),y:z.string().min(40)});
export function readRealtimeConfig(env:NodeJS.ProcessEnv=process.env):RealtimeConfig|null{
 const values=[env.REALTIME_SUPABASE_URL,env.REALTIME_PUBLISHABLE_KEY,env.REALTIME_SIGNING_JWK];
 if(values.every(v=>!v))return null;
 try{
  const url=new URL(values[0]!);if(url.protocol!=='https:'||!/^[-a-z0-9]+\.supabase\.co$/.test(url.hostname)||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw new Error();
  const publishableKey=values[1]!;
  if(!publishableKey?.startsWith('sb_publishable_')||/\s/.test(publishableKey))throw new Error();
  const jwk=jwkSchema.parse(JSON.parse(values[2]!));
  const key=createPrivateKey({key:jwk,format:'jwk'});if(key.asymmetricKeyType!=='ec')throw new Error();
  return {url:url.origin,publishableKey,key,kid:jwk.kid};
 }catch{throw new Error('REALTIME_CONFIG_INVALID');}
}
const ticketSchema=z.object({ticket:z.uuid(),principal:z.uuid(),topic:z.string().regex(/^child:[0-9a-f-]{36}:chat:\d+$/),expiresAt:z.string()});
export function signRealtimeTicket(value:unknown,config:RealtimeConfig,now=Date.now()){
 const t=ticketSchema.parse(value),iat=Math.floor(now/1000),exp=Math.min(Math.floor(Date.parse(t.expiresAt)/1000),iat+180);
 if(!Number.isFinite(exp)||exp<=iat)throw new Error('REALTIME_TICKET_EXPIRED');
 const header=Buffer.from(JSON.stringify({alg:'ES256',kid:config.kid,typ:'JWT'})).toString('base64url');
 const claims=Buffer.from(JSON.stringify({iss:config.url+'/auth/v1',aud:'authenticated',sub:t.principal,role:'authenticated',purpose:'iharu_chat',jti:t.ticket,iat,exp})).toString('base64url');
 const message=header+'.'+claims;
 const signature=sign('sha256',Buffer.from(message),{key:config.key,dsaEncoding:'ieee-p1363'}).toString('base64url');
 return {state:'AVAILABLE' as const,url:config.url,publishableKey:config.publishableKey,topic:t.topic,token:message+'.'+signature,expiresAt:new Date(exp*1000).toISOString()};
}


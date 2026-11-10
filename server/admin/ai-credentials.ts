import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto';
import type {FamilyActor,FamilyService} from '../family/service.js';
import type {AiSettings} from '../../shared/ai-settings.js';
const aad=Buffer.from('iharu:openai-credential:v1');
export type AiCredentialDependencies={encryptionKey:()=>string|undefined;fetcher:typeof fetch};
export const aiCredentialDefaults:AiCredentialDependencies={encryptionKey:()=>process.env.AI_CREDENTIAL_ENCRYPTION_KEY,fetcher:(...args)=>fetch(...args)};
function master(value:string|undefined){if(!value||!/^[0-9a-f]{64}$/i.test(value))throw new Error('AI_ENCRYPTION_UNAVAILABLE');return Buffer.from(value,'hex');}
export function sealOpenAiKey(apiKey:string,value:string|undefined){const key=master(value),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);const encrypted=Buffer.concat([cipher.update(apiKey,'utf8'),cipher.final()]);return {ciphertext:['v1',iv.toString('base64url'),encrypted.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.'),fingerprint:createHmac('sha256',key).update(apiKey).digest('hex').slice(0,8)};}
export function unsealOpenAiKey(ciphertext:string,value:string|undefined){const key=master(value);try{const [v,iv,data,tag,...extra]=ciphertext.split('.');if(v!=='v1'||extra.length||!iv||!data||!tag)throw new Error();const nonce=Buffer.from(iv,'base64url'),auth=Buffer.from(tag,'base64url');if(nonce.length!==12||auth.length!==16)throw new Error();const cipher=createDecipheriv('aes-256-gcm',key,nonce);cipher.setAAD(aad);cipher.setAuthTag(auth);return Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString('utf8');}catch{throw new Error('AI_DECRYPT_FAILED');}}
export class AiCredentials{
 constructor(private family:FamilyService,private deps:AiCredentialDependencies=aiCredentialDefaults){}
 private ready(){try{master(this.deps.encryptionKey());return true;}catch{return false;}}
 async read(actor:FamilyActor):Promise<AiSettings>{const state=await this.family.command<Omit<AiSettings,'encryptionReady'>>(actor,'ai.credentials.read');return {...state,encryptionReady:this.ready()};}
 async save(actor:FamilyActor,version:number,apiKey:string){
  // Authorize before inspecting or encrypting the credential. SQL checks again atomically.
  if(!(await this.family.command<{allowed:boolean}>(actor,'admin.access')).allowed)throw new Error('ADMIN_REQUIRED');
  const sealed=sealOpenAiKey(apiKey,this.deps.encryptionKey());await this.family.command(actor,'ai.credentials.save',{version,...sealed});return this.read(actor);
 }
 async remove(actor:FamilyActor,version:number){await this.family.command(actor,'ai.credentials.remove',{version});return this.read(actor);}
 // Server-only usage boundary. No endpoint returns the decrypted credential or ciphertext.
 async withKey<T>(actor:FamilyActor,operation:(key:string,version:number)=>Promise<T>):Promise<T>{const credential=await this.family.command<{ciphertext:string;version:number}>(actor,'ai.credentials.get');return operation(unsealOpenAiKey(credential.ciphertext,this.deps.encryptionKey()),credential.version);}
 async check(actor:FamilyActor){return this.withKey(actor,async(key,version)=>{
  let result:'OK'|'AUTH'|'LIMIT'|'UNAVAILABLE'='UNAVAILABLE',modelCount=0;
  try{const r=await this.deps.fetcher('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(10000)});if(r.ok){const body=await r.json() as {data?:unknown[]};if(Array.isArray(body.data)){result='OK';modelCount=body.data.length;}}else result=[401,403].includes(r.status)?'AUTH':r.status===429?'LIMIT':'UNAVAILABLE';}catch{/* Provider bodies and errors can contain secrets. Never return or log them. */}
  await this.family.command(actor,'ai.credentials.checked',{version,result});return {...await this.read(actor),modelCount};
 });}
}

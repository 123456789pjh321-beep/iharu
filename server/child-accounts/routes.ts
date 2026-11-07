import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {getCookie,setCookie,deleteCookie} from 'hono/cookie';
import {randomBytes,randomInt,scrypt as rawScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {z} from 'zod';
import type {AuthService} from '../auth/service.js';
import {currentSession} from '../auth/routes.js';
import type {FamilyService} from '../family/service.js';
const scrypt=promisify(rawScrypt);
export async function childPasswordHash(password:string){const salt=randomBytes(16).toString('hex');return `scrypt:${salt}:${(await scrypt(password,salt,64) as Buffer).toString('hex')}`;}
export async function childPasswordMatches(password:string,hash:string){const [kind,salt,key]=hash.split(':');if(kind!=='scrypt'||!salt||!key||key.length!==128)return false;const actual=await scrypt(password,salt,64) as Buffer;return timingSafeEqual(actual,Buffer.from(key,'hex'));}
const messages:Record<string,string>={CHILD_NOT_APPROVED:'보호자가 번호를 확인한 뒤 시작할 수 있어요.',INVALID_INPUT:'입력한 내용을 확인해 주세요.',AUTH_REQUIRED:'보호자로 먼저 로그인해 주세요.',PARENT_EMAIL_REQUIRED:'보호자 이메일 확인을 마친 뒤 자녀 번호를 입력해 주세요.',ROLE_CONFLICT:'보호자가 로그인한 기기예요. 자녀 기기에서 진행하거나 보호자 로그아웃 후 이용해 주세요.',CHILD_LOGIN_INVALID:'자녀 아이디 또는 비밀번호가 맞지 않아요.',CHILD_CODE_INVALID:'사용할 수 없는 번호예요. 자녀 화면에서 새 번호를 받아 주세요.',CHILD_SIGNUP_EXPIRED:'가입 대기 시간이 지났어요. 자녀 회원가입부터 다시 시작해 주세요.',CHILD_ACCESS_REVOKED:'가족 연결이 해제되었어요. 보호자에게 확인해 주세요.',CONSENT_REQUIRED:'확인한 자녀와 보호자 동의를 다시 확인해 주세요.',FORBIDDEN:'가족 운영자만 이 가족에 자녀를 연결할 수 있어요.',CHILD_LIMIT:'가족당 자녀는 5명까지 연결할 수 있어요.',FAMILY_LIMIT:'참여 가능한 가족 수를 초과했어요.',DEVICE_LIMIT:'자녀 기기는 2대까지 로그인할 수 있어요. 보호자의 기기 관리에서 기존 연결을 해제해 주세요.',RATE_LIMITED:'시도 횟수가 많아요. 잠시 후 다시 이용해 주세요.'};
export function childAccountRoutes(auth:()=>AuthService|null,runtime:()=>Promise<FamilyService|null>){
 const app=new Hono<{Variables:{requestId:string}}>();
 app.use('/api/v1/child-accounts/*',bodyLimit({maxSize:4096,onError:c=>c.json({error:{message:messages.INVALID_INPUT}},413)}));
 const loginId=z.string().trim().toLowerCase().regex(/^i[a-z0-9]{10}$/),password=z.string().min(8).max(128),code=z.string().regex(/^\d{6}$/),empty=z.object({}).strict();
 const specs:Record<string,z.ZodType>={register:z.object({name:z.string().trim().min(1).max(24),password}).strict(),login:z.object({loginId,password}).strict(),status:empty,renew:empty,finish:empty,parent:empty,resolve:z.object({code}).strict(),approve:z.object({code,requestId:z.uuid(),familyId:z.uuid().optional(),consent:z.literal(true)}).strict()};
 for(const op of Object.keys(specs))app.post(`/api/v1/child-accounts/${op}`,async c=>{
  const fail=(key:string,status:400|401|403|429|503=400)=>c.json({error:{code:key,message:messages[key]||'연결을 준비하고 있어요. 잠시 후 다시 확인해 주세요.'},requestId:c.get('requestId')},status);
  const svc=auth();if(!svc)return fail('UNAVAILABLE',503);
  if(c.req.header('Origin')!==svc.settings.origin)return fail('FORBIDDEN',403);
  const parsed=specs[op].safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return fail('INVALID_INPUT');
  const p=parsed.data as Record<string,unknown>,parent=['parent','resolve','approve'].includes(op);
  const session=await currentSession(svc,c.req.raw);
  if(parent&&(!session||session.guard.assurance!=='HIGH'))return fail('AUTH_REQUIRED',401);
  if(parent&&(!session!.user.emailVerified||session!.user.email.endsWith('@identity.iharu.invalid')))return fail('PARENT_EMAIL_REQUIRED',403);
  if(!parent&&session&&op!=='status')return fail('ROLE_CONFLICT',403);
  const secure=svc.settings.origin.startsWith('https:'),proofName=secure?'__Host-iharu-child-signup':'iharu-child-signup',deviceName=secure?'__Host-iharu-child':'iharu-child';
  const cookie={httpOnly:true,secure,sameSite:'strict' as const,path:'/'};
  try{
   const ip=process.env.VERCEL?c.req.header('x-vercel-forwarded-for')||'unknown':'local';
   await svc.policy.takeLimits([{key:`childaccount:${op}:${parent?session!.guard.member_id:ip}`,windowMs:op==='register'?3600000:600000,limit:op==='register'?10:op==='resolve'||op==='approve'||op==='login'?10:op==='status'?300:30},...(op==='login'?[{key:`childaccount:login:${p.loginId}`,windowMs:600000,limit:10}]:[])]);
   const db=await runtime();if(!db)return fail('UNAVAILABLE',503);
   const actor={requestId:c.get('requestId'),...(parent?{memberId:session!.guard.member_id,sessionId:session!.session.id}:{})};
   const proof=getCookie(c,proofName),raw=db.token();let newCode=String(randomInt(1000000)).padStart(6,'0');
   let input:Record<string,unknown>={...p},result:Record<string,unknown>;
   if(op==='register')input={name:p.name,passwordHash:await childPasswordHash(p.password as string),loginId:'i'+randomBytes(5).toString('hex'),proofHash:db.digest(`signup:${raw}`),codeHash:db.digest(`child-code:${newCode}`)};
   if(op==='login'){
    const credentials=await db.command<{passwordHash?:string}>(actor,'childaccount.credentials',{loginId:p.loginId});
    // Same scrypt work for an unknown ID; never expose account existence or hashes.
    const dummy='scrypt:00000000000000000000000000000000:'+''.padStart(128,'0');
    if(!await childPasswordMatches(p.password as string,credentials.passwordHash||dummy))return fail('CHILD_LOGIN_INVALID',401);
    input={loginId:p.loginId,passwordHash:credentials.passwordHash,newProofHash:db.digest(`signup:${raw}`),codeHash:db.digest(`child-code:${newCode}`),deviceHash:db.digest(`device:${raw}`)};
   }
   if(['status','renew','finish'].includes(op)){
    if(!proof)return fail('CHILD_LOGIN_INVALID',401);
    input={proofHash:db.digest(`signup:${proof}`),...(op==='renew'?{codeHash:db.digest(`child-code:${newCode}`)}:{}),...(op==='finish'?{deviceHash:db.digest(`device:${raw}`),sealed:db.seal(raw)}:{})};
   }
   if(op==='resolve'||op==='approve')input={...p,code:undefined,codeHash:db.digest(`child-code:${p.code}`)};
   for(let attempt=0;;attempt++){try{result=await db.command(actor,'childaccount.'+op,input);break;}catch(e){if((e as {code?:string}).code!=='23505'||attempt>=2||!['register','renew','login'].includes(op))throw e;newCode=String(randomInt(1000000)).padStart(6,'0');input.codeHash=db.digest(`child-code:${newCode}`);if(op==='register')input.loginId='i'+randomBytes(5).toString('hex');}}
   if(op==='register'||(op==='login'&&result.status==='WAITING'))setCookie(c,proofName,raw,{...cookie,maxAge:86400});
   if(result.status==='CONNECTED'){
    setCookie(c,deviceName,typeof result.sealed==='string'?db.unseal(result.sealed):raw,{...cookie,maxAge:30*86400});deleteCookie(c,proofName,cookie);
    return c.json({status:'CONNECTED',loginId:result.loginId});
   }
   return c.json({...result,...(['register','renew'].includes(op)||(op==='login'&&result.status==='WAITING')?{code:newCode}:{}),serverNow:new Date().toISOString()});
  }catch(e){const error=e as {message?:string;body?:{code?:string};code?:string};const key=error.body?.code||error.message||'';if(messages[key])return fail(key,key==='RATE_LIMITED'?429:key==='AUTH_REQUIRED'?401:key==='FORBIDDEN'?403:400);console.error(JSON.stringify({code:'CHILD_ACCOUNT_FAILED',requestId:c.get('requestId')}));return fail('UNAVAILABLE',503);}
 });
 return app;
}

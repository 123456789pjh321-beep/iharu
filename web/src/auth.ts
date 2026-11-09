import {clearDevicePush} from './push-device';
import { z } from 'zod';
export const providersSchema = z.object({ loginOrigin: z.url().optional(), providers: z.array(z.object({ id: z.enum(['email','google','kakao','naver','phone']), name: z.string(), enabled: z.boolean() })) });
export type Provider = z.infer<typeof providersSchema>['providers'][number];
export const sessionSchema = z.discriminatedUnion('authenticated', [
  z.object({ authenticated: z.literal(false) }),
  z.object({ authenticated: z.literal(true), assurance: z.enum(['LOW','HIGH']), name: z.string().optional(), email: z.string().nullable().optional(), emailVerified: z.boolean().optional(), accessReady: z.boolean(), reauthenticatedAt: z.string().nullable().optional() }),
]);
export type SignedInSession = Extract<z.infer<typeof sessionSchema>, {authenticated:true}>;
export const methodsSchema = z.object({ methods: z.array(z.object({ id: z.string(), provider: z.string() })) });
export const sessionsSchema = z.object({ sessions: z.array(z.object({ id: z.string(), current: z.boolean(), device: z.string(), createdAt: z.string(), lastSeenAt: z.string() })) });
export const methodNames: Record<string, string> = { credential:'이메일 · 비밀번호', google:'Google', kakao:'카카오', naver:'네이버', phone:'휴대폰' };
export const emailLinkSchema = z.object({pending:z.object({email:z.string(),expiresAt:z.string()}).nullable()});
const messages: Record<string,string> = {
  MAIL_DELIVERY_FAILED:'인증 메일을 보내지 못했어요. 1분 뒤 다시 입력해 주세요. 계속되면 서비스 연결 확인이 필요해요.',
  METHOD_ALREADY_LINKED:'이미 이메일 로그인이 연결되어 있어요. 내 계정에서 확인해 주세요.',
  AUTH_NOT_READY:'로그인 연결을 준비하고 있어요. 잠시 후 다시 방문해 주세요.',
  PROVIDER_NOT_READY:'이 로그인 방법은 아직 준비 중이에요.',
  AUTH_REQUIRED:'로그인 시간이 만료되었어요. 다시 로그인해 주세요.',
  AUTH_UNAVAILABLE:'지금은 연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.',
  EMAIL_NOT_VERIFIED:'이메일의 인증 링크를 눌러 확인을 마쳐 주세요.',
  INVALID_EMAIL_OR_PASSWORD:'이메일과 비밀번호를 다시 확인해 주세요.',
  REAUTH_REQUIRED:'로그인 방법을 바꾸려면 본인 인증이 필요해요. 아래에서 다시 확인해 주세요.',
  REAUTH_FAILED:'비밀번호를 다시 확인해 주세요.',
  RATE_LIMITED:'요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.',
  TOO_MANY_REQUESTS:'요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.',
  LAST_LOGIN_METHOD:'로그인 방법이 하나는 남아 있어야 해요. 다른 방법을 먼저 연결해 주세요.',
  INVALID_OTP:'인증번호가 맞지 않거나 시간이 지났어요. 새 번호를 요청해 주세요.',
  INVALID_TOKEN:'이 링크는 만료되었거나 이미 사용했어요. 다시 요청해 주세요.',
  INVALID_PHONE:'010으로 시작하는 휴대폰 번호를 확인해 주세요.',
  EMAIL_UNAVAILABLE:'이 이메일로 연결할 수 없어요. 다른 이메일을 사용하거나 기존 계정으로 로그인해 주세요.',
  UNLINK_PHONE_FIRST:'기존 휴대폰 연결을 해제한 뒤 새 번호를 연결해 주세요.',
};
export async function authPost(path: string, body: object) {
  const response = await fetch(path, { method: 'POST', credentials: 'same-origin', cache:'no-store', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const data = await response.json() as { code?:string; url?:string; caseId?:string };
  if (!response.ok) throw new Error(messages[data.code || ''] || '입력한 내용을 확인하고 다시 시도해 주세요.');
  if(path==='/api/auth/sign-out')await clearDevicePush();
  return data;
}
export async function startSocial(provider:string, link = false, reauthenticate = false) {
  const data = await authPost(`/api/auth/${link?'link-social':'sign-in/social'}`, { provider, callbackURL:link||reauthenticate?'/account':'/timetable', errorCallbackURL:'/login' });
  if (!data.url || !data.url.startsWith('https://')) throw new Error('로그인 연결 주소를 확인하지 못했어요. 다시 시도해 주세요.');
  window.location.assign(data.url);
}

/** Only known error codes are displayed; provider query text may contain sensitive data. */
export function socialErrorMessage(code:string|null) {
  if(!code)return undefined;
  if(code==='account_not_linked')return '기존에 사용하던 방법으로 로그인한 뒤, 내 계정 → 로그인 방법 추가에서 소셜 계정을 연결해 주세요.';
  if(code==='access_denied')return '로그인이 취소됐어요. 로그인 버튼을 눌러 다시 시작할 수 있어요.';
  if(['state_not_found','state_mismatch','invalid_callback_request','invalid_code'].includes(code))return '로그인 연결이 만료됐어요. 이전 화면으로 돌아가지 말고 로그인 버튼을 눌러 다시 시작해 주세요.';
  if(['unable_to_get_user_info','email_not_found'].includes(code))return '소셜 계정 정보를 확인하지 못했어요. 다시 시도해 주세요. 계속되면 서비스 설정 확인이 필요해요.';
  return '로그인을 마치지 못했어요. 로그인 버튼으로 다시 시작해 주세요. 계속되면 서비스 설정 확인이 필요해요.';
}


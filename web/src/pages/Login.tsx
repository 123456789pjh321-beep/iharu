import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useApi } from '../api';
import { providersSchema, sessionSchema, authPost, startSocial, socialErrorMessage } from '../auth';
import { AuthEntryFrame, AuthLayout, FormNotice, LoginActions, PasswordField } from '../components/AuthLayout';
import { Loading, ErrorState } from '../components/Common';
import { Icon } from '../components/Icon';
import {entryReturnPath} from '../../../shared/entry-intent';
import {workspaceRequest} from '../workspace-api';
import {forgetEntry} from '../entry-session';
import {useLaunchVideo} from '../components/LaunchVideo';

export function InlineLogin({returnTo,onAuthenticated,onBusy}:{returnTo:string;onAuthenticated:()=>Promise<void>;onBusy:(busy:boolean)=>void}){
 const providers=useLoginProviders();
 return <AuthEntryFrame inline><LoginForm providers={providers} inline returnTo={returnTo} onAuthenticated={onAuthenticated} onBusy={onBusy}/></AuthEntryFrame>;
}

export function LoginPage() {
  const {pathname,search}=useLocation();
  const providers=useLoginProviders();
  const entry=pathname==='/login'||pathname==='/signup';
  const params=new URLSearchParams(search);
  const reauthenticate=params.get('reauth')==='1';
  const next=entryReturnPath(params.get('next'));
  useLaunchVideo(pathname==='/login'&&!reauthenticate&&next!=='/invite'&&!params.has('error')&&!params.has('verified'));
  return <AuthEntryFrame>
    {entry&&!reauthenticate?<LoginEntry providers={providers}/>:<LoginForm providers={providers} reauthenticate={reauthenticate}/>}
    {pathname==='/login'&&!reauthenticate&&next!=='/invite'&&<Link className="auth-browse-link" to={next} onClick={forgetEntry}>로그인 없이 먼저 둘러보기 <Icon name="arrow"/></Link>}
  </AuthEntryFrame>;
}
function useLoginProviders(){return useApi('/api/account/providers',providersSchema);}
function LoginEntry({providers}:{providers:ReturnType<typeof useLoginProviders>}) {
  const {search}=useLocation();
  const session=useApi('/api/account/session',sessionSchema);
  useEffect(()=>{const refresh=()=>session.refresh();window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[session.refresh]);
  if(session.loading)return <Loading label="로그인 상태를 확인하고 있어요"/>;
  if(session.error)return <ErrorState message={session.error} retry={session.retry}/>;
  if(session.data?.authenticated)return <Navigate to={session.data.assurance==='LOW'?'/account':entryReturnPath(new URLSearchParams(search).get('next'))} replace/>;
  return <LoginForm providers={providers}/>;
}
function LoginForm({providers,reauthenticate=false,inline=false,returnTo,onAuthenticated,onBusy}:{providers:ReturnType<typeof useLoginProviders>;reauthenticate?:boolean;inline?:boolean;returnTo?:string;onAuthenticated?:()=>Promise<void>;onBusy?:(busy:boolean)=>void}) {
  const { pathname, search } = useLocation(); const navigate = useNavigate();
  const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const [message,setMessage] = useState('');
  const socialPending=useRef(false);
  useEffect(()=>{
    // A native Back from the provider can restore React with busy=true from bfcache.
    // Release only a social redirect; an unrelated email submission stays protected.
    const restore=(event:PageTransitionEvent)=>{if(!event.persisted||!socialPending.current)return;socialPending.current=false;setBusy(false);onBusy?.(false);};
    window.addEventListener('pageshow',restore);return()=>window.removeEventListener('pageshow',restore);
  },[onBusy]);
  const [token] = useState(() => new URLSearchParams(search).get('token') || '');
  useEffect(()=>{ if (token) window.history.replaceState(null,'',pathname); },[token,pathname]);
  const mode = inline?'login':pathname === '/signup' ? 'signup' : pathname === '/forgot-password' ? 'forgot' : pathname === '/verify-email' ? 'verify' : pathname === '/reset-password' ? 'reset' : 'login';
  const requestedNext=returnTo||new URLSearchParams(search).get('next');
  const next=reauthenticate&&!requestedNext?'/account':entryReturnPath(requestedNext);
  const callback='/login?verified=1&next='+encodeURIComponent(next);
  const titles = { login:'로그인', signup:'회원가입', forgot:'암호를 잊으셨나요?', verify:'이메일을 확인해 주세요', reset:'새 암호 설정' };
  const subtitles = { login:'', signup:'이메일로 아이하루 계정을 만들어요. 그룹 초대를 받았다면 가입 후 초대를 수락할 수 있어요.', forgot:'가입한 이메일로 재설정 링크를 보내드려요.', verify:'인증 메일이 보이지 않으면 다시 요청할 수 있어요.', reset:'앞으로 사용할 암호를 입력해 주세요.' };
  const accountNotLinked = mode === 'login' && new URLSearchParams(search).get('error') === 'account_not_linked';
  const enabled = providers.data?.providers.find(p=>p.id==='email')?.enabled === true;
  const acceptsExistingId=mode==='login'&&!reauthenticate;
  const credentialFormReady=enabled||acceptsExistingId;
  const waiting = providers.data?.providers.every(p=>!p.enabled) === true;
  const loginOrigin=providers.data?.loginOrigin;
  const canonicalLogin=(mode==='login'||mode==='signup') && loginOrigin && new URL(loginOrigin).origin!==window.location.origin;
  const canonicalQuery=new URLSearchParams();
  if(reauthenticate)canonicalQuery.set('reauth','1');
  if(!reauthenticate||requestedNext)canonicalQuery.set('next',next);
  const canonicalPath=(mode==='signup'?'/signup':'/login')+'?'+canonicalQuery;
  useEffect(()=>{
    if(canonicalLogin)window.location.replace(new URL(canonicalPath,loginOrigin).href);
  },[canonicalLogin,loginOrigin,canonicalPath]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy)return; const form = new FormData(event.currentTarget); setBusy(true);onBusy?.(true);setError('');setMessage('');
    try {
      const email = String(form.get('email') || '').trim(); const password = String(form.get('password') || '');
      if (mode === 'login') {
        if(acceptsExistingId&&/^[a-z0-9][a-z0-9_]{3,19}$/i.test(email))await workspaceRequest('child.login',{loginId:email,password});
        else await authPost('/api/auth/sign-in/email',{email,password});
        if(onAuthenticated)await onAuthenticated();else navigate(next,{replace:true});
      }
      if (mode === 'signup') { await authPost('/api/auth/sign-up/email',{email,password,name:String(form.get('name')).trim(),callbackURL:callback});setMessage('가입을 진행할 수 있는 이메일이면 인증 메일이 도착해요. 메일함과 스팸함을 확인해 주세요.'); }
      if (mode === 'forgot') { await authPost('/api/auth/request-password-reset',{email,redirectTo:'/reset-password'});setMessage('일치하는 이메일 계정이 있으면 재설정 링크를 보내드려요. 메일함을 확인해 주세요.'); }
      if (mode === 'verify') { await authPost('/api/auth/send-verification-email',{email,callbackURL:callback});setMessage('인증이 필요한 계정이면 메일을 보내드려요. 메일함과 스팸함을 확인해 주세요.'); }
      if (mode === 'reset') { await authPost('/api/auth/reset-password',{token,newPassword:password});setMessage('암호가 바뀌었어요. 모든 기기에서 로그아웃했으니 새 암호로 로그인해 주세요.'); }
    } catch (e) {setError(e instanceof Error?e.message:'연결을 확인해 주세요.');} finally {setBusy(false);onBusy?.(false);}
  }
  async function social(id:string) { if(busy)return;socialPending.current=true;setBusy(true);onBusy?.(true);setError('');try {await startSocial(id,false,reauthenticate,next);}catch(e){socialPending.current=false;setError((e as Error).message);setBusy(false);onBusy?.(false);} }
  if(canonicalLogin)return <AuthLayout><Loading label="안전한 로그인 화면으로 이동하고 있어요"/><a className="button primary full" href={new URL(canonicalPath,loginOrigin).href}>운영 로그인 화면 열기</a></AuthLayout>;
  return <AuthLayout>{mode!=='login'&&<div className="auth-title"><h2>{titles[mode]}</h2><p>{subtitles[mode]}</p></div>}
    {providers.loading?<Loading label="로그인 방법을 확인하고 있어요"/>:providers.error?<ErrorState message={providers.error} retry={providers.retry}/>:<>
      {waiting&&<div className="auth-notice setup-notice"><Icon name="clock"/><div><strong>로그인 연결을 준비하고 있어요</strong><p>준비가 끝나면 여기서 그룹의 하루를 시작할 수 있어요.</p></div></div>}
      {mode==='login'&&new URLSearchParams(search).has('verified')&&!new URLSearchParams(search).has('error')&&<FormNotice message="이메일 확인을 마쳤어요. 로그인해 주세요."/>}
      {mode==='login'&&!accountNotLinked&&new URLSearchParams(search).has('error')&&<FormNotice error={socialErrorMessage(new URLSearchParams(search).get('error'))}/>}
      {accountNotLinked&&<section className="auth-notice account-link-guide" role="status" aria-labelledby="account-link-title">
        <h3 id="account-link-title">기존 계정에 로그인 방법을 연결해 주세요</h3>
        <p>같은 이메일로 가입한 아이하루 계정이 있어요. 사용하려는 소셜 로그인을 기존 계정에 먼저 연결하면 됩니다.</p>
        <ol>
          <li>아래에서 <strong>기존에 사용하던 카카오 또는 이메일·암호</strong>로 로그인해 주세요.</li>
          <li><strong>내 계정 → 로그인 방법 추가</strong>로 이동해 주세요.</li>
          <li>구글 로그인이라면 <strong>Google 연결</strong>을 누르고 사용할 구글 계정을 선택해 주세요.</li>
        </ol>
        <p>연결을 마치면 다음부터 Google로 바로 로그인할 수 있어요. 같은 이메일로 다시 가입할 필요는 없어요.</p>
        <Link className="button full" to="/forgot-password">이메일 로그인 암호 찾기</Link>
        <p className="account-caption">카카오로 가입했다면 카카오로 먼저 로그인해 주세요. 본인 확인을 다시 요청하면 기존 방법으로 재로그인한 뒤 연결해 주세요.</p>
      </section>}
      <FormNotice error={error} message={message}/>
      {mode==='reset'&&!token?<div className="auth-notice">재설정 메일의 링크를 다시 열어 주세요.</div>:<form onSubmit={submit} className={`auth-form ${mode==='login'?'auth-login-form':''}`}>
        <fieldset disabled={busy||!credentialFormReady}><legend className="sr-only">{titles[mode]}</legend>
          {mode==='signup'&&<div className="form-field"><label htmlFor="name">이름</label><input id="name" name="name" required minLength={2} maxLength={30} autoComplete="name" placeholder="이름을 입력해 주세요"/></div>}
          {mode!=='reset'&&<div className="form-field"><label htmlFor="email">{mode==='login'?'아이디':'이메일'}</label><input id="email" name="email" required type={acceptsExistingId?'text':'email'} maxLength={254} autoComplete={mode==='login'?'username':'email'} inputMode={acceptsExistingId?'text':'email'} placeholder={acceptsExistingId?'이메일 또는 아이디':'이메일 주소'} autoCapitalize="none" spellCheck={false}/></div>}
          {['login','signup','reset'].includes(mode)&&<PasswordField fresh={mode!=='login'}/>}
          {mode==='login'?<LoginActions busy={busy} ready={credentialFormReady} next={next}/>:<button className="button primary full" type="submit">{busy?'잠시만 기다려 주세요':!enabled?'이메일 로그인 준비 중':mode==='signup'?'인증 메일 보내기':mode==='reset'?'새 암호 저장':'링크 다시 받기'}</button>}
        </fieldset>
      </form>}
      {mode==='login'&&<div className="form-links auth-login-help"><Link to={'/verify-email?next='+encodeURIComponent(next)}>이메일 인증 안내</Link><Link to={'/forgot-password?next='+encodeURIComponent(next)}>암호 찾기</Link></div>}
      {mode==='signup'&&<p className="auth-help"><Link to="/legal/terms">이용약관</Link> · <Link to="/legal/privacy">개인정보처리방침</Link><br/>이메일 확인 후 게시된 문서를 읽고 이용 동의를 기록합니다.</p>}{mode==='signup'&&message&&<Link className="button full" to={'/verify-email?next='+encodeURIComponent(next)}>인증 메일 다시 받기</Link>}{mode==='reset'&&<Link className="button full" to="/forgot-password">만료된 재설정 링크 다시 받기</Link>}{mode==='login'?<><div className="auth-divider"><span>다른 방법으로 이어가기</span></div><div className="social-buttons">{providers.data?.providers.filter(p=>['google','kakao','naver'].includes(p.id)).map(p=><button key={p.id} className={`button social-${p.id}`} disabled={!p.enabled||busy} onClick={()=>social(p.id)}>{p.name}로 계속하기{!p.enabled&&<span className="provider-state">준비 중</span>}</button>)}</div><Link className="button full phone-login" to="/phone"><Icon name="phone"/>휴대폰 번호로 로그인</Link></>:<Link className="auth-back" to={'/login?next='+encodeURIComponent(next)}>로그인으로 돌아가기 <Icon name="arrow"/></Link>}
    </>}
  </AuthLayout>;
}

export function PhonePage() {
  const providers = useApi('/api/account/providers',providersSchema); const navigate=useNavigate();
  const link = new URLSearchParams(useLocation().search).get('link') === '1';
  const [phone,setPhone]=useState('');const [code,setCode]=useState('');const [sent,setSent]=useState(false);const [seconds,setSeconds]=useState(0);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useLaunchVideo(!link);
  const enabled=providers.data?.providers.find(p=>p.id==='phone')?.enabled===true;
  useEffect(()=>{if(seconds<=0)return; const timer=window.setTimeout(()=>setSeconds(s=>s-1),1000);return()=>clearTimeout(timer);},[seconds]);
  async function send(){setBusy(true);setError('');try{await authPost('/api/auth/phone-number/send-otp',{phoneNumber:phone});setSent(true);setSeconds(60);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function verify(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{await authPost('/api/auth/phone-number/verify',{phoneNumber:phone,code,...(link?{updatePhoneNumber:true}:{})});navigate(link?'/account':'/timetable',{replace:true});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <AuthLayout><div className="auth-title"><span className="eyebrow">휴대폰 인증</span><h2>{link?'휴대폰 연결하기':'번호로 간편하게 시작해요'}</h2><p>휴대폰 번호 확인 후, 일반사용자 본인확인을 별도로 진행해요.</p></div><FormNotice error={error}/>
    {providers.error?<ErrorState message={providers.error} retry={providers.retry}/>:providers.loading?<Loading label="휴대폰 인증을 확인하고 있어요"/>:<>
      {!enabled&&<FormNotice message="휴대폰 인증은 준비 중이에요. 다른 로그인 방법을 이용해 주세요."/>}
      <form className="auth-form" onSubmit={verify}><fieldset disabled={!enabled||busy}><legend className="sr-only">휴대폰 인증</legend><div className="form-field"><label htmlFor="phone">휴대폰 번호</label><input id="phone" autoComplete="tel" type="tel" inputMode="tel" required value={phone} onChange={e=>{setPhone(e.target.value);setSent(false);setCode('');}} placeholder="010 1234 5678" maxLength={18}/></div><button className="button full" type="button" disabled={seconds>0||!phone} onClick={send}>{seconds>0?`${seconds}초 후 다시 받기`:sent?'인증번호 다시 받기':'인증번호 받기'}</button>
        {sent&&<><div className="form-field"><label htmlFor="otp">문자로 받은 인증번호</label><input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} aria-describedby="otp-hint"/><small id="otp-hint">3분 안에 입력해 주세요. 5회 틀리면 새 번호가 필요해요.</small></div><button className="button primary full" type="submit">인증하고 계속하기</button></>}
      </fieldset></form></>}
    <Link className="auth-back" to={link?'/account':'/login'}>{link?'계정 설정으로':'다른 방법으로 로그인'} <Icon name="arrow"/></Link>
  </AuthLayout>;
}


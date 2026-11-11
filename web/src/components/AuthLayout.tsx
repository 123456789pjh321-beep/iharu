import {Loading,ErrorState} from './Common';
import {PublicHeader} from './PublicHeader';
import {useInPublicFrame} from './PublicFrame';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {WorkspaceNavigation} from './WorkspaceNavigation';
import {FamilyArtwork,useExperience} from './Experience';
import {WorkspaceGateProvider,useWorkspaceGate} from './WorkspaceGate';
import {EntryAccessProvider} from './EntryAccess';
import {BriefingLocationProvider,LocationAccessPrompt} from './BriefingLocation';
import {entryReturnPath} from '../../../shared/entry-intent';

type LayoutProps={children:ReactNode;wide?:boolean;personalChild?:boolean};
const FrameContext=createContext(false);
const timeTreeRoutes=new Set(['/timetable','/calendar','/today/calendar','/chat','/child/chat','/briefing','/tuition','/more','/settings']);
export function AuthLayout(props:LayoutProps){return useContext(FrameContext)?<>{props.children}</>:<AuthLayoutRoot {...props}/>;}
export function AuthEntryFrame({children,inline=false}:{children:ReactNode;inline?:boolean}){const content=<FrameContext.Provider value>{children}</FrameContext.Provider>;return inline?content:<AuthLayout>{content}</AuthLayout>;}
export function WorkspaceFrame(){return <WorkspaceGateProvider><EntryAccessProvider><BriefingLocationProvider><StableWorkspaceFrame/></BriefingLocationProvider></EntryAccessProvider></WorkspaceGateProvider>;}
function StableWorkspaceFrame(){
 const {pathname,search}=useLocation(),{health,session,access}=useWorkspaceGate();
 const publicDocument=pathname.startsWith('/legal/');
 const childNavigation=access.identity?.role==='CHILD';
 if(new URLSearchParams(search).get('legacy')==='1'||health.data?.data.demoEnabled)return <Outlet/>;
 return <AuthLayoutRoot wide showNavigation={!publicDocument||session.data?.authenticated===true||childNavigation} personalChild={pathname==='/child/chat'||childNavigation}><FrameContext.Provider value>{health.error?<ErrorState message={health.error} retry={health.retry}/>:health.loading||session.loading?<Loading label="작업실을 열고 있어요"/>:<Outlet/>}</FrameContext.Provider></AuthLayoutRoot>;
}
function AuthLayoutRoot({ children, wide:requestedWide = false,personalChild=false,showNavigation=true }: { children: ReactNode; wide?: boolean;personalChild?:boolean;showNavigation?:boolean }) {
  const { pathname } = useLocation(),inPublicFrame=useInPublicFrame();
  const panel=useRef<HTMLDivElement>(null),{preferences}=useExperience();
  const wide=requestedWide||['/account','/family','/device','/child','/phone'].some(p=>pathname.startsWith(p));
  const route=pathname.replace(/\/+$/,'');
  const timeTree=wide&&showNavigation&&timeTreeRoutes.has(route);
  useLayoutEffect(()=>{if(timeTree)panel.current?.scrollTo(0,0);},[pathname,timeTree]);
  useLayoutEffect(()=>{
    const node=panel.current;
    if(!node)return;
    if(preferences.quiet||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const frames=timeTree?[{opacity:.7},{opacity:1}]:[{opacity:.7,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}];
    const motion=node.animate(frames,{duration:160,easing:'cubic-bezier(.2,.8,.2,1)'});
    return()=>motion.cancel();
  },[pathname,timeTree,preferences.quiet]);
  useEffect(() => { const names:Record<string,string>={'/help':'사용 가이드','/more/notices':'공지사항','/more/blog':'블로그','/more':'더보기','/settings':'설정','/today':'오늘','/today/calendar':'달력','/timetable':'시간표','/today/repeats':'반복 일정','/tuition':'가계부','/records':'메모','/notification-settings':'알림설정','/chat':'대화','/child/chat':'대화','/briefing':'AI 브리핑','/family':'그룹 관리','/invite':'그룹 초대','/admin':'시스템 관리','/location':'위치','/account':'내 계정'};document.title = `${names[pathname]||(pathname.startsWith('/family')?'우리 그룹':pathname.startsWith('/device')||pathname.startsWith('/child')?'아이 기기':'로그인과 계정')} · 아이하루`; document.getElementById('auth-main')?.scrollTo(0,0); document.getElementById('auth-main')?.focus({preventScroll:true}); }, [pathname]);
  return <div data-timetree={timeTree?route:undefined} className={`auth-app ${wide?'workspace-page':'entry-page'}${wide&&!showNavigation?' public-document-page':''}`}><a className="skip-link" href="#auth-main">본문 바로가기</a>
    {!wide&&!inPublicFrame&&<PublicHeader/>}
    {wide&&showNavigation&&<WorkspaceNavigation personalChild={personalChild} childMode={!personalChild&&(pathname.startsWith('/child')||pathname.startsWith('/device'))}/> }
    {wide&&showNavigation&&(!timeTree||route==='/timetable')&&<LocationAccessPrompt/>}
    <main id="auth-main" tabIndex={-1} className={`auth-main ${wide?'auth-wide':''}`}>
      {!wide && <aside className="auth-intro"><span className="eyebrow">그룹의 하루를 잇다</span><h1>서로의 하루에<br/>조금 더 가까이.</h1><p>챙겨야 할 일정도, 전하고 싶은 마음도.<br/>그룹이 함께하는 하루를 시작하세요.</p><FamilyArtwork/></aside>}
      <div ref={panel} className="auth-panel">{timeTree&&route==='/briefing'&&<LocationAccessPrompt/>}{children}</div>
    </main>{!inPublicFrame&&<footer className="auth-footer"><span className="auth-footer-brand">아이하루 · 그룹의 하루를 잇다</span> <Link to="/service">서비스 소개</Link><Link to="/guide">활용방법</Link><Link to="/notices">공지사항</Link><Link to="/blog">블로그</Link><Link to="/legal/terms">이용약관</Link><Link to="/legal/privacy">개인정보처리방침</Link><Link to="/privacy">개인정보 관리</Link></footer>}
  </div>;
}
export function LoginActions({busy=false,ready=true,next}:{busy?:boolean;ready?:boolean;next?:string}) {
  const query=new URLSearchParams();if(next)query.set('next',entryReturnPath(next));
  return <div className="auth-login-actions"><button className="button primary full" type="submit">{busy?'잠시만 기다려 주세요':!ready?'이메일 로그인 준비 중':'로그인'}</button><Link className="button full" aria-disabled={busy||undefined} onClick={e=>{if(busy)e.preventDefault();}} to={'/signup'+(query.size?'?'+query:'')}>회원가입</Link></div>;
}
export function PasswordField({ label='암호', name='password', fresh=false,minimum }: { label?:string; name?:string; fresh?:boolean;minimum?:number }) {
  const [visible,setVisible] = useState(false);
  return <div className="form-field"><label htmlFor={name}>{label}</label><div className="password-field"><input id={name} name={name} type={visible?'text':'password'} minLength={minimum??(fresh?12:1)} maxLength={128} required autoComplete={fresh?'new-password':'current-password'} aria-describedby={fresh?`${name}-hint`:undefined}/><button type="button" aria-pressed={visible} onClick={()=>setVisible(v=>!v)} aria-label={`${label} ${visible?'숨기기':'표시'}`}>{visible?'숨기기':'표시'}</button></div>{fresh&&<small id={`${name}-hint`}>{minimum??12}~128자로 입력해 주세요. 붙여넣기도 가능해요.</small>}</div>;
}
export function FormNotice({ error, message }: { error?:string; message?:string }) {
  return <>{error&&<div className="auth-notice error" role="alert">{error}</div>}{message&&<div className="auth-notice" role="status">{message}</div>}</>;
}



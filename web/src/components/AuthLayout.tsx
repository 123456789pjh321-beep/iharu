import {Loading,ErrorState} from './Common';
import {PublicHeader} from './PublicHeader';
import {useInPublicFrame} from './PublicFrame';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {WorkspaceBrand,WorkspaceNavigation} from './WorkspaceNavigation';
import {DisplaySettings,Entrance,FamilyArtwork} from './Experience';
import {WorkspaceGateProvider,useWorkspaceGate} from './WorkspaceGate';
import {workspaceRequest} from '../workspace-api';
import type {WorkspaceMe} from '../../../shared/workspace';

type LayoutProps={children:ReactNode;wide?:boolean;personalChild?:boolean};
const FrameContext=createContext(false);
export function AuthLayout(props:LayoutProps){return useContext(FrameContext)?<>{props.children}</>:<AuthLayoutRoot {...props}/>;}
export function AuthEntryFrame({children}:{children:ReactNode}){return <AuthLayout><FrameContext.Provider value>{children}</FrameContext.Provider></AuthLayout>;}
export function WorkspaceFrame(){return <WorkspaceGateProvider><StableWorkspaceFrame/></WorkspaceGateProvider>;}
function StableWorkspaceFrame(){
 const {pathname,search}=useLocation(),{health,session}=useWorkspaceGate();
 const publicDocument=pathname.startsWith('/legal/')||pathname==='/privacy';
 const [childSession,setChildSession]=useState<{source:unknown;authenticated:boolean}|null>(null);
 useEffect(()=>{
  let active=true;setChildSession(null);
  if(publicDocument&&!session.loading&&session.data?.authenticated===false){const source=session.data;void workspaceRequest<WorkspaceMe>('me').then(me=>{if(active)setChildSession({source,authenticated:me.role==='CHILD'});}).catch(()=>{});}
  return()=>{active=false;};
 },[publicDocument,session.loading,session.data]);
 const childNavigation=childSession?.source===session.data&&childSession?.authenticated===true;
 if(new URLSearchParams(search).get('legacy')==='1'||health.data?.data.demoEnabled)return <Outlet/>;
 return <AuthLayoutRoot wide showNavigation={!publicDocument||session.data?.authenticated===true||childNavigation} personalChild={pathname==='/child/chat'||childNavigation}><FrameContext.Provider value>{health.error?<ErrorState message={health.error} retry={health.retry}/>:health.loading||session.loading?<Loading label="작업실을 열고 있어요"/>:<Outlet/>}</FrameContext.Provider></AuthLayoutRoot>;
}
function AuthLayoutRoot({ children, wide:requestedWide = false,personalChild=false,showNavigation=true }: { children: ReactNode; wide?: boolean;personalChild?:boolean;showNavigation?:boolean }) {
  const { pathname } = useLocation(),inPublicFrame=useInPublicFrame();
  const wide=requestedWide||['/account','/family','/device','/child','/phone'].some(p=>pathname.startsWith(p));
  useEffect(() => { const names:Record<string,string>={'/today':'오늘','/today/calendar':'달력','/timetable':'시간표','/today/repeats':'반복 일정','/tuition':'학원비','/records':'메모','/chat':'대화','/child/chat':'대화','/family':'가족 관리','/admin':'시스템 관리','/location':'위치','/account':'내 계정'};document.title = `${names[pathname]||(pathname.startsWith('/family')?'우리 가족':pathname.startsWith('/device')||pathname.startsWith('/child')?'아이 기기':'로그인과 계정')} · 아이하루`; document.getElementById('auth-main')?.scrollTo(0,0); document.getElementById('auth-main')?.focus({preventScroll:true}); }, [pathname]);
  return <div className={`auth-app ${wide?'workspace-page':'entry-page'}${wide&&!showNavigation?' public-document-page':''}`}><a className="skip-link" href="#auth-main">본문 바로가기</a>
    {wide?<header className="auth-header"><WorkspaceBrand/><span className="auth-header-caption">가족의 하루를 잇다</span><div className="auth-display-actions"><DisplaySettings/></div></header>:!inPublicFrame&&<PublicHeader/>}
    {wide&&showNavigation&&<WorkspaceNavigation personalChild={personalChild} childMode={!personalChild&&(pathname.startsWith('/child')||pathname.startsWith('/device'))}/> }
    <main id="auth-main" tabIndex={-1} className={`auth-main ${wide?'auth-wide':''}`}>
      {!wide && <aside className="auth-intro"><span className="eyebrow">가족의 하루를 잇다</span><h1>서로의 하루에<br/>조금 더 가까이.</h1><p>챙겨야 할 일정도, 전하고 싶은 마음도.<br/>가족이 함께하는 하루를 시작하세요.</p><FamilyArtwork/></aside>}
      <Entrance className="auth-panel">{children}{!wide&&<div className="auth-entry-display"><DisplaySettings/></div>}</Entrance>
    </main>{!inPublicFrame&&<footer className="auth-footer"><span className="auth-footer-brand">아이하루 · 가족의 하루를 잇다</span> <Link to="/service">서비스 소개</Link><Link to="/guide">활용방법</Link><Link to="/notices">공지사항</Link><Link to="/blog">블로그</Link><Link to="/legal/terms">이용약관</Link><Link to="/legal/privacy">개인정보처리방침</Link><Link to="/privacy">개인정보 관리</Link></footer>}
  </div>;
}
export function LoginActions({busy=false,ready=true}:{busy?:boolean;ready?:boolean;child?:boolean}) {
  return <div className="auth-login-actions"><button className="button primary full" type="submit">{busy?'잠시만 기다려 주세요':!ready?'이메일 로그인 준비 중':'로그인'}</button><Link className="button full" to="/signup">회원가입</Link></div>;
}
export function PasswordField({ label='암호', name='password', fresh=false,minimum }: { label?:string; name?:string; fresh?:boolean;minimum?:number }) {
  const [visible,setVisible] = useState(false);
  return <div className="form-field"><label htmlFor={name}>{label}</label><div className="password-field"><input id={name} name={name} type={visible?'text':'password'} minLength={minimum??(fresh?12:1)} maxLength={128} required autoComplete={fresh?'new-password':'current-password'} aria-describedby={fresh?`${name}-hint`:undefined}/><button type="button" aria-pressed={visible} onClick={()=>setVisible(v=>!v)} aria-label={`${label} ${visible?'숨기기':'표시'}`}>{visible?'숨기기':'표시'}</button></div>{fresh&&<small id={`${name}-hint`}>{minimum??12}~128자로 입력해 주세요. 붙여넣기도 가능해요.</small>}</div>;
}
export function FormNotice({ error, message }: { error?:string; message?:string }) {
  return <>{error&&<div className="auth-notice error" role="alert">{error}</div>}{message&&<div className="auth-notice" role="status">{message}</div>}</>;
}



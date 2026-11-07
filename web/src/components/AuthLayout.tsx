import {Loading,ErrorState} from './Common';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {WorkspaceBrand,WorkspaceNavigation} from './WorkspaceNavigation';
import { Icon } from './Icon';
import {DisplaySettings,Entrance,FamilyArtwork} from './Experience';
import {WorkspaceGateProvider,useWorkspaceGate} from './WorkspaceGate';

type LayoutProps={children:ReactNode;wide?:boolean;personalChild?:boolean};
const FrameContext=createContext(false);
export function AuthLayout(props:LayoutProps){return useContext(FrameContext)?<>{props.children}</>:<AuthLayoutRoot {...props}/>;}
export function WorkspaceFrame(){return <WorkspaceGateProvider><StableWorkspaceFrame/></WorkspaceGateProvider>;}
function StableWorkspaceFrame(){
 const {pathname,search}=useLocation(),{health,session}=useWorkspaceGate();
 if(new URLSearchParams(search).get('legacy')==='1'||health.data?.data.demoEnabled)return <Outlet/>;
 return <AuthLayoutRoot wide personalChild={pathname==='/child/chat'}><FrameContext.Provider value>{health.error?<ErrorState message={health.error} retry={health.retry}/>:health.loading||session.loading?<Loading label="작업실을 열고 있어요"/>:<Outlet/>}</FrameContext.Provider></AuthLayoutRoot>;
}
function AuthLayoutRoot({ children, wide:requestedWide = false,personalChild=false }: { children: ReactNode; wide?: boolean;personalChild?:boolean }) {
  const { pathname } = useLocation();
  const wide=requestedWide||['/account','/family','/device','/child','/phone'].some(p=>pathname.startsWith(p));
  useEffect(() => { const names:Record<string,string>={'/today':'오늘','/today/calendar':'달력','/timetable':'시간표','/today/repeats':'반복 일정','/tuition':'학원비','/records':'메모','/chat':'대화','/child/chat':'대화','/family':'관리','/location':'위치','/account':'내 계정'};document.title = `${names[pathname]||(pathname.startsWith('/family')?'우리 가족':pathname.startsWith('/device')||pathname.startsWith('/child')?'아이 기기':'로그인과 계정')} · 아이하루`; document.getElementById('auth-main')?.scrollTo(0,0); document.getElementById('auth-main')?.focus({preventScroll:true}); }, [pathname]);
  return <div className={`auth-app ${wide?'workspace-page':'entry-page'}`}><a className="skip-link" href="#auth-main">본문 바로가기</a>
    <header className="auth-header"><WorkspaceBrand/><span className="auth-header-caption">가족의 하루를 잇다</span><div className="auth-display-actions"><DisplaySettings/></div></header>
    {!wide&&<div className="test-entry-banner"><span>기능을 먼저 살펴보세요</span><Link to="/test/today">인증 없이 기능 테스트<Icon name="arrow"/></Link></div>}
    {wide&&<WorkspaceNavigation personalChild={personalChild} childMode={!personalChild&&(pathname.startsWith('/child')||pathname.startsWith('/device'))}/> }
    <main id="auth-main" tabIndex={-1} className={`auth-main ${wide?'auth-wide':''}`}>
      {!wide && <aside className="auth-intro"><span className="eyebrow">가족의 하루를 잇다</span><h1>서로의 하루에<br/>조금 더 가까이.</h1><p>챙겨야 할 일정도, 전하고 싶은 마음도.<br/>가족이 함께하는 하루를 시작하세요.</p><FamilyArtwork/><div className="auth-trust"><Icon name="shield"/><span>자녀 정보는 보호자의 번호 확인과 동의 후 연결해요.</span></div></aside>}
      <Entrance className="auth-panel">{children}</Entrance>
    </main><footer className="auth-footer">아이하루 · 가족의 하루를 잇다 <Link to="/login?role=child">자녀 로그인</Link></footer>
  </div>;
}
export function PasswordField({ label='비밀번호', name='password', fresh=false,minimum }: { label?:string; name?:string; fresh?:boolean;minimum?:number }) {
  const [visible,setVisible] = useState(false);
  return <div className="form-field"><label htmlFor={name}>{label}</label><div className="password-field"><input id={name} name={name} type={visible?'text':'password'} minLength={minimum??(fresh?12:1)} maxLength={128} required autoComplete={fresh?'new-password':'current-password'} aria-describedby={fresh?`${name}-hint`:undefined}/><button type="button" aria-pressed={visible} onClick={()=>setVisible(v=>!v)} aria-label={visible?'비밀번호 숨기기':'비밀번호 표시'}>{visible?'숨기기':'표시'}</button></div>{fresh&&<small id={`${name}-hint`}>{minimum??12}~128자로 입력해 주세요. 붙여넣기도 가능해요.</small>}</div>;
}
export function FormNotice({ error, message }: { error?:string; message?:string }) {
  return <>{error&&<div className="auth-notice error" role="alert">{error}</div>}{message&&<div className="auth-notice" role="status">{message}</div>}</>;
}



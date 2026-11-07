import {GuardianVerificationPage} from './pages/GuardianVerification';
import {NotificationsPage} from './pages/Notifications';
import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { envelope, healthSchema, type ChildFilter } from '../../shared/contracts';
import { useApi } from './api';
import { sessionSchema, type SignedInSession } from './auth';
import { AuthLayout } from './components/AuthLayout';
const ChatPage=lazy(()=>import('./pages/Chat').then(m=>({default:m.ChatPage})));
function ChatRoute({childMode=false}:{childMode?:boolean}){return <Suspense fallback={<Loading/>}><ChatPage childMode={childMode}/></Suspense>;}
import { DailyWorkspace } from './pages/Daily';
import { Home } from './pages/Home';
import { copy } from './copy';
import {DisplaySettings} from './components/Experience';
import { Icon, type IconName } from './components/Icon';
import { PreviewDialog, ErrorState, Loading } from './components/Common';
import { Guardian } from './pages/Guardian';
import { ChildHome } from './pages/ChildHome';
import { Upcoming } from './pages/Upcoming';
import { LoginPage, PhonePage } from './pages/Login';
import { FamilyPage,FamilyInvitePage } from './pages/Family';
import { DeviceConnectPage,ConnectedChildPage } from './pages/Device';
import { AccountPage, ReauthPage, EmailLinkPage } from './pages/Account';
import {SchedulePage,ChildSchedulePage} from './pages/Schedules';
const healthResponse=envelope(healthSchema);
const guardianNav: {to:string;label:string;icon:IconName}[]=[{to:'/today',label:'오늘',icon:'home'},{to:'/location',label:'아이 위치',icon:'pin'},{to:'/chat',label:'가족 대화',icon:'chat'},{to:'/records',label:'기록',icon:'book'}];
const childNav:typeof guardianNav=[{to:'/child',label:'내 하루',icon:'home'},{to:'/child/chat',label:'가족 대화',icon:'chat'}];
function Shell() {
  const health=useApi('/api/health',healthResponse);
  if(health.loading)return <AuthLayout wide><Loading label="아이하루를 열고 있어요"/></AuthLayout>;
  if(health.error)return <AuthLayout wide><ErrorState message={health.error} retry={health.retry}/></AuthLayout>;
  return health.data?.data.demoEnabled?<Workspace demo/>:<AuthenticatedWorkspace/>;
}
function AuthenticatedWorkspace() {
  const session=useApi('/api/account/session',sessionSchema);
  useEffect(()=>{
    const refresh=()=>session.refresh();
    window.addEventListener('focus',refresh);
    return()=>window.removeEventListener('focus',refresh);
  },[session.refresh]);
  if(session.loading)return <AuthLayout wide><Loading label="가족의 하루를 열고 있어요"/></AuthLayout>;
  if(session.error)return <AuthLayout wide><ErrorState message={session.error} retry={session.retry}/></AuthLayout>;
  if(!session.data?.authenticated)return <Navigate to="/login" replace/>;
  if(session.data.assurance==='LOW')return <Navigate to="/account" replace/>;
  return <Workspace key={session.data.email} demo={false} session={session.data}/>;
}
function Workspace({demo,session}:{demo:true;session?:never}|{demo:false;session:SignedInSession}) {
  const {pathname}=useLocation(); const isChild=demo&&pathname.startsWith('/child');
  const [child,setChild]=useState<ChildFilter>('all');
  const [dialog,setDialog]=useState<string|null>(null);
  const [large,setLarge]=useState(()=>{try{return localStorage.getItem('iharu:large-type')==='true';}catch{return false;}});
  useEffect(()=>{ document.documentElement.classList.toggle('large-type',large); try{localStorage.setItem('iharu:large-type',String(large));}catch{/* Preference can remain in memory. */} },[large]);
  useEffect(()=> { document.title=`${isChild?'내 하루':'가족의 하루'} · 아이하루`; window.scrollTo(0,0); document.getElementById('main')?.focus({preventScroll:true}); },[pathname,isChild]);
  const nav=isChild?childNav:guardianNav;
  const todayActive=['/today','/calendar','/tuition','/repeats'].includes(pathname);
  function navigation(className:string) { return <nav className={className} aria-label={className==='bottom-nav'?'모바일 주 메뉴':'주 메뉴'}>{nav.map(item=><NavLink key={item.to} end to={item.to} className={()=>((item.to==='/today'?todayActive:pathname===item.to)?'active':'')} aria-current={(item.to==='/today'?todayActive:pathname===item.to)?'page':undefined}><Icon name={item.icon}/><span>{item.label}</span></NavLink>)}</nav>; }
  return <div className={`app ${isChild?'child-mode':''}`}>
    <a className="skip-link" href="#main">본문 바로가기</a>
    {!isChild && <aside className="sidebar"><Link to="/today" className="brand"><span className="brandmark"><Icon name="sun"/></span>{copy.brand}</Link><p className="tagline">{copy.tagline}</p><p className="sidebar-caption">우리 가족</p>{navigation('side-nav')}<div className="sidebar-bottom"><Link to="/family"><Icon name="home"/>가족과 아이 관리</Link><Link to="/settings"><Icon name="settings"/>내 계정</Link><div className="family-profile"><span className="avatar mint">가</span><span><strong>우리 가족</strong><small>{demo?'가상 가족 · 미리보기':'내 계정으로 연결됨'}</small></span></div></div></aside>}
    <div className="app-content"><header className="topbar">{isChild?<Link to="/child" className="brand"><span className="brandmark"><Icon name="sun"/></span>{copy.brand}</Link>:<><Link className="brand mobile-brand" to="/today"><span className="brandmark"><Icon name="sun"/></span>{copy.brand}</Link><span className="desktop-context">가족의 하루를 잇다</span></>}
      <div className="top-actions"><DisplaySettings/><button className="font-toggle" aria-pressed={large} onClick={()=>setLarge(v=>!v)}><Icon name="type"/><span>큰 글씨</span></button>{!isChild&&<><Link className="icon-button" to="/notifications" aria-label="알림함"><Icon name="bell"/></Link><Link className="profile-button" to="/settings" aria-label="가족 설정">가</Link></>}</div></header>
      {demo && <div className="demo-bar"><span><span className="demo-dot"/>{copy.demo}</span><div className="preview-toggle" aria-label="미리보기 화면 선택"><Link to="/today" aria-current={!isChild?'page':undefined}>보호자 화면</Link><Link to="/child" aria-current={isChild?'page':undefined}>아이 화면</Link></div></div>}
      <main id="main" tabIndex={-1} className="main">
        {pathname==='/'?<Navigate to="/today" replace/>:!demo?(pathname==='/today'?<Home session={session}/>:pathname==='/records'?<><div className="page-heading"><div><p className="eyebrow">하루하루 쌓이는 가족의 기록</p><h1>우리 아이의 기록</h1><p className="page-subtitle">등하원부터 작은 배움까지, 지난 하루를 돌아보세요.</p></div></div>{session.accessReady?<DailyWorkspace records/>:<section className="card"><h2>가족 연결 후 기록을 볼 수 있어요</h2><Link className="button primary" to="/family">가족 연결 확인</Link></section>}</>:<Upcoming/>):['/today','/calendar','/tuition'].includes(pathname)?<Guardian child={child} setChild={setChild} onPreview={setDialog}/>:pathname==='/child'?<ChildHome onPreview={setDialog}/>:<Upcoming/>}
      </main><footer className="page-footer">아이하루 · 가족의 하루를 잇다<span>{demo?'화면 미리보기 · 실제 전송 및 저장 없음':'가족의 정보는 정해진 공유 범위 안에서'}</span></footer>
    </div>{navigation('bottom-nav')}{dialog&&<PreviewDialog title={dialog} onClose={()=>setDialog(null)}/>}
  </div>;
}
export default function App(){return <BrowserRouter><Routes>
  <Route path="/notifications" element={<NotificationsPage/>}/>
  <Route path="/chat" element={<ChatRoute/>}/><Route path="/child/chat" element={<ChatRoute childMode/>}/>
  <Route path="/today/calendar" element={<SchedulePage/>}/><Route path="/today/repeats" element={<SchedulePage mode="repeats"/>}/>
  <Route path="/child/schedules" element={<ChildSchedulePage/>}/>
  <Route path="/calendar" element={<ScheduleAlias/>}/><Route path="/repeats" element={<ScheduleAlias repeats/>}/>
  {['/login','/signup','/forgot-password','/verify-email','/reset-password'].map(path=><Route key={path} path={path} element={<LoginPage key={path}/>}/>)}
  <Route path="/family/verification" element={<GuardianVerificationPage/>}/><Route path="/family/verification/review" element={<GuardianVerificationPage review/>}/>
  <Route path="/family" element={<FamilyPage/>}/><Route path="/family/invite" element={<FamilyInvitePage/>}/>
  <Route path="/device/connect" element={<DeviceConnectPage/>}/><Route path="/child/connected" element={<ConnectedChildPage/>}/>
  <Route path="/phone" element={<PhonePage/>}/><Route path="/account" element={<AccountPage/>}/>
  <Route path="/account/reauth" element={<ReauthPage/>}/><Route path="/account/email" element={<EmailLinkPage/>}/>
  <Route path="/settings" element={<Navigate to="/account" replace/>}/><Route path="*" element={<Shell/>}/>
</Routes></BrowserRouter>;}
function ScheduleAlias({repeats=false}:{repeats?:boolean}){const health=useApi('/api/health',healthResponse);if(health.loading)return <Loading/>;if(health.data?.data.demoEnabled)return <Shell/>;return <Navigate to={repeats?'/today/repeats':'/today/calendar'} replace/>;}


import {PersonalWorkspace,type PersonalMode} from './pages/PersonalWorkspace';
import {useWorkspaceGate} from './components/WorkspaceGate';
import {RouteEffects} from './components/RouteEffects';
import {GuardianVerificationPage} from './pages/GuardianVerification';
import {NotificationsPage} from './pages/Notifications';
import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { envelope, healthSchema, type ChildFilter } from '../../shared/contracts';
import { useApi } from './api';
import { sessionSchema, type SignedInSession } from './auth';
import { AuthLayout,WorkspaceFrame } from './components/AuthLayout';
const TestWorkspace=lazy(()=>import('./testing/TestWorkspace'));
const ChatPage=lazy(()=>import('./pages/Chat').then(m=>({default:m.ChatPage})));
import { DailyWorkspace } from './pages/Daily';
import { Home } from './pages/Home';
import {copy} from './copy';
import {WorkspaceBrand,WorkspaceNavigation} from './components/WorkspaceNavigation';
import {DisplaySettings,Entrance} from './components/Experience';
import { Icon } from './components/Icon';
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
  useEffect(()=> { document.title=`${isChild?'내 하루':'가족의 하루'} · 아이하루`; document.getElementById('main')?.scrollTo(0,0); document.getElementById('main')?.focus({preventScroll:true}); },[pathname,isChild]);
  return <div className={`app ${isChild?'child-mode':''}`}>
    <a className="skip-link" href="#main">본문 바로가기</a>
    <WorkspaceNavigation childMode={isChild}/>
    <div className="app-content"><header className="topbar"><WorkspaceBrand/><div className="workspace-header-context"><span className="header-divider"/><span>우리 가족의 하루</span></div>
      <div className="top-actions"><Link className="test-entry-link" to="/test/today">기능 테스트</Link><DisplaySettings/><button className="font-toggle" aria-label="큰 글씨" aria-pressed={large} onClick={()=>setLarge(v=>!v)}><Icon name="type"/><span>큰 글씨</span></button>{!isChild&&<><Link className="icon-button" to="/notifications" aria-label="알림함"><Icon name="bell"/></Link><Link className="profile-button" to="/settings" aria-label="가족 설정">가</Link></>}</div></header>
      {demo && <div className="demo-bar"><span><span className="demo-dot"/>{copy.demo}</span><div className="preview-toggle" aria-label="미리보기 화면 선택"><Link to="/today" aria-current={!isChild?'page':undefined}>보호자 화면</Link><Link to="/child" aria-current={isChild?'page':undefined}>아이 화면</Link></div></div>}
      <main id="main" tabIndex={-1} className="main">
        <Entrance key={pathname}>{pathname==='/'?<Navigate to="/today" replace/>:!demo?(pathname==='/today'?<Home session={session}/>:pathname==='/records'?<><div className="page-heading"><div><p className="eyebrow">하루하루 쌓이는 가족의 기록</p><h1>우리 아이의 기록</h1><p className="page-subtitle">등하원부터 작은 배움까지, 지난 하루를 돌아보세요.</p></div></div>{session.accessReady?<DailyWorkspace records/>:<section className="card"><h2>가족 연결 후 기록을 볼 수 있어요</h2><Link className="button primary" to="/family">가족 연결 확인</Link></section>}</>:<Upcoming/>):['/today','/calendar','/tuition'].includes(pathname)?<Guardian child={child} setChild={setChild} onPreview={setDialog}/>:pathname==='/child'?<ChildHome onPreview={setDialog}/>:<Upcoming/>}
        </Entrance>
      </main><footer className="page-footer">아이하루 · 가족의 하루를 잇다<span>{demo?'화면 미리보기 · 실제 전송 및 저장 없음':'가족의 정보는 정해진 공유 범위 안에서'}</span></footer>
    </div>{dialog&&<PreviewDialog title={dialog} onClose={()=>setDialog(null)}/>}
  </div>;
}
export default function App(){return <BrowserRouter><RouteEffects/><Routes>
  <Route path="/test/*" element={<Suspense fallback={<Loading label="테스트 작업실을 준비하고 있어요"/>}><TestWorkspace/></Suspense>}/>
  <Route element={<WorkspaceFrame/>}><Route path="/notifications" element={<NotificationsPage/>}/>
  <Route path="/chat" element={<WorkspaceEntry mode="chat"/>}/><Route path="/child/chat" element={<WorkspaceEntry mode="chat"/>}/>
  <Route path="/location" element={<WorkspaceEntry mode="location"/>}/><Route path="/today" element={<WorkspaceEntry mode="home"/>}/><Route path="/tuition" element={<WorkspaceEntry mode="fees"/>}/><Route path="/records" element={<WorkspaceEntry mode="records"/>}/><Route path="/today/calendar" element={<WorkspaceEntry mode="calendar"/>}/><Route path="/today/repeats" element={<WorkspaceEntry mode="repeats"/>}/>

  <Route path="/calendar" element={<ScheduleAlias/>}/><Route path="/repeats" element={<ScheduleAlias repeats/>}/>

  <Route path="/family/verification" element={<GuardianVerificationPage/>}/><Route path="/family/verification/review" element={<GuardianVerificationPage review/>}/>
  <Route path="/family" element={<WorkspaceEntry mode="family"/>}/><Route path="/family/invite" element={<FamilyInvitePage/>}/>

  <Route path="/phone" element={<PhonePage/>}/><Route path="/account" element={<AccountEntry/>}/>
  <Route path="/account/reauth" element={<ReauthPage/>}/><Route path="/account/email" element={<EmailLinkPage/>}/>
  </Route>
  {['/login','/signup','/forgot-password','/verify-email','/reset-password'].map(path=><Route key={path} path={path} element={<LoginPage key={path}/>}/>)}
  <Route path="/device/connect" element={<DeviceConnectPage/>}/><Route path="/child/connected" element={<ConnectedChildPage/>}/><Route path="/child/schedules" element={<ChildSchedulePage/>}/>
  <Route path="/settings" element={<Navigate to="/account" replace/>}/><Route path="*" element={<Shell/>}/>
</Routes></BrowserRouter>;}
function ScheduleAlias({repeats=false}:{repeats?:boolean}){const {health}=useWorkspaceGate();if(health.loading)return <Loading/>;if(health.data?.data.demoEnabled)return <Shell/>;return <Navigate to={repeats?'/today/repeats':'/today/calendar'} replace/>;}



function WorkspaceEntry({mode}:{mode:PersonalMode}){const {search}=useLocation(),{health,session}=useWorkspaceGate();if(health.loading||session.loading)return <AuthLayout wide><Loading/></AuthLayout>;const legacy=new URLSearchParams(search).get('legacy')==='1'||health.data?.data.demoEnabled;if(!legacy&&session.error)return <AuthLayout wide><ErrorState message={session.error} retry={session.retry}/></AuthLayout>;if(!legacy&&session.data?.authenticated&&(session.data.assurance==='LOW'||!session.data.emailVerified))return <Navigate to="/account" replace/>;if(!legacy)return <PersonalWorkspace mode={mode}/>;return mode==='family'?<FamilyPage/>:mode==='calendar'||mode==='repeats'?<SchedulePage mode={mode==='calendar'?'calendar':'repeats'}/>:mode==='chat'?<Suspense fallback={<Loading/>}><ChatPage childMode={location.pathname.startsWith('/child')}/></Suspense>:<Shell/>;}
function AccountEntry(){const {session:s}=useWorkspaceGate();if(s.loading)return <AuthLayout wide><Loading/></AuthLayout>;return s.data?.authenticated?<AccountPage/>:<PersonalWorkspace mode="account"/>;}

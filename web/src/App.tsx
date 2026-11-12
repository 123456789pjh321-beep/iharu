const BriefingPage=lazy(()=>import('./pages/Briefing'));
import {NotificationSettings} from './pages/NotificationSettings';
import {PublicFrame} from './components/PublicFrame';
import {AccountDeletionPage,LegalPage,PrivacyPage} from './pages/Legal';
import {PersonalWorkspace,type PersonalMode} from './pages/PersonalWorkspace';
import {useWorkspaceGate} from './components/WorkspaceGate';
import {RouteEffects} from './components/RouteEffects';
import {LaunchVideoProvider,useLaunchVideo} from './components/LaunchVideo';
import {GuardianVerificationPage} from './pages/GuardianVerification';
import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { envelope, healthSchema, type ChildFilter } from '../../shared/contracts';
import { useApi } from './api';
import { sessionSchema, type SignedInSession } from './auth';
import { AuthLayout,WorkspaceFrame } from './components/AuthLayout';
const TestWorkspace=lazy(()=>import('./testing/TestWorkspace'));
const MarketingPage=lazy(()=>import('./pages/Marketing'));
const AdminConsole=lazy(()=>import('./pages/AdminConsole'));
const ChatPage=lazy(()=>import('./pages/Chat').then(m=>({default:m.ChatPage})));
import { DailyWorkspace } from './pages/Daily';
import { Home } from './pages/Home';
import {copy} from './copy';
import {WorkspaceBrand,WorkspaceNavigation} from './components/WorkspaceNavigation';
import {DisplaySettings,Entrance} from './components/Experience';
import { Icon } from './components/Icon';
import { PreviewDialog, ErrorState, Loading } from './components/Common';
import {RequireWorkspaceAccount} from './components/GuestWorkspace';
import { Guardian } from './pages/Guardian';
import { ChildHome } from './pages/ChildHome';
import { Upcoming } from './pages/Upcoming';
import { LoginPage, PhonePage } from './pages/Login';
import {GroupInvitePage} from './pages/GroupInvite';
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
  if(session.loading)return <AuthLayout wide><Loading label="그룹의 하루를 열고 있어요"/></AuthLayout>;
  if(session.error)return <AuthLayout wide><ErrorState message={session.error} retry={session.retry}/></AuthLayout>;
  if(!session.data?.authenticated)return <Navigate to="/login" replace/>;
  if(session.data.assurance==='LOW')return <Navigate to="/account" replace/>;
  return <Workspace key={session.data.email} demo={false} session={session.data}/>;
}
function Workspace({demo,session}:{demo:true;session?:never}|{demo:false;session:SignedInSession}) {
  const {pathname}=useLocation(); const isChild=demo&&pathname.startsWith('/child');
  const [child,setChild]=useState<ChildFilter>('all');
  const [dialog,setDialog]=useState<string|null>(null);
  useEffect(()=> { document.title=`${isChild?'내 하루':'그룹의 하루'} · 아이하루`; document.getElementById('main')?.scrollTo(0,0); document.getElementById('main')?.focus({preventScroll:true}); },[pathname,isChild]);
  return <div className={`app ${isChild?'child-mode':''}`}>
    <a className="skip-link" href="#main">본문 바로가기</a>
    <WorkspaceNavigation childMode={isChild}/>
    <div className="app-content"><header className="topbar"><WorkspaceBrand/><div className="workspace-header-context"><span className="header-divider"/><span>우리 그룹의 하루</span></div>
      <div className="top-actions"><DisplaySettings/>{!isChild&&<><Link className="icon-button" to="/notifications" aria-label="알림함"><Icon name="bell"/></Link><Link className="profile-button" to="/settings" aria-label="그룹 설정">가</Link></>}</div></header>
      {demo && <div className="demo-bar"><span><span className="demo-dot"/>{copy.demo}</span><div className="preview-toggle" aria-label="미리보기 화면 선택"><Link to="/today" aria-current={!isChild?'page':undefined}>일반사용자 화면</Link><Link to="/child" aria-current={isChild?'page':undefined}>어린이 화면</Link></div></div>}
      <main id="main" tabIndex={-1} className="main">
        <Entrance key={pathname}>{pathname==='/'?<Navigate to="/today" replace/>:!demo?(pathname==='/today'?<Home session={session}/>:pathname==='/records'?<><div className="page-heading"><div><p className="eyebrow">하루하루 쌓이는 그룹의 기록</p><h1>우리 아이의 기록</h1><p className="page-subtitle">등하원부터 작은 배움까지, 지난 하루를 돌아보세요.</p></div></div>{session.accessReady?<DailyWorkspace records/>:<section className="card"><h2>그룹 연결 후 기록을 볼 수 있어요</h2><Link className="button primary" to="/family">그룹 연결 확인</Link></section>}</>:<Upcoming/>):['/today','/calendar','/tuition'].includes(pathname)?<Guardian child={child} setChild={setChild} onPreview={setDialog}/>:pathname==='/child'?<ChildHome onPreview={setDialog}/>:<Upcoming/>}
        </Entrance>
      </main><footer className="page-footer">아이하루 · 그룹의 하루를 잇다<span>{demo?'화면 미리보기 · 실제 전송 및 저장 없음':'그룹의 정보는 정해진 공유 범위 안에서'}</span></footer>
    </div>{dialog&&<PreviewDialog title={dialog} onClose={()=>setDialog(null)}/>}
  </div>;
}
export default function App(){return <BrowserRouter><LaunchVideoProvider><RouteEffects/><Routes>
  <Route element={<PublicFrame/>}>
  <Route path="/invite" element={<GroupInvitePage/>}/>
  {['/service','/guide','/notices','/notices/:slug','/blog','/blog/:slug'].map(path=><Route key={path} path={path} element={<Suspense fallback={<Loading label="아이하루 소개를 열고 있어요"/>}><MarketingPage/></Suspense>}/>)}
  {['/login','/signup','/forgot-password','/verify-email','/reset-password'].map(path=><Route key={path} path={path} element={<LoginPage key={path}/>}/>)}
  </Route>
  <Route path="/test/*" element={<TestWorkspaceEntry/>}/>
  <Route element={<WorkspaceFrame/>}><Route path="/" element={<WorkspaceLanding/>}/><Route path="/notifications" element={<Navigate to="/notification-settings" replace/>}/><Route path="/notification-settings" element={<RequireWorkspaceAccount><NotificationSettings/></RequireWorkspaceAccount>}/>
  <Route path="/more" element={<WorkspaceEntry mode="more"/>}/><Route path="/settings" element={<WorkspaceEntry mode="settings"/>}/>
  <Route path="/help" element={<WorkspaceEntry mode="guide"/>}/>
  <Route path="/account-deletion" element={<AccountDeletionPage/>}/>
  <Route path="/more/service" element={<WorkspaceEntry mode="service"/>}/>
  {(['notices','blog'] as const).flatMap(mode=>[<Route key={mode} path={'/more/'+mode} element={<WorkspaceEntry mode={mode}/>}/>,<Route key={mode+'-post'} path={'/more/'+mode+'/:slug'} element={<WorkspaceEntry mode={mode}/>}/>])}
  <Route path="/admin" element={<RequireWorkspaceAccount><Suspense fallback={<Loading label="관리 화면을 열고 있습니다"/>}><AdminConsole/></Suspense></RequireWorkspaceAccount>}/>
  <Route path="/briefing" element={<RequireWorkspaceAccount><Suspense fallback={<Loading label="브리핑을 열고 있어요"/>}><BriefingPage/></Suspense></RequireWorkspaceAccount>}/>
  <Route path="/chat" element={<WorkspaceEntry mode="chat"/>}/><Route path="/child/chat" element={<WorkspaceEntry mode="chat"/>}/>
  <Route path="/timetable" element={<WorkspaceEntry mode="timetable"/>}/><Route path="/today/timetable" element={<Navigate to="/timetable" replace/>}/><Route path="/legal/:section" element={<LegalPage/>}/><Route path="/privacy" element={<RequireWorkspaceAccount><PrivacyPage/></RequireWorkspaceAccount>}/><Route path="/location" element={<Navigate to="/timetable" replace/>}/><Route path="/today" element={<WorkspaceLanding/>}/><Route path="/tuition" element={<WorkspaceEntry mode="fees"/>}/><Route path="/records" element={<WorkspaceEntry mode="records"/>}/><Route path="/today/calendar" element={<WorkspaceEntry mode="calendar"/>}/><Route path="/today/repeats" element={<WorkspaceEntry mode="repeats"/>}/>

  <Route path="/calendar" element={<ScheduleAlias/>}/><Route path="/repeats" element={<ScheduleAlias repeats/>}/>

  <Route path="/family/verification" element={<GuardianVerificationPage/>}/><Route path="/family/verification/review" element={<GuardianVerificationPage review/>}/>
  <Route path="/family" element={<WorkspaceEntry mode="family"/>}/><Route path="/family/invite" element={<RequireWorkspaceAccount><FamilyInvitePage/></RequireWorkspaceAccount>}/>

  <Route path="/phone" element={<PhonePage/>}/><Route path="/account" element={<RequireWorkspaceAccount><AccountEntry/></RequireWorkspaceAccount>}/>
  <Route path="/account/reauth" element={<RequireWorkspaceAccount><ReauthPage/></RequireWorkspaceAccount>}/><Route path="/account/email" element={<RequireWorkspaceAccount><EmailLinkPage/></RequireWorkspaceAccount>}/>
  </Route>
  <Route path="/device/connect" element={<DeviceConnectPage/>}/><Route path="/child/connected" element={<ConnectedChildPage/>}/><Route path="/child/schedules" element={<ChildSchedulePage/>}/>
  <Route path="*" element={<Shell/>}/>
</Routes></LaunchVideoProvider></BrowserRouter>;}
function WorkspaceLanding(){const {health}=useWorkspaceGate();return health.data?.data.demoEnabled?<Shell/>:<Navigate to="/timetable" replace/>;}
function ScheduleAlias({repeats=false}:{repeats?:boolean}){const {health}=useWorkspaceGate();if(health.loading)return <Loading/>;if(health.data?.data.demoEnabled)return <Shell/>;return <Navigate to={repeats?'/today/repeats':'/today/calendar'} replace/>;}



function WorkspaceEntry({mode}:{mode:PersonalMode}){const {search}=useLocation(),{health,session}=useWorkspaceGate();if(health.loading||session.loading)return <AuthLayout wide><Loading/></AuthLayout>;const legacy=new URLSearchParams(search).get('legacy')==='1'||health.data?.data.demoEnabled;if(!legacy&&session.error)return <AuthLayout wide><ErrorState message={session.error} retry={session.retry}/></AuthLayout>;if(!legacy&&session.data?.authenticated&&session.data.assurance==='LOW')return <Navigate to="/account" replace/>;if(!legacy&&session.data?.authenticated&&!session.data.emailVerified)return <AuthLayout wide><section className="account-card"><span className="badge green">로그인 완료</span><h1>{mode==='home'?'오늘의 일정':'이메일 확인'}</h1><p>개인 자료와 그룹 공유를 사용하려면 이메일을 연결하고 확인해 주세요.</p><Link className="button primary" to="/account/email">이메일 연결</Link></section></AuthLayout>;if(!legacy)return <PersonalWorkspace mode={mode}/>;return mode==='family'?<FamilyPage/>:mode==='calendar'||mode==='repeats'?<SchedulePage mode={mode==='calendar'?'calendar':'repeats'}/>:mode==='chat'?<Suspense fallback={<Loading/>}><ChatPage childMode={location.pathname.startsWith('/child')}/></Suspense>:<Shell/>;}
function AccountEntry(){const {session:s}=useWorkspaceGate();if(s.loading)return <AuthLayout wide><Loading/></AuthLayout>;return s.data?.authenticated?<AccountPage/>:<PersonalWorkspace mode="account"/>;}

// Local demo fixtures are unavailable in production, including direct /test URLs.
function TestWorkspaceEntry(){
 const health=useApi('/api/health',healthResponse);
 const enabled=!health.loading&&health.data?.data.environment!=='production'&&health.data?.data.demoEnabled;
 useLaunchVideo(Boolean(enabled));
 if(health.loading)return <Loading/>;
 return enabled?<Suspense fallback={<Loading/>}><TestWorkspace/></Suspense>:<Navigate to="/login" replace/>;
}

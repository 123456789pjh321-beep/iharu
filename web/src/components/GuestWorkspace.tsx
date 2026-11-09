import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {entryReturnPath,type EntryIntent} from '../../../shared/entry-intent';
import {koreaToday} from '../../../shared/schedules';
import type {PersonalMode} from '../pages/PersonalWorkspace';
import {useWorkspaceGate} from './WorkspaceGate';
import {useEntryAccess} from './EntryAccess';
import {PersonalTimetable} from './PersonalTimetable';
import {PersonalCalendar} from './PersonalCalendar';
import {WorkspaceMore,WorkspaceSettings} from './WorkspaceMore';
import {WorkspaceReader} from './WorkspaceReader';
import {BrandWordmark} from './BrandWordmark';
import {ErrorState,Loading} from './Common';
import {Icon,type IconName} from './Icon';

const privatePages:Record<string,{title:string;icon:IconName;description:string;action:string}>={
 '/chat':{title:'대화',icon:'chat',description:'우리 가족과 연결해 글과 그림으로 소식을 나눠요.',action:'로그인하고 대화하기'},
 '/child/chat':{title:'대화',icon:'chat',description:'내 계정으로 가족과 소식을 나눠요.',action:'로그인하고 대화하기'},
 '/tuition':{title:'학원비',icon:'wallet',description:'학부모 계정에서 학원비와 납부 기록을 함께 관리해요.',action:'로그인하고 학원비 관리'},
 '/records':{title:'메모',icon:'book',description:'가족에게 전할 준비물과 중요한 내용을 남겨요.',action:'로그인하고 메모 남기기'},
 '/family':{title:'가족 관리',icon:'users',description:'로그인한 계정에서 부모 승인번호로 가족을 연결해요.',action:'로그인하고 가족 연결'},
 '/family/invite':{title:'가족 연결',icon:'users',description:'내 계정을 확인한 뒤 가족과 연결할 수 있어요.',action:'로그인하고 가족 연결'},
 '/notification-settings':{title:'알림설정',icon:'bell',description:'로그인 후 내 계정에서 받을 알림을 선택해요.',action:'로그인하고 알림 설정'},
 '/account':{title:'내 계정',icon:'users',description:'내 계정 정보는 로그인한 본인만 확인할 수 있어요.',action:'로그인하고 계정 확인'},
 '/account/email':{title:'이메일 확인',icon:'shield',description:'로그인한 계정의 이메일을 확인하고 관리해요.',action:'로그인하고 계정 확인'},
 '/account/reauth':{title:'본인 확인',icon:'shield',description:'로그인한 계정을 확인한 뒤 계속할 수 있어요.',action:'로그인하고 계정 확인'},
 '/privacy':{title:'개인정보 관리',icon:'shield',description:'내 계정의 동의 내역과 개인정보 요청을 관리해요.',action:'로그인하고 개인정보 관리'},
 '/admin':{title:'계정 확인',icon:'shield',description:'로그인한 계정의 권한을 확인한 뒤 이용할 수 있어요.',action:'로그인하고 계속하기'},
};
export function GuestHeader(){const {requestLogin}=useEntryAccess();return <div className="guest-entry-header"><Link to="/timetable" aria-label="아이하루 시간표"><BrandWordmark/></Link><span>둘러보는 중</span><button type="button" className="button compact" onClick={()=>requestLogin()}>로그인</button></div>;}
export function GuestFeature({path}:{path:string}){
 const location=useLocation(),{requestLogin}=useEntryAccess(),opened=useRef(''),page=privatePages[path]||privatePages['/account'];
 useEffect(()=>{if(opened.current===location.pathname)return;opened.current=location.pathname;requestLogin({title:page.title+' 이용을 위해 로그인해 주세요',description:page.description});},[location.pathname,page.title,page.description,requestLogin]);
 return <section className="guest-feature" aria-labelledby="guest-feature-title"><h1 id="guest-feature-title">{page.title}</h1><div className="guest-feature-card"><span className="guest-feature-icon"><Icon name={page.icon}/></span><h2>우리 가족의 정보는<br/>로그인 후 확인해요</h2><p>{page.description}</p><button type="button" className="button primary" onClick={()=>requestLogin({title:page.title+' 이용을 위해 로그인해 주세요',description:page.description})}>{page.action}</button><Link className="guest-continue" to="/timetable">시간표 계속 둘러보기 <Icon name="arrow"/></Link></div></section>;
}
export function RequireWorkspaceAccount({children}:{children:ReactNode}){
 const {access,session,health}=useWorkspaceGate(),{pathname}=useLocation();
 if(health.data?.data.demoEnabled)return <>{children}</>;
 if(access.status==='checking')return <Loading/>;
 if(access.status==='error')return <AccessError/>;
 if(access.status==='guest'&&!session.data?.authenticated)return <><GuestHeader/><GuestFeature path={pathname}/></>;
 return <>{children}</>;
}
function AccessError(){const gate=useWorkspaceGate();return <ErrorState message={gate.access.error||'계정 상태를 확인하지 못했어요.'} retry={()=>{void gate.refreshAccess();}}/>;}
export function GuestWorkspace({mode}:{mode:PersonalMode}){
 const today=koreaToday(),[day,setDay]=useState(today),[month,setMonth]=useState(today.slice(0,7)),{pathname}=useLocation(),{requestLogin}=useEntryAccess();
 const create=(kind:'EVENT'|'REPEAT',date:string,time?:string)=>{const intent:EntryIntent={type:'create',kind,path:kind==='EVENT'?'/today/calendar':'/timetable',date,...(time?{time}:{})};requestLogin({intent,title:kind==='EVENT'?'일정을 남기려면 로그인해 주세요':'시간표를 만들려면 로그인해 주세요',description:time?`${date} ${time}부터 로그인 후 이어서 입력해요.`:`${date}에 선택한 일정을 로그인 후 이어서 입력해요.`});};
 const readOnly=mode==='service'||mode==='guide'||mode==='notices'||mode==='blog';
 return <div className={'guest-workspace'+(mode==='timetable'||mode==='calendar'?' guest-schedule':'')} data-guest-workspace><GuestHeader/>
  {mode==='timetable'?<><p className="guest-entry-note">시간표를 둘러보고, 빈칸을 눌러 내 계정으로 시작해 보세요.</p><PersonalTimetable day={day} setDay={setDay} items={[]} members={[]} loading={false} create={(date,time)=>create('REPEAT',date,time)} edit={()=>{}}/></>:mode==='calendar'?<><p className="guest-entry-note">달력을 둘러보고, 날짜를 눌러 내 일정을 등록해 보세요.</p><PersonalCalendar month={month} day={day} setMonth={setMonth} setDay={setDay} items={[]} members={[]} create={(date,time)=>create('EVENT',date,time)} edit={()=>{}} guestCreate/></>:readOnly?<WorkspaceReader mode={mode}/>:mode==='more'?<WorkspaceMore me={null}/>:mode==='settings'?<WorkspaceSettings/>:<GuestFeature path={entryReturnPath(pathname)}/>}</div>;
}

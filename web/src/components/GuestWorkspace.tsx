import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {entryReturnPath,type EntryIntent} from '../../../shared/entry-intent';
import {koreaToday} from '../../../shared/schedules';
import {guestSamples,sampleMembers,sampleChildIds} from '../../../shared/guest-samples';
import type {WorkspaceItem} from '../../../shared/workspace';
import type {PersonalMode} from '../pages/PersonalWorkspace';
import {useWorkspaceGate} from './WorkspaceGate';
import {useEntryAccess} from './EntryAccess';
import {PersonalTimetable} from './PersonalTimetable';
import {PersonalCalendar} from './PersonalCalendar';
import {PersonalFees} from './PersonalFees';
import {DateNavigator,WorkspaceToolbar} from './WorkspaceToolbar';
import {GuestChatSample,GuestNotesSample,GuestFamilySample} from './GuestSampleViews';
import {WorkspaceMore,WorkspaceSettings} from './WorkspaceMore';
import {WorkspaceReader} from './WorkspaceReader';
import {ErrorState,Loading} from './Common';
import {Icon,type IconName} from './Icon';

const privatePages:Record<string,{title:string;icon:IconName;description:string;action:string}>={
 '/timeline':{title:'타임라인',icon:'timeline',description:'사진·위치·글을 메모로 남기고 날짜와 카테고리로 찾아보세요.',action:'로그인하고 타임라인 보기'},
 '/briefing':{title:'AI 브리핑',icon:'sparkles',description:'내 시간표와 달력에 맞는 중요한 소식을 사진과 함께 확인해요.',action:'로그인하고 브리핑 보기'},
 '/chat':{title:'대화',icon:'chat',description:'우리 그룹과 연결해 글과 그림으로 소식을 나눠요.',action:'로그인하고 대화하기'},
 '/child/chat':{title:'대화',icon:'chat',description:'내 계정으로 그룹과 소식을 나눠요.',action:'로그인하고 대화하기'},
 '/tuition':{title:'가계부',icon:'wallet',description:'받는 돈과 쓰는 돈을 쉽게 기록해요.',action:'로그인하고 가계부 관리'},
 '/records':{title:'메모',icon:'book',description:'그룹에게 전할 준비물과 중요한 내용을 남겨요.',action:'로그인하고 메모 남기기'},
 '/family':{title:'그룹 관리',icon:'users',description:'초대 링크를 열고 로그인한 뒤 그룹에 참여해요.',action:'로그인하고 그룹 연결'},
 '/family/invite':{title:'그룹 연결',icon:'users',description:'내 계정을 확인한 뒤 그룹과 연결할 수 있어요.',action:'로그인하고 그룹 연결'},
 '/notification-settings':{title:'알림설정',icon:'bell',description:'로그인 후 내 계정에서 받을 알림을 선택해요.',action:'로그인하고 알림 설정'},
 '/account':{title:'내 계정',icon:'users',description:'내 계정 정보는 로그인한 본인만 확인할 수 있어요.',action:'로그인하고 계정 확인'},
 '/account/email':{title:'이메일 확인',icon:'shield',description:'로그인한 계정의 이메일을 확인하고 관리해요.',action:'로그인하고 계정 확인'},
 '/account/reauth':{title:'본인 확인',icon:'shield',description:'로그인한 계정을 확인한 뒤 계속할 수 있어요.',action:'로그인하고 계정 확인'},
 '/privacy':{title:'개인정보 관리',icon:'shield',description:'내 계정의 동의 내역과 개인정보 요청을 관리해요.',action:'로그인하고 개인정보 관리'},
 '/admin':{title:'계정 확인',icon:'shield',description:'로그인한 계정의 권한을 확인한 뒤 이용할 수 있어요.',action:'로그인하고 계속하기'},
};
export function GuestFeature({path}:{path:string}){
 const location=useLocation(),{requestLogin}=useEntryAccess(),opened=useRef(''),page=privatePages[path]||privatePages['/account'];
 useEffect(()=>{if(opened.current===location.pathname)return;opened.current=location.pathname;requestLogin({title:page.title+' 이용을 위해 로그인해 주세요',description:page.description});},[location.pathname,page.title,page.description,requestLogin]);
 return <section className="guest-feature" aria-labelledby="guest-feature-title"><h1 id="guest-feature-title">{page.title}</h1><div className="guest-feature-card"><span className="guest-feature-icon"><Icon name={page.icon}/></span><h2>우리 그룹의 정보는<br/>로그인 후 확인해요</h2><p>{page.description}</p><button type="button" className="button primary" onClick={()=>requestLogin({title:page.title+' 이용을 위해 로그인해 주세요',description:page.description})}>{page.action}</button><Link className="guest-continue" to="/timetable">시간표 계속 둘러보기 <Icon name="arrow"/></Link></div></section>;
}
export function RequireWorkspaceAccount({children}:{children:ReactNode}){
 const {access,session,health}=useWorkspaceGate(),{pathname}=useLocation();
 if(health.data?.data.demoEnabled)return <>{children}</>;
 if(access.status==='checking')return <Loading/>;
 if(access.status==='error')return <AccessError/>;
 if(access.status==='guest'&&!session.data?.authenticated)return <GuestFeature path={pathname}/>;
 return <>{children}</>;
}
function AccessError(){const gate=useWorkspaceGate();return <ErrorState message={gate.access.error||'계정 상태를 확인하지 못했어요.'} retry={()=>{void gate.refreshAccess();}}/>;}
export function GuestWorkspace({mode}:{mode:PersonalMode}){
 const today=koreaToday(),[day,setDay]=useState(today),[month,setMonth]=useState(today.slice(0,7)),{pathname}=useLocation(),{requestLogin}=useEntryAccess();
 const samples=guestSamples(month,today),preview={preview:true,members:sampleMembers,defaultMemberIds:sampleChildIds};
 const create=(kind:'EVENT'|'REPEAT'|'FEE'|'NOTE',date:string,time?:string)=>{
  const paths={EVENT:'/today/calendar',REPEAT:'/timetable',FEE:'/tuition',NOTE:'/records'},names={EVENT:'일정을',REPEAT:'시간표를',FEE:'가계부를',NOTE:'메모를'};
  const intent:EntryIntent={type:'create',kind,path:paths[kind],date,...(time?{time}:{})};
  requestLogin({intent,title:names[kind]+' 입력하려면 로그인해 주세요',description:time?`${date} ${time}부터 내 계정에서 이어서 입력해요.`:`${date}에 내 계정으로 새 내용을 입력해요.`});
 };
 // Only the input position continues after login. Sample titles, people and amounts never do.
 const edit=(item:WorkspaceItem)=>{if(item.kind==='EVENT'||item.kind==='REPEAT'||item.kind==='FEE'||item.kind==='NOTE')create(item.kind,item.data.date,item.data.startTime);};
 const selectMonth=(value:string)=>{setMonth(value);setDay(value+'-01');};
 const login=()=>requestLogin({title:mode==='chat'?'그룹에게 소식을 보내려면 로그인해 주세요':'우리 그룹을 연결하려면 로그인해 주세요'});
 const readOnly=mode==='service'||mode==='guide'||mode==='notices'||mode==='blog';
 return <div className={'guest-workspace'+(['timetable','calendar','repeats'].includes(mode)?' guest-schedule':'')} data-guest-workspace>
  {mode==='timetable'||mode==='repeats'?<PersonalTimetable {...preview} defaultMemberIds={[sampleChildIds[0]]} day={day} setDay={setDay} items={samples.repeats} loading={false} create={(date,time)=>create('REPEAT',date,time)} edit={edit}/>
  :mode==='calendar'?<PersonalCalendar {...preview} month={month} day={day} setMonth={setMonth} setDay={setDay} items={samples.events} create={(date,time)=>create('EVENT',date,time)} edit={edit} guestCreate/>
  :mode==='fees'?<><WorkspaceToolbar title="가계부" navigation={<DateNavigator type="month" value={month} inputLabel="조회 월" onChange={selectMonth}/>} /><section className="account-card fee-workspace"><PersonalFees {...preview} budgetLogin={()=>requestLogin({title:'예산을 저장하려면 로그인해 주세요',description:'내 계정에서 월별 예산을 정하고 지출을 확인해요.'})} defaultMemberIds={sampleMembers.map(m=>m.id)} items={samples.fees} month={month} onMonthChange={selectMonth} edit={edit} create={date=>create('FEE',date||day)}/></section></>
  :mode==='records'?<><WorkspaceToolbar title="메모" navigation={<DateNavigator type="month" value={month} inputLabel="조회 월" onChange={selectMonth}/>} createLabel="메모 추가" onCreate={()=>create('NOTE',day)}/><section className="account-card"><GuestNotesSample items={samples.notes} create={date=>create('NOTE',date)}/></section></>
  :mode==='chat'?<GuestChatSample login={login}/>:mode==='family'?<GuestFamilySample login={login}/>
  :readOnly?<WorkspaceReader mode={mode}/>:mode==='more'?<WorkspaceMore me={null}/>:mode==='settings'?<WorkspaceSettings/>:<GuestFeature path={entryReturnPath(pathname)}/>}</div>;
}

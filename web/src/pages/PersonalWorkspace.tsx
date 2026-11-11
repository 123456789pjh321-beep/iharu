import {WorkspaceReader} from '../components/WorkspaceReader';
import {WorkspaceMore,WorkspaceSettings} from '../components/WorkspaceMore';
import {shiftMonth} from '../components/PeriodPager';
import type {MenuReceipt} from '../../../shared/workspace-updates';
import {legalRequest} from '../legal-api';
import type {LegalState} from '../../../shared/legal';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,Navigate,useLocation} from 'react-router-dom';
import {AuthLayout,FormNotice} from '../components/AuthLayout';
import {Loading,ErrorState} from '../components/Common';
import {GroupInviteManager} from '../components/GroupInviteManager';
import {GuestWorkspace} from '../components/GuestWorkspace';
import {resumeEntry} from '../entry-session';
import {useLaunchVideoActive} from '../components/LaunchVideo';
import {Icon} from '../components/Icon';
import {PlusButton} from '../components/PlusButton';
import {PersonalCalendar} from '../components/PersonalCalendar';
import {PersonalTimetable} from '../components/PersonalTimetable';
import {scheduleAssignee,dailySchedules,chronologicalSchedules} from '../../../shared/workspace-schedules';
import {MonthSwipeArea} from '../components/MonthSwipeArea';
import {PersonalFees} from '../components/PersonalFees';
import {PersonalEditor,type Editor} from '../components/PersonalEditor';
import {MemberPreferenceFilter,useMemberPreference} from '../components/MemberPreferenceFilter';
import {DateNavigator,WorkspaceToolbar} from '../components/WorkspaceToolbar';
import {useOptionalWorkspaceGate} from '../components/WorkspaceGate';
import {PersonalChat} from '../components/PersonalChat';
import {workspaceRequest} from '../workspace-api';
import {authPost} from '../auth';
import {koreaToday,addDays} from '../../../shared/schedules';
import type {ChatPage,MemberFilterScope,WorkspaceMe,WorkspaceItem,WorkspaceKind,WorkspaceMember} from '../../../shared/workspace';
export type PersonalMode='home'|'calendar'|'timetable'|'repeats'|'fees'|'records'|'family'|'chat'|'account'|'location'|'more'|'settings'|'guide'|'notices'|'blog'|'service';
const titles:Record<PersonalMode,string>={service:'서비스 소개',guide:'사용 가이드',notices:'공지사항',blog:'블로그',more:'더보기',settings:'설정',home:'오늘도 함께 챙겨요',calendar:'달력',timetable:'시간표',repeats:'반복 일정',fees:'가계부',records:'메모',family:'그룹 관리',chat:'대화',account:'내 계정',location:'위치'};
const days=['일','월','화','수','목','금','토'];
const won=(value:number)=>new Intl.NumberFormat('ko-KR').format(value)+'원';
export function PersonalWorkspace({mode='home'}:{mode?:PersonalMode}){
 const gate=useOptionalWorkspaceGate();
 if(gate?.access.status==='checking')return <Loading label="나의 하루를 준비하고 있어요"/>;
 if(gate?.access.status==='guest')return <GuestWorkspace mode={mode}/>;
 if(gate?.access.status==='error')return <ErrorState message={gate.access.error||'계정 상태를 확인하지 못했어요.'} retry={()=>{void gate.refreshAccess();}}/>;
 return <SignedInPersonalWorkspace key={gate?.access.identity?.id||'account'} mode={mode}/>;
}
function SignedInPersonalWorkspace({mode}:{mode:PersonalMode}){
 const {search,pathname}=useLocation(),today=koreaToday(),gate=useOptionalWorkspaceGate(),setWorkspaceRole=gate?.setWorkspaceRole,markUpdatesRead=gate?.markUpdatesRead;
 const launchVideoActive=useLaunchVideoActive();
 const [updateReceipt,setUpdateReceipt]=useState<{resource:string;receipt?:MenuReceipt}|null>(null);
 const [legalNeeded,setLegalNeeded]=useState(false);
 const [month,setMonth]=useState(today.slice(0,7)),[day,setDay]=useState(today),[me,setMe]=useState<WorkspaceMe|null>(null),[items,setItems]=useState<WorkspaceItem[]>([]),[loadedKey,setLoadedKey]=useState(''),[loading,setLoading]=useState(true),[unauth,setUnauth]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editor,setEditor]=useState<Editor|null>(null),[chatRevision,setChatRevision]=useState(0);
 const queryMonth=['home','timetable','repeats'].includes(mode)?today.slice(0,7):month;
 const savedMemberPreferences=useRef<Partial<Record<MemberFilterScope,{profileId:string;memberIds:string[];throughRequest:number}>>>({});
 const mutationPending=useRef(false),chatCache=useRef(new Map<string,ChatPage>());
 const seq=useRef(0),monthEnd=new Date(Number(queryMonth.slice(0,4)),Number(queryMonth.slice(5)),0).getDate(),kind=['repeats','timetable'].includes(mode)?'REPEAT':mode==='calendar'?'EVENT':mode==='fees'?'FEE':mode==='records'?'NOTE':undefined,needsItems=['home','calendar','timetable','repeats','fees','records'].includes(mode),resource=mode+':'+queryMonth;
 const paged=['calendar','fees','records'].includes(mode);
 const rangeFrom=paged?addDays(shiftMonth(queryMonth,-2)+'-01',-7):mode==='home'?queryMonth+'-01':addDays(queryMonth+'-01',-7);
 const rangeTo=paged?addDays(shiftMonth(queryMonth,3)+'-01',6):mode==='home'?queryMonth+'-'+monthEnd:addDays(queryMonth+'-'+monthEnd,7);
 const snapshots=useRef(new Map<string,{identity:string;from:string;to:string;items:WorkspaceItem[];time:number}>());
 const identityKey=(identity:WorkspaceMe)=>identity.id+':'+(identity.family?.id||'')+':'+(identity.family?.members.map(member=>member.id).sort().join(',')||'');
 const activeIdentity=useRef('');
 const refresh=useCallback(async()=>{const request=++seq.current;try{const [identity,data]=await Promise.all([workspaceRequest<WorkspaceMe>('me'),needsItems?workspaceRequest<{items:WorkspaceItem[];updateReceipt?:MenuReceipt}>('items.list',{from:rangeFrom,to:rangeTo,...(kind?{kind}:{})}):Promise.resolve<{items:WorkspaceItem[];updateReceipt?:MenuReceipt}>({items:[]})]);if(request!==seq.current)return;for(const [scope,preference] of Object.entries(savedMemberPreferences.current)){if(preference?.profileId===identity.id&&request<=preference.throughRequest){identity.memberFilterPreferences={...identity.memberFilterPreferences,[scope]:preference.memberIds};if(scope==='timetable')identity.timetableMemberIds=preference.memberIds;}}const identityToken=identityKey(identity);if(activeIdentity.current!==identityToken){snapshots.current.clear();chatCache.current.clear();activeIdentity.current=identityToken;}
 const previous=snapshots.current.get(mode);const fresh=previous&&JSON.stringify(previous.items)===JSON.stringify(data.items)?previous.items:data.items;
 snapshots.current.set(mode,{identity:identityToken,from:rangeFrom,to:rangeTo,items:fresh,time:Date.now()});
 setMe(old=>JSON.stringify(old)===JSON.stringify(identity)?old:identity);setWorkspaceRole?.(identity.role);setItems(fresh);setLoadedKey(resource);setUpdateReceipt(old=>{const next={resource,receipt:mode==='family'?identity.updateReceipt:data.updateReceipt};return JSON.stringify(old)===JSON.stringify(next)?old:next;});setError('');setEditor(old=>old?.item&&!old.item.mine&&old.item.ownerId!==identity.id&&!identity.family?.members.some(m=>m.id===old.item!.ownerId)?null:old);}catch(e){if(request!==seq.current)return;snapshots.current.clear();chatCache.current.clear();const err=e as Error&{code?:string};if(err.code==='AUTH_REQUIRED'){setUnauth(true);setMe(null);setItems([]);setEditor(null);}else{setError(err.message);setItems(old=>old.filter(i=>i.mine));setEditor(old=>old?.item&&!old.item.mine?null:old);}}finally{if(request===seq.current)setLoading(false);}},[rangeFrom,rangeTo,kind,mode,needsItems,resource,setWorkspaceRole]);
 useEffect(()=>{void refresh();const onFocus=()=>{if(!document.hidden&&!mutationPending.current)void refresh();};window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);const timer=setInterval(onFocus,5000);return()=>{++seq.current;clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};},[refresh]);
 useEffect(()=>{setEditor(null);setNotice('');},[mode]);
 useEffect(()=>{
  if(!me||loading||loadedKey!==resource)return;
  const intent=resumeEntry(pathname);if(intent?.type!=='create')return;
  if(intent.kind==='FEE'&&me.role!=='PARENT')return;
  setDay(intent.date);setMonth(intent.date.slice(0,7));setEditor({kind:intent.kind,date:intent.date,time:intent.time});
 },[me?.id,loading,loadedKey,resource,pathname]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),3200);return()=>clearTimeout(timer);},[notice]);
 useEffect(()=>{if(me?.role!=='PARENT')return;let active=true;legalRequest<LegalState>('state').then(s=>{if(active)setLegalNeeded(!!s.publication&&!s.accepted);}).catch(()=>{});return()=>{active=false;};},[me?.id,me?.role,mode]);
 useEffect(()=>{const read=()=>{if(updateReceipt?.resource===resource&&loadedKey===resource&&!error&&!editor&&!document.hidden)void markUpdatesRead?.(updateReceipt.receipt);};read();document.addEventListener('visibilitychange',read);return()=>document.removeEventListener('visibilitychange',read);},[updateReceipt,resource,loadedKey,error,editor,markUpdatesRead]);
 const preferenceMembers=me?.family?.members||(me?[{id:me.id,name:me.name,kind:me.role,host:false,version:1}]:[]);
 async function saveMemberPreference(scope:MemberFilterScope,memberIds:string[]){
  if(!me)return;const profileId=me.id,result=await workspaceRequest<{memberIds:string[]}>('member-filter.preference.save',{scope,memberIds});
  savedMemberPreferences.current[scope]={profileId,memberIds:result.memberIds,throughRequest:seq.current};
  setMe(current=>current?.id===profileId?{...current,memberFilterPreferences:{...current.memberFilterPreferences,[scope]:result.memberIds},...(scope==='timetable'?{timetableMemberIds:result.memberIds,timetableMemberId:result.memberIds[0]}:{})}:current);
 }
 const homeSelection=useMemberPreference(preferenceMembers,{viewerId:me?.id,defaultMemberIds:me?.memberFilterPreferences?.home,saveDefaultMembers:ids=>saveMemberPreference('home',ids)});
 useEffect(()=>{if(unauth)void gate?.refreshAccess();},[unauth,gate?.refreshAccess]);
 if(unauth)return <GuestWorkspace mode={mode}/>;
 if(loading&&!me)return <AuthLayout wide><Loading label="나의 하루를 불러오고 있어요"/></AuthLayout>;
 if(!me)return <AuthLayout wide><FormNotice error={error}/><button className="button" onClick={refresh}>다시 확인</button></AuthLayout>;
 if(mode==='fees'&&me.role==='CHILD')return <Navigate to="/timetable" replace/>;
 const cached=snapshots.current.get(mode),ready=loadedKey===resource||!!(cached&&cached.identity===identityKey(me)&&cached.from<=queryMonth+'-01'&&cached.to>=queryMonth+'-'+monthEnd&&Date.now()-cached.time<60000);
 const shown=loadedKey===resource?items:ready&&cached?cached.items:[],events=shown.filter(i=>['EVENT','REPEAT'].includes(i.kind));
 const members=me.family?.members||[{id:me.id,name:me.name,kind:me.role,host:false,version:1}];
 const filterProps=(scope:MemberFilterScope)=>({viewerId:me.id,defaultMemberIds:me.memberFilterPreferences?.[scope]||(scope==='timetable'?(me.timetableMemberIds||(me.timetableMemberId?[me.timetableMemberId]:undefined)):undefined),saveDefaultMembers:(ids:string[])=>saveMemberPreference(scope,ids)});
 const open=(type:WorkspaceKind,date=day,time?:string)=>setEditor({kind:type,date,time}),edit=(item:WorkspaceItem)=>setEditor({kind:item.kind,item,date:item.data.date});
 const selectMonth=(value:string)=>{if(/^\d{4}-\d{2}$/.test(value)){setMonth(value);setDay(value+'-01');}};
 const assignedName=(item:WorkspaceItem)=>scheduleAssignee(item,members);
 const rows=(data:WorkspaceItem[])=>data.length?<div className="personal-item-list">{data.map(item=><article className={'personal-item '+(item.mine?'mine':'shared')} key={item.id} data-item-id={item.id}><button type="button" className="personal-item-main direct-item" onClick={()=>edit(item)} aria-label={item.data.title+' '+(item.mine?'수정':'상세')}><span className="personal-item-category">{item.kind==='REPEAT'?'매주 반복':item.data.date}</span><h3>{item.data.title}</h3><p>{item.data.allDay?'종일':item.data.startTime&&item.data.endTime?item.data.startTime+'–'+item.data.endTime+' ':''}{item.kind==='REPEAT'?' · '+item.data.weekdays.map(n=>days[n]).join('·')+'요일 ':''}{item.data.place}</p>{item.data.note&&<p className="personal-note-text">{item.data.note}</p>}<span className="personal-assignee">{assignedName(item)}</span></button>{item.kind==='FEE'&&<div className="personal-fee-value"><strong>{won(item.data.amount||0)}</strong></div>}</article>)}</div>:<button type="button" className="personal-empty direct-empty" aria-label={mode==='home'?'오늘 일정 등록':'눌러서 등록'} title={mode==='home'?'오늘 일정 등록':'등록'} onClick={()=>open(mode==='fees'?'FEE':mode==='records'?'NOTE':mode==='repeats'?'REPEAT':'EVENT',mode==='home'?today:day)}><Icon name="plus"/>{loadedKey!==resource&&<span role="status">불러오는 중</span>}</button>;
 return <AuthLayout wide personalChild={me.role==='CHILD'}>{legalNeeded&&<div className="auth-notice">새 자료를 등록하거나 변경하기 전에 <Link to="/privacy">이용약관·개인정보 안내 확인</Link>을 진행해 주세요.</div>}{!['chat','home','timetable','calendar','fees','records','repeats','more','settings','guide','notices','blog','service'].includes(mode)&&<div className="workspace-page-heading"><h1>{titles[mode]}</h1></div>}
 {notice&&<div className="workspace-feedback" role="status"><Icon name="check"/>{notice}</div>}<FormNotice error={error} message={(new URLSearchParams(search).get('joined')==='1')?'회원가입과 그룹 연결이 완료됐어요.':''}/>
 {['fees','records','repeats'].includes(mode)&&<WorkspaceToolbar title={titles[mode]} createLabel={mode==='fees'?'가계부 추가':mode==='records'?'메모 추가':'일정 추가'} onCreate={()=>open(mode==='fees'?'FEE':mode==='repeats'?'REPEAT':'NOTE')} navigation={mode==='repeats'?<strong>매주 반복 일정</strong>:<DateNavigator type="month" value={month} inputLabel="조회 월" onChange={selectMonth}/>}/>}
 {mode==='service'||mode==='guide'||mode==='notices'||mode==='blog'?<WorkspaceReader mode={mode} child={me.role==='CHILD'}/>:mode==='more'?<WorkspaceMore me={me}/>:mode==='settings'?<WorkspaceSettings/>:mode==='home'?<div className="personal-home-feed"><section className="account-card" data-home-section="schedule" aria-label="오늘의 일정"><div className="card-title"><h2><Icon name="calendar"/>오늘의 일정</h2><PlusButton label={`${Number(today.slice(5,7))}월 ${Number(today.slice(8))}일 · 일정 등록`} onClick={()=>open('EVENT',today)}/></div><MemberPreferenceFilter className="home-member-filters" members={members} selection={homeSelection} label="오늘 일정 구성원 필터"/>{rows(dailySchedules(events,today,homeSelection.memberIds))}</section>{me.role==='PARENT'&&<section className="account-card" data-home-section="fees" aria-label="가계부"><div className="card-title"><h2><Icon name="wallet"/>가계부</h2><PlusButton label="가계부 등록" onClick={()=>open('FEE',today)}/></div><PersonalFees refresh={refresh} {...filterProps('homeFees')} items={shown} members={members} month={queryMonth} compact edit={edit} create={()=>open('FEE',today)}/></section>}</div>:mode==='family'?<PersonalFamily me={me} refresh={refresh}/>:mode==='account'?<section className="account-card personal-account"><h2>{me.name}</h2><p>{me.loginId?'아이디 · '+me.loginId:'아이하루 계정'}</p><button className="button" onClick={async()=>{if(me.role==='PARENT')await authPost('/api/auth/sign-out',{});else await workspaceRequest('logout');window.location.assign('/timetable');}}>로그아웃</button></section>:mode==='timetable'?<PersonalTimetable key={me.id} {...filterProps('timetable')} day={day} items={events} members={members} loading={!ready} setDay={date=>{setDay(date);setMonth(date.slice(0,7));}} create={(date,time)=>open('REPEAT',date,time)} edit={edit}/>:mode==='calendar'?<PersonalCalendar key={me.id} {...filterProps('calendar')} month={month} day={day} items={events} members={members} loading={!ready} setMonth={setMonth} setDay={setDay} create={(date,time)=>open('EVENT',date,time)} edit={edit}/>:mode==='chat'?<PersonalChat cache={chatCache.current} key={me.id+':'+(me.family?.id||'')} me={me} edit={edit} revision={chatRevision}/>:<section className={'account-card'+(mode==='fees'?' fee-workspace':'')}>{mode==='fees'?<PersonalFees refresh={refresh} loading={!ready} key={me.id} {...filterProps('fees')} items={shown} members={members} month={month} onMonthChange={selectMonth} edit={edit} create={date=>open('FEE',date||day)}/>:mode==='records'?<MonthSwipeArea month={month} onChange={selectMonth}>{pageMonth=>rows(shown.filter(item=>item.data.date.startsWith(pageMonth)))}</MonthSwipeArea>:rows(mode==='repeats'?chronologicalSchedules(shown):shown)}</section>}
 {editor&&!launchVideoActive&&<PersonalEditor key={editor.item?.id||editor.kind+editor.date+(editor.time||'')+(editor.draft?'copy':'')} {...editor} scheduleKind={mode==='calendar'?'EVENT':['timetable','repeats'].includes(mode)?'REPEAT':undefined} me={me} members={members} copy={item=>setEditor({kind:item.kind,draft:item,date:item.data.date})} close={()=>setEditor(null)} saved={async()=>{mutationPending.current=true;try{snapshots.current.clear();setChatRevision(n=>n+1);await refresh();setNotice('변경사항을 저장했어요.');}finally{mutationPending.current=false;}}}/>}
 </AuthLayout>;
}
function PersonalFamily({me,refresh}:{me:WorkspaceMe;refresh:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function run(fn:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setMessage('');try{await fn();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function remove(member:WorkspaceMember){if(!me.family||!window.confirm(member.name+'님을 그룹에서 제외할까요? 서로 자료가 보이지 않지만 각자의 원본은 유지돼요.'))return;await run(async()=>{await workspaceRequest('family.remove',{familyId:me.family!.id,profileId:member.id,version:member.version});setMessage(member.name+'님의 그룹 연결을 해제했어요.');});}
 const canInvite=me.role==='PARENT'&&(!me.family||me.family.isHost);
 async function leave(){
  const family=me.family,self=family?.members.find(member=>member.id===me.id);
  if(!family||!self||!window.confirm('그룹 연결을 해제할까요? 내 자료는 유지돼요.'))return;
  await run(async()=>{await workspaceRequest('family.leave',{familyId:family.id,version:self.version});});
 }
 return <><FormNotice error={error} message={message}/>
 <div className="personal-family-layout">
  <GroupInviteManager canInvite={canInvite} refresh={refresh}/>
  <section className="account-card">
   <div className="card-title"><h2><Icon name="home"/>내 그룹</h2></div>
   {me.family?<><h3>{me.family.name}</h3><p>{me.family.isHost?'내가 호스트예요. 그룹 초대와 구성원을 관리할 수 있어요.':'그룹에서 일정과 공유 자료를 함께 볼 수 있어요.'}</p>
    <button className="button full" disabled={busy||me.family.isHost&&me.family.members.length>1} onClick={()=>void leave()}>그룹 나가기</button>
    {me.family.isHost&&me.family.members.length>1&&<small>호스트는 구성원을 먼저 제외한 뒤 나갈 수 있어요.</small>}
   </>:<p>초대 링크를 받았다면 카카오톡이나 문자에서 열어 참여해 주세요.</p>}
  </section>
 </div>
 {me.family&&<section className="account-card personal-roster"><div className="card-title"><h2>연결된 그룹</h2><span className="badge neutral">호스트 → 연결된 구성원</span></div>{me.family.members.map(member=><article className="personal-member" key={member.id}><span className="personal-member-avatar"><Icon name={member.host?'shield':'users'}/></span><div><strong>{member.name}{member.id===me.id?' · 나':''}</strong><small>{member.host?'호스트 · 초대와 연결 관리':'그룹 구성원'}</small></div>{member.host?<span className="badge green">호스트</span>:me.family!.isHost?<button className="button compact" disabled={busy} onClick={()=>remove(member)} aria-label={'그룹에서 제외: '+member.name}>그룹에서 제외</button>:null}</article>)}</section>}
</>;
}

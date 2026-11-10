import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {useApi} from '../api';
import {familiesSchema,type Family} from '../../../shared/family';
import {dailyTodaySchema,dailyListSchema,type DailyItem} from '../../../shared/daily';
import {scheduleChildrenResponse,calendarResponse,koreaToday,addDays,type Occurrence} from '../../../shared/schedules';
import {Card,Loading,ErrorState} from '../components/Common';
import {Icon} from '../components/Icon';
import {DailyDialog,type DailyForm,type ChildOption} from '../components/DailyForms';
import {FormNotice} from '../components/AuthLayout';
import {scheduleRequest,useScheduleAction} from '../schedules';

const stateLabels:Record<string,string>={OPEN:'할 일',DONE:'완료',CANCELLED:'취소',PROPOSED:'수락 기다리는 중',ACCEPTED:'픽업 약속됨',HANDED_OVER:'만남 기록됨'};
const actionLabels:Record<string,string>={COMPLETE:'다 했어요',REOPEN:'다시 열기',EDIT:'수정',CANCEL:'취소',CORRECT:'정정',DELETE:'삭제',ACCEPT:'제가 맡을게요',HANDOVER:'아이를 만났어요',REASSIGN:'담당 바꾸기',ANNOTATE:'정정 메모'};
const time=(value:string)=>new Date(value).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false});
const datetime=(value:string)=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
function Empty({text}:{text:string}){return <p className="daily-empty">{text}</p>;}

export function DailyWorkspace({records=false}:{records?:boolean}){
 const families=useApi('/api/v1/me',familiesSchema),[search,setSearch]=useSearchParams();
 const family=families.data?.families.find(f=>f.id===search.get('family'))||families.data?.families[0];
 if(families.loading)return <Loading/>;
 if(families.error)return <ErrorState message={families.error} retry={families.retry}/>;
 if(!family)return <section className="card daily-empty"><h2>그룹의 하루를 연결해요</h2><p>함께할 그룹을 만들고 아이의 공유 범위를 확인해 주세요.</p><Link className="button primary" to="/family">우리 그룹 연결</Link></section>;
 return <><div className="daily-family"><label>그룹<select value={family.id} onChange={e=>setSearch({legacy:'1',family:e.target.value})}>{families.data!.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div><FamilyDaily key={`${family.id}:${records}`} family={family} records={records}/></>;
}
function FamilyDaily({family,records}:{family:Family;records:boolean}){
 const children=useApi(`/api/v1/families/${family.id}/schedule-children`,scheduleChildrenResponse),[search,setSearch]=useSearchParams();
 const choices=children.data?.children||[],selected=choices.find(c=>c.id===search.get('child'))?.id||(records?choices[0]?.id||'':'');
 if(children.loading)return <Loading label="함께 볼 아이를 확인하고 있어요"/>;
 if(children.error)return <ErrorState message={children.error} retry={children.retry}/>;
 if(!choices.length)return <section className="card daily-empty"><h2>아직 공유받은 아이가 없어요</h2><p>그룹 관리에서 아이 등록과 공유 상태를 확인해 주세요.</p><Link className="button primary" to="/family">그룹과 아이 관리</Link></section>;
 return <><div className="daily-child-filter" aria-label="아이 선택">{!records&&<button className={`button ${!selected?'primary':''}`} aria-pressed={!selected} onClick={()=>setSearch({legacy:'1',family:family.id})}>모든 아이</button>}{choices.map((c,i)=><button key={c.id} className={`button child-filter-chip ${selected===c.id?'primary':''}`} aria-pressed={selected===c.id} onClick={()=>setSearch({legacy:'1',family:family.id,child:c.id})}><span className={`avatar ${i%2?'peach':'mint'}`} aria-hidden="true">{c.nickname.slice(0,1)}</span>{c.nickname}</button>)}</div>
 {records?<Records key={selected} child={choices.find(c=>c.id===selected)!} serverToday={children.data!.serverToday}/>:<DayBoard key={selected} familyId={family.id} childId={selected} childrenOptions={choices} serverToday={children.data!.serverToday}/>}</>;
}
function DayBoard({familyId,childId,childrenOptions,serverToday,childMode=false}:{familyId?:string;childId:string;childrenOptions:ChildOption[];serverToday:string;childMode?:boolean}){
 const [day,setDay]=useState(serverToday),[revision,setRevision]=useState(0),[message,setMessage]=useState('');
 const url=childMode?`/api/v1/children/${childId}/today`:`/api/v1/families/${familyId}/today?${new URLSearchParams({date:day,...(childId?{childId}:{})})}`;
 return <>
 {!childMode&&<div className="daily-daybar"><label>보는 날짜<input type="date" value={day} min={addDays(serverToday,-89)} max={addDays(serverToday,55)} onChange={e=>{if(e.target.value){setDay(e.target.value);setMessage('');}}}/></label><button className="button quiet" onClick={()=>setDay(serverToday)}>오늘로</button><span>한국 시간 기준</span></div>}
 <div className="daily-daybar"><button className="button quiet" onClick={()=>{setRevision(v=>v+1);setMessage('');}}>최신 기록 확인</button></div><FormNotice message={message}/>
 <DayContents key={`${url}:${revision}`} url={url} familyId={familyId} childId={childId} childrenOptions={childrenOptions} day={day} serverToday={serverToday} childMode={childMode} saved={()=>{setRevision(v=>v+1);setMessage('그룹의 하루에 기록했어요.');}} selectDay={setDay}/>
 </>;
}
function DayContents({url,familyId,childId,childrenOptions,day,serverToday,childMode,saved,selectDay}:{url:string;familyId?:string;childId:string;childrenOptions:ChildOption[];day:string;serverToday:string;childMode:boolean;saved:()=>void;selectDay:(d:string)=>void}){
 const query=useApi(url,dailyTodaySchema,childMode?'child':undefined),[form,setForm]=useState<DailyForm|null>(null),[clock,setClock]=useState(Date.now()),[clockOffset,setClockOffset]=useState(0);
 useEffect(()=>{if(query.data){setClockOffset(Date.now()-Date.parse(query.data.meta.serverNow));setClock(Date.now());}},[query.data]);
 useEffect(()=>{const refresh=()=>{if(!form&&document.visibilityState==='visible')query.retry();};document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);return()=>{document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};},[query.retry,form]);
 useEffect(()=>{const id=setInterval(()=>setClock(Date.now()),30000);return()=>clearInterval(id);},[]);
 const data=query.data?.data,now=new Date(clock-clockOffset).toISOString(),occurrences=data?.occurrences||[];
 const next=day===serverToday?occurrences.filter(o=>o.status==='SCHEDULED'&&Date.parse(o.endsAt)>=Date.parse(now)).sort((a,b)=>Date.parse(a.endsAt)-Date.parse(b.endsAt))[0]:undefined;
 const pending=query.loading?<Loading/>:query.error?<ErrorState message={query.error} retry={query.retry}/>:null;
 const open=(item:DailyItem,action:string)=>setForm({type:item.type,item,action});
 return <div className={`daily-board ${childMode?'child-daily-board':''}`}>
 <Card title={childMode?'내 등하원':'오늘의 등하원'} icon="bag" className="daily-attendance" action={!childMode&&data?<button className="button compact" onClick={()=>setForm({type:'CHECKIN'})}><Icon name="plus"/>기록</button>:undefined}>
  {pending||<><div className="daily-statusline"><span className="badge green">{data!.checkins.filter(c=>!c.voidedAt).length}개의 기록</span>{next&&<span>다음 하원 <strong>{next.endTime}</strong> · {next.childName}</span>}</div>
  {childMode&&<div className="child-arrival-actions"><button className="button primary" onClick={()=>setForm({type:'CHECKIN',kind:'ARRIVED'})}><Icon name="arrival"/><strong>도착했어요</strong></button><button className="button" onClick={()=>setForm({type:'CHECKIN',kind:'DEPARTED'})}><Icon name="departure"/><strong>출발해요</strong></button></div>}
  {occurrences.length===0?<Empty text="오늘은 등록된 일정이 없어요."/>:occurrences.map(o=><AttendanceRow key={o.id} occurrence={o} checkins={data!.checkins.filter(c=>c.occurrenceId===o.id)} childMode={childMode} add={kind=>setForm({type:'CHECKIN',occurrence:o,kind})} pickup={()=>setForm({type:'PICKUP',occurrence:o})}/>)}
  {data!.checkins.filter(c=>!c.occurrenceId).map(c=><RecordItem key={c.id} item={c} open={open} childMode={childMode}/>)}
  <small className="daily-footnote">{childMode?'눌러서 남긴 기록만 보여요.':'일정과 직접 남긴 기록이에요. 도착 여부를 자동으로 판단하지 않아요.'}</small></>}
 </Card>
 {!childMode&&<><Card title="우리 그룹 달력" icon="calendar" className="daily-calendar"><MiniCalendar familyId={familyId!} childId={childId} today={serverToday} day={day} select={selectDay}/></Card><Card title="아이 위치" icon="pin" className="daily-location" action={<span className="badge soft">준비 중</span>}><div className="location-preparing"><span className="location-symbol"><Icon name="pin"/></span><h3>위치 공유를 준비하고 있어요</h3><p>위치 정보는 아직 수집하지 않아요.<br/>현재 위치로 추정해 표시하지 않아요.</p><Link className="text-link" to="/location">공유 안내 보기<Icon name="arrow"/></Link></div></Card></>}
 <Card title={childMode?'오늘 해 볼 일':'오늘의 할 일'} icon="check" className="daily-tasks" action={!childMode&&data?<button className="button compact" onClick={()=>setForm({type:'TASK'})}><Icon name="plus"/>할 일 추가</button>:undefined}>
  {pending||<>{data!.tasks.length?data!.tasks.map(t=><RecordItem key={t.id} item={t} open={open} childMode={childMode}/>):<Empty text={childMode?'지금 할 일이 없어요. 잠깐 쉬어 가요.':'오늘 할 일을 가볍게 적어 보세요.'}/>}</>}
 </Card>
 <Card title={childMode?'누가 데리러 올까요?':'픽업 약속'} icon="home" className="daily-pickups" action={!childMode&&data?<button className="button compact" onClick={()=>setForm({type:'PICKUP'})}><Icon name="plus"/>픽업 요청</button>:undefined}>
  {pending||<>{data!.pickups.length?data!.pickups.map(p=><RecordItem key={p.id} item={p} open={open} childMode={childMode}/>):<Empty text={childMode?'아직 정해진 픽업 약속이 없어요.':'아이를 만날 그룹과 시간을 정해 주세요.'}/>}</>}
 </Card>
 {!childMode&&<><Card title="오늘의 배움" icon="book" className="daily-learning" action={data?<button className="button compact" onClick={()=>setForm({type:'LEARNING'})}><Icon name="plus"/>메모 추가</button>:undefined}>{pending||<>{data!.recent.length?data!.recent.map(l=><RecordItem key={l.id} item={l} open={open}/>):<Empty text="작은 배움과 변화를 한 줄로 남겨요."/>}<Link className="text-link" to={`/records?${new URLSearchParams({family:familyId!,...(childId?{child:childId}:{})})}`}>지난 기록 모아 보기<Icon name="arrow"/></Link></>}</Card><Card title="이번 달 가계부" icon="wallet" className="daily-fees" action={<span className="badge soft">준비 중</span>}><p>가계부 기록은 후속 업데이트에서 연결할 예정이에요.</p><Link className="text-link" to="/tuition">가계부 안내<Icon name="arrow"/></Link></Card></>}
 {data?.truncated&&<p className="daily-limit" role="status">표시할 항목이 많아요. 아이를 선택하거나 달력·기록 메뉴에서 더 확인해 주세요.</p>}
 {form&&data&&<DailyDialog form={form} childrenOptions={childrenOptions} childId={childId} occurrences={occurrences} serverNow={now} childMode={childMode} close={()=>setForm(null)} saved={saved}/>}
 </div>;
}
function AttendanceRow({occurrence:o,checkins,childMode,add,pickup}:{occurrence:Occurrence;checkins:DailyItem[];childMode:boolean;add:(kind:'ARRIVED'|'DEPARTED')=>void;pickup:()=>void}){
 const active=!['CANCELLED','SKIPPED'].includes(o.status),labels={SCHEDULED:'진행 일정',NEEDS_CONFIRMATION:'진행 확인 필요',SKIPPED:'휴강',CANCELLED:'취소'};
 return <article className={`daily-attendance-row ${!active?'daily-muted':''}`}><div className="daily-time"><strong>{o.startTime}</strong><small>{o.endTime}</small></div><div className="daily-attendance-body"><small>{o.childName}</small><h3>{o.title}</h3><span className={`badge ${o.status==='SCHEDULED'?'green':'amber'}`}>{labels[o.status]}</span>{o.place&&<p>{o.place}</p>}{o.reason&&<small>{o.reason}</small>}<div className="daily-checkin-tags">{checkins.map(c=><span key={c.id} className={`badge ${c.voidedAt?'neutral':'green'}`}>{c.kind==='ARRIVED'?'도착':'출발'} {time(c.happenedAt!)}{c.voidedAt?' · 정정됨':''}</span>)}</div>{active&&<div className="card-actions"><button className="button compact" onClick={()=>add('ARRIVED')}><Icon name="arrival"/>도착</button><button className="button compact" onClick={()=>add('DEPARTED')}><Icon name="departure"/>출발</button>{!childMode&&<button className="button quiet compact" onClick={pickup}>픽업 요청</button>}</div>}</div></article>;
}
export function RecordItem({item,open,childMode=false}:{item:DailyItem;open:(i:DailyItem,action:string)=>void;childMode?:boolean}){
 const i=item,title=i.type==='CHECKIN'?`${i.kind==='ARRIVED'?'도착':'출발'}${i.voidedAt?' · 정정된 원본':''}`:i.type==='TASK'?i.title:i.type==='LEARNING'?i.subject||'학습 메모':i.assigneeName||'담당 미정';
 return <article className={`daily-record ${i.state==='DONE'||i.voidedAt?'daily-muted':''}`} data-record-id={i.id}><div className="daily-record-heading"><small>{childMode?'':i.childName}</small>{i.state&&<span className={`badge ${['DONE','ACCEPTED','HANDED_OVER'].includes(i.state)?'green':'soft'}`}>{stateLabels[i.state]||i.state}</span>}</div><h3>{title}</h3>
  {i.type==='CHECKIN'&&<><p>{datetime(i.happenedAt!)} · {i.occurrenceTitle||'직접 남긴 기록'}</p>{i.supersedesId&&<small>원본을 정정한 기록</small>}{i.reason&&<p>{i.reason}</p>}</>}
  {i.type==='TASK'&&<>{i.detail&&<p className="daily-prewrap">{i.detail}</p>}{i.dueAt&&<small>마감 {datetime(i.dueAt)}</small>}{i.sourceUrl?.startsWith('https://')&&<a className="text-link" href={i.sourceUrl} target="_blank" rel="noopener noreferrer">{i.sourceName||'출처 보기'}<Icon name="arrow"/></a>}</>}
  {i.type==='LEARNING'&&<><p className="daily-prewrap">{i.content}</p><small>{i.learningDate}</small>{i.taskId&&<p className="account-caption">연결한 할 일: {i.taskTitle||'지금은 확인할 수 없는 할 일'}</p>}</>}
  {i.type==='PICKUP'&&<><p><Icon name="clock"/> {time(i.scheduledAt!)}{i.place?` · ${i.place}`:''}</p>{i.memo&&<p className="daily-prewrap">{i.memo}</p>}{childMode&&<small>{i.state==='PROPOSED'?'일반사용자가 확인하고 있어요.':i.state==='ACCEPTED'?'이 그룹이 데리러 올 예정이에요.':'그룹이 남긴 픽업 기록이에요.'}</small>}{!childMode&&i.history&&<details><summary>변경 이력 {i.history.length}개</summary><ol>{i.history.map((h,n)=><li key={n}>{datetime(h.at)} · {h.actorName}<br/>{({CREATE:'요청 등록',ACCEPT:'담당 수락',HANDOVER:'만남 기록',REASSIGN:'담당 변경',CANCEL:'요청 취소',ANNOTATE:'정정 메모',ASSIGNEE_REVOKED:'공유 종료로 담당 해제'} as Record<string,string>)[h.action]||h.action}{h.reason&&` · ${h.reason}`}</li>)}</ol></details>}</>}
  {!childMode&&<small className="daily-author">처음 남긴 그룹: {i.authorName}{i.version>1?` · 최근 변경: ${i.editorName}`:''}</small>}
  {i.actions.length>0&&<div className="card-actions">{i.actions.map(a=><button key={a} className={`button ${['COMPLETE','ACCEPT','HANDOVER'].includes(a)?'primary':''} ${childMode?'child-cta':'compact'}`} onClick={()=>open(i,a)}>{a==='COMPLETE'&&<Icon name="check"/>}{actionLabels[a]||a}</button>)}</div>}
 </article>;
}
function MiniCalendar({familyId,childId,today,day,select}:{familyId:string;childId:string;today:string;day:string;select:(s:string)=>void}){
 const [month,setMonth]=useState(day.slice(0,7)),min=addDays(today,-89),max=addDays(today,55),[y,m]=month.split('-').map(Number),count=new Date(Date.UTC(y,m,0)).getUTCDate(),first=new Date(month+'-01T00:00:00Z').getUTCDay();
 const from=month+'-01'<min?min:month+'-01',end=month+'-'+count,to=end>max?max:end;
 const query=useApi(`/api/v1/families/${familyId}/calendar?${new URLSearchParams({from,to,...(childId?{childId}:{})})}`,calendarResponse);
 const move=(delta:number)=>setMonth(new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7));
 return <><div className="calendar-toolbar"><h3>{y}년 {m}월</h3><div className="calendar-arrows"><button className="icon-button" aria-label="달력 이전 달" disabled={month<=min.slice(0,7)} onClick={()=>move(-1)}><Icon name="chevron" className="flip"/></button><button className="icon-button" aria-label="달력 다음 달" disabled={month>=max.slice(0,7)} onClick={()=>move(1)}><Icon name="chevron"/></button></div></div>
 {query.loading?<Loading label="달력을 불러오고 있어요"/>:query.error?<ErrorState message={query.error} retry={query.retry}/>:<><div className="calendar-grid daily-mini-calendar">{['일','월','화','수','목','금','토'].map(w=><span key={w} className="weekday">{w}</span>)}{Array.from({length:first},(_,i)=><span key={`pad-${i}`}/>)}{Array.from({length:count},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0'),names=query.data!.holidays.filter(h=>h.date===date).map(h=>h.name).join(' · '),n=query.data!.dayCounts.find(d=>d.date===date)?.count||0;return <button key={date} className={`calendar-day ${date===day?'selected':''} ${names?'holiday':''}`} aria-label={`${date}${names?' '+names:''}, 일정 ${n}개`} aria-pressed={date===day} disabled={date<min||date>max} onClick={()=>select(date)}><span>{i+1}</span><small>{names|| (n?`${n}개`:'')}</small></button>;})}</div><div className="daily-holiday-legend">{query.data!.holidays.map(h=><span key={h.date+h.name}>{Number(h.date.slice(8))}일 {h.name}</span>)}</div>{query.data!.holidayYears.some(y=>y.state!=='READY')&&<p className="account-caption">공휴일 정보는 갱신 확인이 필요해요. 기관 휴강은 따로 확인해 주세요.</p>}</>}
 <Link className="text-link" to={`/today/calendar?${new URLSearchParams({family:familyId,day,...(childId?{child:childId}:{})})}`}>월간 일정과 반복 일정 관리<Icon name="arrow"/></Link></>;
}
function Records({child,serverToday}:{child:ChildOption;serverToday:string}){
 const [kind,setKind]=useState('ALL'),[from,setFrom]=useState(addDays(serverToday,-29)),[to,setTo]=useState(serverToday),[revision,setRevision]=useState(0);
 const url=`/api/v1/children/${child.id}/records?${new URLSearchParams({kind,from,to})}`;
 return <><div className="daily-record-filters"><label>기록 종류<select value={kind} onChange={e=>setKind(e.target.value)}>{[['ALL','모든 기록'],['CHECKIN','등하원'],['TASK','할 일'],['LEARNING','학습 메모'],['PICKUP','픽업']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>시작 날짜<input type="date" value={from} min={addDays(serverToday,-89)} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>끝 날짜<input type="date" value={to} min={from} max={serverToday} onChange={e=>setTo(e.target.value)}/></label></div><p className="account-caption">등하원 시각, 할 일의 등록·마감 처리, 학습일, 픽업 약속 날짜를 기준으로 최근 기록을 모아요.</p>
 <RecordList key={`${url}:${revision}`} url={url} child={child} changed={()=>setRevision(v=>v+1)}/></>;
}
function RecordList({url,child,changed}:{url:string;child:ChildOption;changed:()=>void}){
 const query=useApi(url,dailyListSchema),action=useScheduleAction(),[more,setMore]=useState<DailyItem[]>([]),[cursor,setCursor]=useState<string|null|undefined>(),[form,setForm]=useState<DailyForm|null>(null);
 if(query.loading)return <Loading label="지난 기록을 불러오고 있어요"/>;
 if(query.error)return <ErrorState message={query.error} retry={query.retry}/>;
 const rows=[...query.data!.data.items,...more],next=cursor===undefined?query.data!.meta.nextCursor:cursor;
 return <section className="card daily-record-list"><FormNotice error={action.error}/>{rows.length?rows.map(i=><RecordItem key={i.id} item={i} open={(item,action)=>setForm({type:item.type,item,action})}/>):<Empty text="이 기간에 남긴 기록이 없어요."/>}{next&&<button className="button full" disabled={action.busy} onClick={()=>action.run(async()=>{const res=dailyListSchema.parse(await scheduleRequest(`${url}&cursor=${next}`));setMore(old=>[...new Map([...old,...res.data.items].map(i=>[i.id,i])).values()]);setCursor(res.meta.nextCursor);})}>이전 기록 더 보기</button>}{form&&<DailyDialog form={form} childId={child.id} childrenOptions={[child]} occurrences={[]} serverNow={query.data!.meta.serverNow} close={()=>setForm(null)} saved={changed}/>}</section>;
}
export function ChildDailyContent({childId,nickname}:{childId:string;nickname:string}){return <DayBoard childMode childId={childId} childrenOptions={[{id:childId,nickname}]} serverToday={koreaToday()}/>;}


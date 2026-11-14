import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {Link,Navigate} from 'react-router-dom';
import {koreaToday} from '../../../shared/schedules';
import {matchesMember,scheduleAssignee} from '../../../shared/workspace-schedules';
import {ledgerFlow} from '../../../shared/ledger';
import {timelineAmount,timelineEntries,timelineKey,timelineRange,type TimelineAnnotation,type TimelineData,type TimelineEntry,type TimelineKind,type TimelinePatch,type TimelinePeriod} from '../../../shared/timeline';
import type {WorkspaceMe} from '../../../shared/workspace';
import {AuthLayout} from '../components/AuthLayout';
import {ErrorState,Loading} from '../components/Common';
import {GroupInviteShareButton} from '../components/GroupInviteShare';
import {Icon,type IconName} from '../components/Icon';
import {useWorkspaceGate} from '../components/WorkspaceGate';
import {WorkspaceToolbar} from '../components/WorkspaceToolbar';
import {workspaceRequest} from '../workspace-api';
import './timeline.css';

const sources:Record<TimelineKind,{label:string;icon:IconName;path:string}>={
 REPEAT:{label:'시간표',icon:'clock',path:'/timetable'},
 EVENT:{label:'달력',icon:'calendar',path:'/today/calendar'},
 FEE:{label:'가계부',icon:'wallet',path:'/tuition'},
};
const sourceOrder:TimelineKind[]=['REPEAT','EVENT','FEE'];
const dayFormat=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'UTC'});
const rangeFormat=new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});
const asDate=(value:string)=>new Date(value+'T12:00:00Z');
const errorText=(error:unknown)=>error instanceof Error?error.message:'다시 시도해 주세요.';
const pageSize=40;
type EntryStatus='all'|'unreviewed'|'reviewed'|'saved'|'noted';

export default function TimelinePage(){
 const {access,session,health}=useWorkspaceGate();
 if(session.data?.authenticated&&session.data.assurance==='LOW')return <Navigate to="/account" replace/>;
 if(session.data?.authenticated&&!session.data.emailVerified)return <Navigate to="/account/email" replace/>;
 if(!access.identity)return <AuthLayout wide><WorkspaceToolbar title="타임라인"/>{health.data?.data.demoEnabled?<p className="timeline-empty">로그인한 계정에서 타임라인을 이용할 수 있어요.</p>:<Loading/>}</AuthLayout>;
 return <Timeline key={access.identity.id} me={access.identity}/>;
}

function Timeline({me}:{me:WorkspaceMe}){
 const today=koreaToday();
 const [period,setPeriod]=useState<TimelinePeriod>('recent'),[month,setMonth]=useState(today.slice(0,7));
 const [source,setSource]=useState<TimelineKind|'all'>('all'),[member,setMember]=useState('all');
 const [status,setStatus]=useState<EntryStatus>('all'),[query,setQuery]=useState('');
 const [limit,setLimit]=useState(pageSize),[retry,setRetry]=useState(0);
 const [writesSettled,setWritesSettled]=useState(0);
 const [result,setResult]=useState<{key:string;data?:TimelineData;error?:string}>();
 const [message,setMessage]=useState('');
 const writeRevision=useRef(0),pendingWrites=useRef(0);
 const {from,to}=timelineRange(period,today,month),rangeKey=from+':'+to;
 const current=result?.key===rangeKey?result:undefined,data=current?.data;
 const members=me.family?.members||[{id:me.id,name:me.name,kind:me.role,host:false,version:1}];
 const selectableSources=me.role==='CHILD'?sourceOrder.filter(kind=>kind!=='FEE'):sourceOrder;
 const entries=useMemo(()=>timelineEntries(data?.items||[],from,to),[data?.items,from,to]);
 const annotations=useMemo(()=>new Map(data?.annotations.map(a=>[timelineKey(a.itemId,a.date),a])),[data?.annotations]);

 useEffect(()=>{
  let active=true,loading=false;
  const load=async()=>{
   if(loading||pendingWrites.current)return;
   const revision=writeRevision.current;
   loading=true;
   try{
    const data=await workspaceRequest<TimelineData>('timeline.read',{from,to});
    if(active&&revision===writeRevision.current)setResult({key:rangeKey,data});
   }catch(error){
    if(active&&revision===writeRevision.current){
     const code=(error as {code?:string}).code;
     // A temporary refresh failure must not unmount cards and erase unsaved notes.
     // Authentication/authorization failures still discard previously loaded data.
     const temporary=!code||code==='UNAVAILABLE'||code==='RATE_LIMITED';
     setResult(old=>({key:rangeKey,data:temporary&&old?.key===rangeKey?old.data:undefined,error:errorText(error)}));
    }
   }finally{loading=false;}
  };
  const refresh=()=>{if(!document.hidden)void load();};
  void load();
  const timer=window.setInterval(refresh,15000);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',refresh);
  return ()=>{
   active=false;window.clearInterval(timer);
   window.removeEventListener('focus',refresh);
   document.removeEventListener('visibilitychange',refresh);
  };
 },[from,to,rangeKey,retry,writesSettled]);

 const search=query.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');
 const filtered=entries.filter(entry=>{
  const a=annotations.get(entry.key);
  if(source!=='all'&&entry.kind!==source||!matchesMember(entry.item,member))return false;
  if(status==='saved'&&!a?.saved||status==='reviewed'&&!a?.reviewed||status==='unreviewed'&&a?.reviewed||status==='noted'&&!a?.note)return false;
  if(!search)return true;
  const {title,place,note}=entry.item.data;
  return [title,place,note,a?.note,scheduleAssignee(entry.item,members)].some(value=>value?.normalize('NFKC').toLocaleLowerCase('ko-KR').includes(search));
 });
 const groups=new Map<string,TimelineEntry[]>();
 for(const entry of filtered.slice(0,limit)){
  const day=groups.get(entry.date);
  if(day)day.push(entry);else groups.set(entry.date,[entry]);
 }

 async function annotate(entry:TimelineEntry,patch:TimelinePatch){
  writeRevision.current++;pendingWrites.current++;
  let next:TimelineAnnotation;
  try{
   next=await workspaceRequest<TimelineAnnotation>('timeline.annotate',{itemId:entry.item.id,date:entry.date,...patch});
  }finally{
   writeRevision.current++;pendingWrites.current--;
   // A range selected during a write skipped its first read. Refresh it immediately.
   if(!pendingWrites.current)setWritesSettled(value=>value+1);
  }
  setResult(old=>{
   if(old?.key!==rangeKey||!old.data)return old;
   return {...old,data:{...old.data,annotations:[...old.data.annotations.filter(a=>timelineKey(a.itemId,a.date)!==entry.key),next]}};
  });
  setMessage(patch.saved!==undefined?(next.saved?'항목을 보관했어요.':'보관을 해제했어요.'):patch.reviewed!==undefined?(next.reviewed?'확인했어요.':'확인 표시를 해제했어요.'):next.note?'메모를 저장했어요.':'메모를 지웠어요.');
 }
 function resetFilters(){
  setSource('all');setMember('all');setStatus('all');setQuery('');setLimit(pageSize);
 }
 function reload(){
  setResult(old=>old?.data?old:undefined);
  setRetry(previous=>previous+1);
 }
 const hasFilters=source!=='all'||member!=='all'||status!=='all'||!!search;
 const hasFuture=period==='upcoming';
 return <AuthLayout wide personalChild={me.role==='CHILD'}>
  <div className="timeline-page">
   <WorkspaceToolbar title="타임라인"><GroupInviteShareButton/></WorkspaceToolbar>
   <section className="timeline-filters" aria-label="타임라인 필터">
    <div className="timeline-sources" role="group" aria-label="항목 종류">
     <button type="button" className="timeline-chip" aria-pressed={source==='all'} onClick={()=>{setSource('all');setLimit(pageSize);}}>전체</button>
     {selectableSources.map(kind=><button key={kind} type="button" className="timeline-chip" data-kind={kind} aria-pressed={source===kind}
      onClick={()=>{setSource(kind);setLimit(pageSize);}}><Icon name={sources[kind].icon}/>{sources[kind].label}</button>)}
    </div>
    <div className="timeline-filter-fields">
     <label className="timeline-select"><span>기간</span><select value={period} onChange={e=>{setPeriod(e.target.value as TimelinePeriod);setLimit(pageSize);}}>
      <option value="recent">최근 30일</option><option value="upcoming">예정 30일</option><option value="month">월 선택</option>
     </select></label>
     {period==='month'&&<label className="timeline-select"><span>조회 월</span><input type="month" min="1900-01" max="2099-12" value={month}
      onChange={e=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)&&e.target.value>='1900-01'&&e.target.value<='2099-12'){setMonth(e.target.value);setLimit(pageSize);}}}/></label>}
     <label className="timeline-select"><span>구성원</span><select value={member} onChange={e=>{setMember(e.target.value);setLimit(pageSize);}}>
      <option value="all">전체</option>{members.map(person=><option value={person.id} key={person.id}>{person.name}</option>)}
     </select></label>
     <label className="timeline-select"><span>상태</span><select value={status} onChange={e=>{setStatus(e.target.value as EntryStatus);setLimit(pageSize);}}>
      <option value="all">전체</option><option value="unreviewed">미확인</option><option value="reviewed">확인</option><option value="saved">보관</option><option value="noted">메모 있음</option>
     </select></label>
     <label className="timeline-search"><Icon name="search"/><span className="sr-only">항목 검색</span>
      <input type="search" placeholder="일정·거래·메모 검색" value={query} maxLength={100} onChange={e=>{setQuery(e.target.value);setLimit(pageSize);}}/>
     </label>
    </div>
   </section>
   <p className="sr-only" role="status">{message}</p>
   {!current?<Loading label="타임라인을 불러오고 있어요"/>:current.error&&!data?
    <ErrorState message={current.error} retry={reload}/>:<section className="timeline-results" aria-label="타임라인 기록">
     {current.error&&<div className="timeline-refresh-notice" role="status">
      <span>최신 기록을 불러오지 못했어요. 표시된 기록과 작성 중인 메모는 유지했어요.</span>
      <button type="button" className="button" onClick={reload}>다시 불러오기</button>
     </div>}
     <div className="timeline-result-bar">
      <span>{rangeFormat.formatRange(asDate(from),asDate(to))}</span>
      <span aria-live="polite"><strong>{filtered.length}건</strong> <span aria-hidden="true">·</span> 최신순</span>
     </div>
     {groups.size===0?<div className="timeline-empty">
      <Icon name="timeline"/>
      <h2>{hasFilters?'필터에 맞는 기록이 없어요':hasFuture?'예정된 기록이 없어요':'이 기간에 기록이 없어요'}</h2>
      {hasFilters&&<button type="button" className="button" onClick={resetFilters}>필터 초기화</button>}
     </div>:Array.from(groups,([date,items])=><section className="timeline-day" key={date} aria-label={dayFormat.format(asDate(date))}>
      <h2><time dateTime={date}>{dayFormat.format(asDate(date))}</time>{date===today&&<span>오늘</span>}</h2>
      <ol>{items.map(entry=><TimelineCard key={entry.key} entry={entry} annotation={annotations.get(entry.key)}
       assignee={scheduleAssignee(entry.item,members)} annotate={patch=>annotate(entry,patch)}/>)}</ol>
     </section>)}
     {filtered.length>limit&&<button type="button" className="button timeline-more" onClick={()=>setLimit(value=>value+pageSize)}>기록 더 보기 <Icon name="chevron"/></button>}
    </section>}
  </div>
 </AuthLayout>;
}

function TimelineCard({entry,annotation,assignee,annotate}:{
 entry:TimelineEntry;annotation?:TimelineAnnotation;assignee:string;annotate:(patch:TimelinePatch)=>Promise<void>;
}){
 const {kind,item}=entry,{title,place,note}=item.data,source=sources[kind];
 const id=useId(),noteButton=useRef<HTMLButtonElement>(null),pending=useRef(false);
 const [draft,setDraft]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<{message:string;requiresConsent:boolean}>();
 const reviewed=annotation?.reviewed===true,saved=annotation?.saved===true;
 async function write(patch:TimelinePatch){
  if(pending.current)return;
  pending.current=true;setBusy(true);setError(undefined);
  try{
   await annotate(patch);
   if(patch.note!==undefined){setDraft(null);requestAnimationFrame(()=>noteButton.current?.focus());}
  }catch(error){setError({message:errorText(error),requiresConsent:(error as {code?:string}).code==='LEGAL_ACCEPTANCE_REQUIRED'});}
  finally{pending.current=false;setBusy(false);}
 }
 return <li className="timeline-item" data-kind={kind}>
  <span className="timeline-point" aria-hidden="true"><Icon name={source.icon}/></span>
  <article className="timeline-card" aria-labelledby={id} data-saved={saved}>
   <div className="timeline-card-top">
    <div className="timeline-card-body">
     <div className="timeline-meta"><span className="timeline-kind">{source.label}</span><span>{assignee}</span></div>
     <h3 id={id}>{title}</h3>
     <p className="timeline-details">{entry.caption}{place&&<><span aria-hidden="true"> · </span>{place}</>}{item.fee&&ledgerFlow(item)==='EXPENSE'&&<><span aria-hidden="true"> · </span>{item.fee.paid?'지출 완료':'미결제'}</>}</p>
    </div>
    {kind==='FEE'&&<strong className="timeline-amount" data-flow={ledgerFlow(item)}>{timelineAmount(item)}</strong>}
   </div>
   {note&&<p className="timeline-source-note">{note}</p>}
   {!!annotation?.note&&draft===null&&<p className="timeline-private-note"><Icon name="book"/><span><strong>내 메모</strong>{annotation.note}</span></p>}
   <div className="timeline-card-actions">
    <button type="button" className="timeline-action" aria-pressed={reviewed} disabled={busy} onClick={()=>void write({reviewed:!reviewed})}><Icon name="check"/>{reviewed?'확인됨':'확인'}</button>
    <button type="button" ref={noteButton} className="timeline-action" aria-expanded={draft!==null} disabled={busy} onClick={()=>{setError(undefined);setDraft(draft===null?(annotation?.note||''):null);}}><Icon name="type"/>메모</button>
    <button type="button" className="timeline-action" aria-pressed={saved} disabled={busy} onClick={()=>void write({saved:!saved})}><Icon name="bookmark"/>{saved?'보관됨':'보관'}</button>
    <Link to={source.path} className="timeline-source-link" title={source.label+'에서 보기'} aria-label={source.label+'에서 보기'}><span>{source.label}에서 보기</span><Icon name="chevron"/></Link>
   </div>
   {draft!==null&&<form className="timeline-note-form" onSubmit={e=>{e.preventDefault();void write({note:draft.trim()});}}>
    <label htmlFor={id+'-note'}>내 메모 <small>나만 볼 수 있어요</small></label>
    <textarea id={id+'-note'} rows={3} maxLength={2000} value={draft} disabled={busy} autoFocus onChange={e=>setDraft(e.target.value)} placeholder="기억하고 싶은 내용을 적어 보세요."/>
    <div className="timeline-note-actions">
     {annotation?.note&&<button type="button" className="button timeline-delete-note" disabled={busy} onClick={()=>void write({note:''})}>메모 삭제</button>}
     <button type="button" className="button" disabled={busy} onClick={()=>{setDraft(null);noteButton.current?.focus();}}>취소</button>
     <button type="submit" className="button primary" disabled={busy||!draft.trim()||draft.trim()===(annotation?.note||'')}>메모 저장</button>
    </div>
   </form>}
   {error&&<p className="timeline-card-error" role="alert">{error.message} {error.requiresConsent&&<Link to="/privacy">개인정보 관리</Link>}</p>}
  </article>
 </li>;
}

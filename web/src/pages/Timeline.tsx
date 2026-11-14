import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Navigate} from 'react-router-dom';
import {addDays,koreaToday} from '../../../shared/schedules';
import {emptyMemo,memoCategories,type Memo,type MemoDraft,type MemoList} from '../../../shared/memos';
import type {WorkspaceMe} from '../../../shared/workspace';
import {AuthLayout} from '../components/AuthLayout';
import {ErrorState,Loading} from '../components/Common';
import {Icon} from '../components/Icon';
import {useWorkspaceGate} from '../components/WorkspaceGate';
import {useEntryAccess} from '../components/EntryAccess';
import {DateNavigator,WorkspaceToolbar} from '../components/WorkspaceToolbar';
import {MemberFilter} from '../components/MemberFilter';
import {MemoEditor,MemoPhoto} from '../components/MemoEditor';
import {workspaceRequest} from '../workspace-api';
import './timeline.css';

const dayLabel=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'UTC'});
const blankFilters={query:'',category:'ALL',hasPhotos:false,hasLocation:false,favorite:false,visibility:'ALL',sort:'newest'};
export default function TimelinePage(){
 const {access,session}=useWorkspaceGate();
 if(session.data?.authenticated&&session.data.assurance==='LOW')return <Navigate to="/account" replace/>;
 if(session.data?.authenticated&&!session.data.emailVerified)return <Navigate to="/account/email" replace/>;
 if(access.status==='checking')return <Loading/>;
 if(access.status==='error')return <ErrorState message={access.error||'계정을 확인하지 못했어요.'} retry={()=>location.reload()}/>;
 return <Timeline key={access.identity?.id||'guest'} me={access.identity}/>;
}
function Timeline({me}:{me:WorkspaceMe|null}){
 const today=koreaToday(),{requestLogin}=useEntryAccess();
 const [month,setMonth]=useState(today.slice(0,7)),[period,setPeriod]=useState('month'),[from,setFrom]=useState(addDays(today,-29)),[to,setTo]=useState(today);
 const [filters,setFilters]=useState(blankFilters),[ownerIds,setOwnerIds]=useState<string[]>([]),[expanded,setExpanded]=useState(false),[limit,setLimit]=useState(40);
 const [searchQuery,setSearchQuery]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>setSearchQuery(filters.query),300);return()=>clearTimeout(timer);},[filters.query]);
 const [result,setResult]=useState<{key:string;data?:MemoList;error?:string}>(),[refresh,setRefresh]=useState(0),[message,setMessage]=useState(''),[draft,setDraft]=useState<MemoDraft|null>(null);
 const [busy,setBusy]=useState(''),[viewPhoto,setViewPhoto]=useState('');
 const mounted=useRef(true),writeLock=useRef(false),viewer=useRef<HTMLDialogElement>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(viewPhoto)viewer.current?.showModal();else viewer.current?.close();},[viewPhoto]);
 const members=me?.family?.members|| (me?[{id:me.id,name:me.name,kind:me.role,host:false,version:1}]:[]);
 const range=period==='month'?{from:month+'-01',to:addDays(new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)).toISOString().slice(0,10),-1)}:period==='custom'?{from,to}:{};
 const request=useMemo(()=>({...filters,query:searchQuery,...range,ownerIds,limit:40,offset:limit-40}),[JSON.stringify(filters),searchQuery,range.from,range.to,ownerIds,limit]);
 const key=JSON.stringify(request),current=result?.key===key?result:undefined;
 const reload=useCallback(()=>setRefresh(n=>n+1),[]);
 useEffect(()=>{
  if(!me)return;let active=true,pending=false;
  const load=async()=>{if(pending||writeLock.current)return;pending=true;try{const data=await workspaceRequest<MemoList>('memos.list',request);if(active&&!writeLock.current)setResult({key,data});}catch(e){if(active){const code=(e as {code?:string}).code;setResult(old=>({key,data:(!code||code==='UNAVAILABLE'||code==='RATE_LIMITED')&&old?.key===key?old.data:undefined,error:(e as Error).message}));if(code==='AUTH_REQUIRED'||code==='NOT_FOUND')setDraft(null);}}finally{pending=false;}};
  const focused=()=>{if(!document.hidden)void load();};void load();window.addEventListener('focus',focused);const timer=setInterval(focused,30000);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focused);};
 },[me?.id,key,refresh]);
 function change(value:Partial<typeof filters>){setFilters(old=>({...old,...value}));setLimit(40);}
 function reset(){setFilters(blankFilters);setOwnerIds([]);setLimit(40);}
 function create(){
  if(!me){requestLogin({title:'메모를 저장하려면 로그인해 주세요',description:'내 계정에 사진과 글을 안전하게 남겨요.'});return;}
  let initial=emptyMemo(today);
  try{const stored=JSON.parse(sessionStorage.getItem('iharu-memo-draft:'+me.id)||'null');if(stored?.expiresAt>Date.now()&&typeof stored.draft?.id==='string'&&stored.draft.photos?.length<=3)initial=stored.draft;}catch{}
  setDraft(initial);
 }
 async function action(id:string,op:string,payload:object){if(writeLock.current)return;writeLock.current=true;setBusy(id);try{await workspaceRequest(op,payload);setMessage(op==='memos.delete'?'메모와 첨부 사진을 삭제했어요.':'즐겨찾기를 변경했어요.');}catch(e){setMessage((e as Error).message);}finally{writeLock.current=false;if(mounted.current){setBusy('');reload();}}}
 function selectMonth(value:string){if(/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&value>='1900-01'&&value<='2099-12'){setMonth(value);setPeriod('month');setLimit(40);}}
 function moveMonth(delta:number){const d=new Date(month+'-15T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);selectMonth(d.toISOString().slice(0,7));}
 const data=me?current?.data:{items:[],total:0,hasAny:false};
 const hasFilters=JSON.stringify(filters)!==JSON.stringify(blankFilters)||ownerIds.length>0;
 const groups=new Map<string,Memo[]>();for(const memo of data?.items||[]){const group=groups.get(memo.date)||[];group.push(memo);groups.set(memo.date,group);}
 return <AuthLayout wide personalChild={me?.role==='CHILD'}><div className="timeline-page memo-timeline">
  <WorkspaceToolbar title="타임라인" navigation={<DateNavigator type="month" value={month} inputLabel="타임라인 조회 월" displayLabel={period==='all'?'전체 기간':period==='custom'?'기간 선택':undefined} onChange={selectMonth}/>}>
   <button className="icon-button" type="button" aria-label="이전 달" onClick={()=>moveMonth(-1)}><Icon name="left"/></button><button className="icon-button" type="button" aria-label="다음 달" onClick={()=>moveMonth(1)}><Icon name="chevron"/></button><button type="button" className="button primary compact memo-create" onClick={create}><Icon name="plus"/>메모 작성</button>
  </WorkspaceToolbar>
  {me&&<MemberFilter members={members} value={ownerIds.length?ownerIds:members.map(m=>m.id)} onChange={id=>{if(id==='all'){setOwnerIds([]);return;}const selected=ownerIds.length?ownerIds:members.map(m=>m.id),next=selected.includes(id)?selected.filter(x=>x!==id):[...selected,id];setOwnerIds(next.length?next:[id]);setLimit(40);}} label="메모 작성자" allLabel="전체" allSelected={!ownerIds.length} onSelectAll={()=>setOwnerIds([])}/>}
  <section className="memo-filters" aria-label="메모 필터"><div className="memo-filter-row"><div className="memo-quick-filters" role="group" aria-label="메모 종류">
   <button type="button" aria-pressed={!filters.hasPhotos&&!filters.hasLocation&&!filters.favorite} onClick={()=>change({hasPhotos:false,hasLocation:false,favorite:false})}>전체</button>
   <button type="button" aria-pressed={filters.hasPhotos} onClick={()=>change({hasPhotos:!filters.hasPhotos})}>사진</button><button type="button" aria-pressed={filters.hasLocation} onClick={()=>change({hasLocation:!filters.hasLocation})}>위치</button><button type="button" aria-pressed={filters.favorite} onClick={()=>change({favorite:!filters.favorite})}>즐겨찾기</button>
  </div><button type="button" className="memo-filter-toggle" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}><Icon name="filter"/>필터</button></div>
  <label className="memo-search"><Icon name="search"/><span className="sr-only">메모 검색</span><input type="search" placeholder="제목·글·장소·태그 검색" value={filters.query} maxLength={100} onChange={e=>change({query:e.target.value})}/>{hasFilters&&<button type="button" aria-label="필터 초기화" onClick={reset}><Icon name="close"/></button>}</label>
  {expanded&&<div className="memo-advanced"><label>기간<select value={period} onChange={e=>{setPeriod(e.target.value);setLimit(40);}}><option value="month">선택한 달</option><option value="all">전체 기간</option><option value="custom">직접 선택</option></select></label>
   {period==='custom'&&<><label>시작일<input type="date" value={from} max={to} onChange={e=>{if(e.target.value&&e.target.value<=to)setFrom(e.target.value);}}/></label><label>종료일<input type="date" value={to} min={from} onChange={e=>{if(e.target.value&&e.target.value>=from)setTo(e.target.value);}}/></label></>}
   <label>카테고리<select value={filters.category} onChange={e=>change({category:e.target.value})}><option value="ALL">전체</option>{Object.entries(memoCategories).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
   <label>공유 범위<select value={filters.visibility} onChange={e=>change({visibility:e.target.value})}><option value="ALL">전체</option><option value="PRIVATE">나만 보기</option><option value="GROUP">그룹 공유</option></select></label>
   <label>정렬<select value={filters.sort} onChange={e=>change({sort:e.target.value})}><option value="newest">최신순</option><option value="oldest">오래된순</option></select></label>
  </div>}</section>
  <p className="memo-status" role="status">{message}</p>
  {!data&&!current?.error?<Loading label="메모를 불러오고 있어요"/>:!data?<ErrorState message={current!.error!} retry={reload}/>:<section className="memo-results" aria-label="타임라인 메모">
   {current?.error&&<div className="memo-refresh-error" role="status">최신 메모를 불러오지 못했어요. 작성 중인 내용은 유지돼요.<button className="button compact" onClick={reload}>다시 불러오기</button></div>}
   {!data.hasAny&&!hasFilters?<><div className="memo-sample-guide"><Icon name="book"/><span><strong>한 줄부터, 나의 하루를 남겨요</strong><small>아래 2개는 사용 방법을 보여 주는 샘플이에요.</small></span></div><MemoSamples today={today} create={create}/></>:<><div className="memo-count"><span>메모 <strong>{data.total}개</strong></span><span>{filters.sort==='newest'?'최신순':'오래된순'}</span></div>
   {!data.items.length?<div className="memo-empty"><Icon name="book"/><h2>{hasFilters?'필터에 맞는 메모가 없어요':'이 기간에 작성한 메모가 없어요'}</h2><button type="button" className="button" onClick={()=>{reset();setPeriod('all');}}>전체 메모 보기</button><button type="button" className="button primary" onClick={create}>첫 메모 작성</button></div>:Array.from(groups,([date,items])=><section className="memo-day" key={date} aria-label={dayLabel(date)}><h2><time dateTime={date}>{dayLabel(date)}</time>{date===today&&<span>오늘</span>}</h2>{items.map(m=><article className="memo-card" key={m.id} aria-label={m.title}>
    <header><span className="memo-category">{memoCategories[m.category]}</span><span>{m.ownerName} · {m.time}</span><span className="memo-visibility">{m.visibility==='PRIVATE'?'나만 보기':'그룹 공유'}</span></header><h3>{m.title}</h3>{m.body&&<MemoBody text={m.body}/>}
    {m.photos.length>0&&<div className="memo-photos">{m.photos.map((photo,i)=><MemoPhoto key={photo.id} id={photo.id} alt={m.title+' 사진 '+(i+1)} onOpen={setViewPhoto}/>)}</div>}
    {(m.place||m.location)&&<p className="memo-place"><Icon name="pin"/>{m.location?<a href={`https://www.google.com/maps/search/?api=1&query=${m.location.latitude},${m.location.longitude}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{m.place||'저장한 위치'} <span>지도 보기</span></a>:m.place}</p>}
    {m.tags.length>0&&<div className="memo-tags">{m.tags.map(t=><button type="button" key={t} onClick={()=>{change({query:t});setPeriod('all');}}>#{t}</button>)}</div>}
    <footer><button type="button" aria-pressed={m.favorite} disabled={busy===m.id} onClick={()=>void action(m.id,'memos.favorite',{id:m.id,favorite:!m.favorite})}><Icon name="bookmark"/>{m.favorite?'즐겨찾기 해제':'즐겨찾기'}</button>{m.mine&&<><button type="button" onClick={()=>setDraft({...m,photos:m.photos.map(p=>({id:p.id}))})}><Icon name="type"/>수정</button><button type="button" disabled={busy===m.id} onClick={()=>{if(window.confirm('이 메모와 첨부 사진을 삭제할까요?'))void action(m.id,'memos.delete',{id:m.id,version:m.version});}}><Icon name="trash"/>삭제</button></>}</footer>
   </article>)}</section>)}
   {(data.total>40||limit>40)&&<div className="memo-pagination"><button type="button" className="button compact" disabled={limit===40} onClick={()=>setLimit(n=>n-40)}>이전</button><span>{Math.floor((limit-1)/40)+1} / {Math.max(1,Math.ceil(data.total/40))}</span><button type="button" className="button compact" disabled={data.total<=limit} onClick={()=>setLimit(n=>n+40)}>다음</button></div>}
   </>}
  </section>}
  {draft&&me&&<MemoEditor initial={draft} profileId={me.id} onClose={()=>setDraft(null)} onSaved={date=>{setDraft(null);selectMonth(date.slice(0,7));reset();reload();setMessage('메모를 저장했어요.');}}/>}
  <dialog ref={viewer} className="memo-photo-viewer" aria-label="사진 크게 보기" onClose={()=>setViewPhoto('')} onClick={e=>{if(e.target===e.currentTarget)setViewPhoto('');}}><button type="button" className="icon-button" aria-label="사진 닫기" onClick={()=>setViewPhoto('')}><Icon name="close"/></button>{viewPhoto&&<img src={viewPhoto} alt="메모 첨부 사진 확대"/>}</dialog>
 </div></AuthLayout>;
}
function MemoSamples({today,create}:{today:string;create:()=>void}){return <section className="memo-day memo-samples" aria-label="샘플 메모"><h2><time dateTime={today}>{dayLabel(today)}</time><span>샘플</span></h2>
 <article className="memo-card" aria-label="공원에서 보낸 오후"><header><span className="memo-category">나들이</span><span>샘플 · 15:30</span><span className="memo-visibility">나만 보기</span></header><h3>공원에서 보낸 오후</h3><p className="memo-body">함께 걷고 웃었던 순간을 남겨요. 사진과 현재 위치를 담으면 나중에 더 생생하게 떠올릴 수 있어요.</p><img className="memo-sample-photo" src="/briefing/park.jpg" alt="사진 첨부 예시: 초록 공원"/><p className="memo-place"><Icon name="pin"/>우리 동네 공원 · 장소 예시</p><div className="memo-tags"><span>#주말</span><span>#산책</span></div><footer><button type="button" onClick={create}><Icon name="plus"/>사진 메모 써 보기</button></footer></article>
 <article className="memo-card" aria-label="처음 혼자 해낸 날"><header><span className="memo-category">가족</span><span>샘플 · 09:00</span><span className="memo-visibility">그룹 공유</span></header><h3>처음 혼자 해낸 날</h3><p className="memo-body">“나 혼자 할 수 있어!” 작은 성장을 한 줄로 기록해요. 날짜·카테고리·태그로 다시 찾고, 오래 기억할 글은 즐겨찾기에 담아 보세요.</p><div className="memo-tags"><span>#성장</span><span>#기억할말</span></div><footer><button type="button" onClick={create}><Icon name="plus"/>첫 메모 써 보기</button></footer></article>
 </section>;}

function MemoBody({text}:{text:string}){const [expanded,setExpanded]=useState(false),long=text.length>250||text.split("\n").length>6;return <><p className={"memo-body"+(long&&!expanded?" memo-body-collapsed":"")}>{text}</p>{long&&<button type="button" className="memo-body-toggle" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?"접기":"글 더 보기"}</button>}</>;}

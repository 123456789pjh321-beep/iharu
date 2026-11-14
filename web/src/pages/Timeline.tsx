import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
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
import {WorkspaceTopBarSlot} from '../components/WorkspaceTopBar';
import {MemberFilter} from '../components/MemberFilter';
import {MonthSwipeArea} from '../components/MonthSwipeArea';
import {shiftMonth} from '../components/PeriodPager';
import {GroupInviteShareButton} from '../components/GroupInviteShare';
import {calendarColors} from '../components/scheduleColors';
import {MemoEditor,MemoPhoto} from '../components/MemoEditor';
import {workspaceRequest} from '../workspace-api';
import './timeline.css';

const dayLabel=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'UTC'});
type DisplayMemo=Memo&{sample?:boolean;samplePhoto?:string};
type MonthResult={key:string;data?:MemoList;error?:string};
const emptyList:MemoList={items:[],total:0,hasAny:false};
const validMonth=(value:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&value>='1900-01'&&value<='2099-12';

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
 const [month,setMonth]=useState(today.slice(0,7)),[ownerIds,setOwnerIds]=useState<string[]>([]),[offset,setOffset]=useState(0);
 const [results,setResults]=useState<Record<string,MonthResult>>({}),[refresh,setRefresh]=useState(0);
 const [message,setMessage]=useState(''),[draft,setDraft]=useState<MemoDraft|null>(null),[selectedId,setSelectedId]=useState('');
 const [busy,setBusy]=useState(''),[viewPhoto,setViewPhoto]=useState('');
 const mounted=useRef(true),writeLock=useRef(false),viewer=useRef<HTMLDialogElement>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(viewPhoto)viewer.current?.showModal();else viewer.current?.close();},[viewPhoto]);
 const members=me?.family?.members||(me?[{id:me.id,name:me.name,kind:me.role,host:false,version:1}]:[]);
 // Keep real neighboring months ready for the same continuous pager used by the calendar.
 const requests=useMemo(()=>Object.fromEntries([-1,0,1].map(delta=>{
  const value=shiftMonth(month,delta);
  return [value,{from:value+'-01',to:addDays(shiftMonth(value,1)+'-01',-1),ownerIds,limit:40,offset:delta===0?offset:0}];
 })),[month,ownerIds,offset]);
 const requestKey=(value:string)=>JSON.stringify(requests[value]);
 const current=results[month]?.key===requestKey(month)?results[month]:undefined;
 const reload=useCallback(()=>setRefresh(n=>n+1),[]);
 useEffect(()=>{
  if(!me)return;
  let active=true;
  const pending=new Set<string>();
  setResults(old=>Object.fromEntries(Object.keys(requests).filter(value=>old[value]?.key===JSON.stringify(requests[value])).map(value=>[value,old[value]])));
  async function load(value:string){
   if(!validMonth(value)||pending.has(value)||writeLock.current)return;
   pending.add(value);const key=JSON.stringify(requests[value]);
   try{
    const data=await workspaceRequest<MemoList>('memos.list',requests[value]);
    if(active&&!writeLock.current)setResults(old=>({...old,[value]:{key,data}}));
   }catch(e){
    if(active){
     const code=(e as {code?:string}).code;
     setResults(old=>({...old,[value]:{key,data:(!code||code==='UNAVAILABLE'||code==='RATE_LIMITED')&&old[value]?.key===key?old[value].data:undefined,error:(e as Error).message}}));
     if(code==='AUTH_REQUIRED'||code==='NOT_FOUND'){setDraft(null);setSelectedId('');setViewPhoto('');}
    }
   }finally{pending.delete(value);}
  }
  const focused=()=>{if(!document.hidden)for(const value of Object.keys(requests))void load(value);};
  focused();window.addEventListener('focus',focused);const timer=setInterval(focused,30000);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focused);};
 },[me?.id,requests,refresh]);
 const samples=useMemo(()=>sampleMemos(today),[today]);
 const selected=(current?.data?.items||[]).find(m=>m.id===selectedId)||(samples.find(m=>m.id===selectedId));
 useEffect(()=>{
  if(selectedId&&!selected){setSelectedId('');setViewPhoto('');}
 },[selectedId,selected]);
 // A deletion on the last page must return to the remaining records.
 useEffect(()=>{if(offset>0&&current?.data&&!current.data.items.length)setOffset(Math.max(0,offset-40));},[offset,current?.data]);
 function create(){
  if(!me){requestLogin({title:'메모를 저장하려면 로그인해 주세요',description:'내 계정에 사진과 글을 안전하게 남겨요.'});return;}
  let initial=emptyMemo(today);
  try{const stored=JSON.parse(sessionStorage.getItem('iharu-memo-draft:'+me.id)||'null');if(stored?.expiresAt>Date.now()&&typeof stored.draft?.id==='string'&&Array.isArray(stored.draft.photos)&&stored.draft.photos.length<=3)initial=stored.draft;else sessionStorage.removeItem('iharu-memo-draft:'+me.id);}catch{}
  setDraft(initial);
 }
 async function action(memo:Memo,op:'memos.delete'|'memos.favorite'){
  if(writeLock.current)return;writeLock.current=true;setBusy(memo.id);setMessage('');
  try{
   await workspaceRequest(op,op==='memos.delete'?{id:memo.id,version:memo.version}:{id:memo.id,favorite:!memo.favorite});
   if(!mounted.current)return;
   if(op==='memos.delete'){setSelectedId('');setMessage('메모와 첨부 사진을 삭제했어요.');}
   else{
    setResults(old=>Object.fromEntries(Object.entries(old).map(([value,result])=>[value,{...result,data:result.data?{...result.data,items:result.data.items.map(item=>item.id===memo.id?{...item,favorite:!memo.favorite}:item)}:undefined}])));
    setMessage('즐겨찾기를 변경했어요.');
   }
  }catch(e){if(mounted.current)setMessage((e as Error).message);}
  finally{writeLock.current=false;if(mounted.current){setBusy('');reload();}}
 }
 function selectMonth(value:string){
  if(validMonth(value)){setMonth(value);setOffset(0);setSelectedId('');setViewPhoto('');setMessage('');}
 }
 function openMemo(memo:DisplayMemo){setMessage('');setSelectedId(memo.id);}
 function renderMonth(value:string){
  if(!validMonth(value))return <div className="memo-results"/>;
  const result=results[value]?.key===requestKey(value)?results[value]:undefined,data=me?result?.data:emptyList;
  if(!data)return result?.error?<ErrorState message={result.error} retry={reload}/>:<Loading label="메모를 불러오고 있어요"/>;
  const isSample=!data.hasAny&&ownerIds.length===0&&value===today.slice(0,7),items=isSample?samples:data.items;
  const groups=new Map<string,DisplayMemo[]>();for(const memo of items){const group=groups.get(memo.date)||[];group.push(memo);groups.set(memo.date,group);}
  return <section className="memo-results" aria-label={isSample?'샘플 메모':'타임라인 메모'}>
   {result?.error&&<div className="memo-refresh-error" role="status">최신 메모를 불러오지 못했어요. 작성 중인 내용은 유지돼요.<button className="button compact" onClick={reload}>다시 불러오기</button></div>}
   {isSample&&<p className="memo-sample-guide">아래 두 글은 사용 방법을 보여 주는 샘플이에요.</p>}
   {!items.length?<div className="memo-empty"><Icon name="book"/><h2>{ownerIds.length?'선택한 구성원의 이번 달 글이 없어요':'이번 달에 작성한 글이 없어요'}</h2></div>:Array.from(groups,([date,items])=><section className="memo-day" key={date} aria-label={dayLabel(date)}>
    <h2><time dateTime={date}>{dayLabel(date)}</time>{isSample?<span>샘플</span>:date===today&&<span>오늘</span>}</h2>
    {items.map(memo=><article className="memo-card memo-preview" key={memo.id} aria-label={memo.title}>
     <MemoFeedMeta memo={memo} color={calendarColors[Math.max(0,members.findIndex(member=>member.id===memo.ownerId))%calendarColors.length]}/>
     <div className="memo-preview-row"><div className="memo-preview-copy"><h3>{memo.title}</h3><p className="memo-preview-body">{memo.body||'내용 없이 저장한 메모예요.'}</p></div>
      <button type="button" className="memo-more" aria-haspopup="dialog" onClick={()=>openMemo(memo)}>더보기<Icon name="chevron"/></button>
     </div>
    </article>)}
   </section>)}
   {value===month&&(data.total>40||offset>0)&&<div className="memo-pagination"><button type="button" className="button compact" disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-40))}>이전</button><span>{Math.floor(offset/40)+1} / {Math.max(1,Math.ceil(data.total/40))}</span><button type="button" className="button compact" disabled={data.total<=offset+40} onClick={()=>setOffset(n=>n+40)}>다음</button></div>}
  </section>;
 }
 return <AuthLayout wide personalChild={me?.role==='CHILD'}><div className="timeline-page memo-timeline">
  <WorkspaceToolbar title="타임라인" navigation={<DateNavigator type="month" value={month} inputLabel="타임라인 조회 월" onChange={selectMonth}/>}/>
  <WorkspaceTopBarSlot slot="members">{me&&<div className="member-preference-row memo-members"><GroupInviteShareButton/><MemberFilter members={members} value={ownerIds.length?ownerIds:members.map(m=>m.id)} showAll={false} onChange={id=>{
   const current=ownerIds.length?ownerIds:members.map(m=>m.id),next=current.includes(id)?current.filter(x=>x!==id):[...current,id];
   setOwnerIds(next.length===members.length?[]:next.length?next:[id]);setOffset(0);setSelectedId('');
  }} label="메모 작성자"/></div>}</WorkspaceTopBarSlot>
  <div className="memo-compose"><button type="button" className="memo-new-row" aria-label="새글 등록" onClick={create}>
   <span className="memo-compose-icon"><Icon name="plus"/></span>
   <span className="memo-compose-copy"><strong>새글 등록</strong><small>오늘의 순간을 남겨보세요</small></span>
   <span className="memo-compose-media" aria-hidden="true"><Icon name="image"/><Icon name="pin"/></span>
   <Icon name="chevron"/>
  </button></div>
  <p className="memo-status" role="status">{message}</p>
  <MonthSwipeArea month={month} onChange={selectMonth}>{renderMonth}</MonthSwipeArea>
  {selected&&<MemoDetail memo={selected} busy={busy===selected.id} message={message} onClose={()=>{setSelectedId('');setViewPhoto('');}} onPhoto={setViewPhoto} onCreate={()=>{setSelectedId('');create();}} onEdit={()=>{
   setSelectedId('');setDraft({...selected,photos:selected.photos.map(photo=>({id:photo.id}))});
  }} onFavorite={()=>void action(selected,'memos.favorite')} onDelete={()=>{if(window.confirm('이 메모와 첨부 사진을 삭제할까요?'))void action(selected,'memos.delete');}}/>}
  {draft&&me&&<MemoEditor initial={draft} profileId={me.id} onClose={()=>setDraft(null)} onSaved={date=>{setDraft(null);selectMonth(date.slice(0,7));setOwnerIds([]);reload();setMessage('메모를 저장했어요.');}}/>}
  <dialog ref={viewer} className="memo-photo-viewer" aria-label="사진 크게 보기" onClose={()=>setViewPhoto('')} onClick={e=>{if(e.target===e.currentTarget)setViewPhoto('');}}><button type="button" className="icon-button" aria-label="사진 닫기" onClick={()=>setViewPhoto('')}><Icon name="close"/></button>{viewPhoto&&<img src={viewPhoto} alt="메모 첨부 사진 확대"/>}</dialog>
 </div></AuthLayout>;
}
function MemoFeedMeta({memo,color}:{memo:DisplayMemo;color:string}){
 const photoCount=memo.samplePhoto?1:memo.photos.length;
 return <header className="memo-feed-meta">
  <span className="memo-author-avatar" style={{'--memo-author-color':color} as CSSProperties} aria-hidden="true">{Array.from(memo.ownerName.trim())[0]||'나'}</span>
  <div className="memo-author-text"><strong title={memo.ownerName}>{memo.ownerName}</strong>
   <div className="memo-feed-subline"><time dateTime={memo.date+'T'+memo.time+':00+09:00'}>{memo.time}</time><span aria-hidden="true">·</span><span className="memo-feed-category">{memoCategories[memo.category]}</span>
    {photoCount>0&&<span className="memo-feed-attachment" title={'사진 '+photoCount+'장'}><Icon name="image"/><span className="sr-only">사진 </span>{photoCount}<span className="sr-only">장 첨부</span></span>}
    {(memo.location||memo.place)&&<span className="memo-feed-attachment" title="장소 포함"><Icon name="pin"/><span className="sr-only">장소 포함</span></span>}
    {memo.favorite&&<span className="memo-feed-bookmark" title="즐겨찾기한 글"><Icon name="bookmark"/><span className="sr-only">즐겨찾기한 글</span></span>}
   </div>
  </div>
  <span className="memo-feed-visibility" data-visibility={memo.visibility}><Icon name={memo.visibility==='PRIVATE'?'shield':'users'}/>{memo.visibility==='PRIVATE'?'나만 보기':'그룹 공유'}</span>
 </header>;
}
function MemoMeta({memo}:{memo:DisplayMemo}){
 return <header className="memo-meta"><span className="memo-category">{memoCategories[memo.category]}</span><span>{memo.ownerName} · {memo.time}</span><span className="memo-visibility">{memo.visibility==='PRIVATE'?'나만 보기':'그룹 공유'}</span></header>;
}
function MemoDetail({memo,busy,message,onClose,onPhoto,onCreate,onEdit,onFavorite,onDelete}:{memo:DisplayMemo;busy:boolean;message:string;onClose:()=>void;onPhoto:(src:string)=>void;onCreate:()=>void;onEdit:()=>void;onFavorite:()=>void;onDelete:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} className="memo-detail" aria-labelledby="memo-detail-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
  <header className="memo-detail-heading"><h2 id="memo-detail-title">글 상세</h2><button type="button" className="icon-button" aria-label="글 상세 닫기" onClick={onClose}><Icon name="close"/></button></header>
  <div className="memo-detail-body"><MemoMeta memo={memo}/><time className="memo-detail-date" dateTime={memo.date}>{dayLabel(memo.date)}</time>
   <h3>{memo.title}</h3>{memo.body&&<p className="memo-body">{memo.body}</p>}
   {memo.samplePhoto&&<button type="button" className="memo-photo" aria-label="샘플 사진 크게 보기" onClick={()=>onPhoto(memo.samplePhoto!)}><img src={memo.samplePhoto} alt="사진 첨부 예시: 초록 공원"/></button>}
   {memo.photos.length>0&&<div className="memo-photos">{memo.photos.map((photo,i)=><MemoPhoto key={photo.id} id={photo.id} alt={memo.title+' 사진 '+(i+1)} onOpen={onPhoto}/>)}</div>}
   {(memo.place||memo.location)&&<p className="memo-place"><Icon name="pin"/>{memo.location?<a href={'https://www.google.com/maps/search/?api=1&query='+memo.location.latitude+','+memo.location.longitude} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{memo.place||'저장한 위치'} <span>지도 보기</span></a>:memo.place}</p>}
   {memo.tags.length>0&&<div className="memo-tags">{memo.tags.map(tag=><span key={tag}>#{tag}</span>)}</div>}
   {message&&<p className="memo-detail-status" role="status">{message}</p>}
  </div>
  <footer className="memo-detail-actions">{memo.sample?<button type="button" className="button primary" onClick={onCreate}><Icon name="plus"/>새글 등록</button>:<>
   <button type="button" disabled={busy} aria-pressed={memo.favorite} onClick={onFavorite}><Icon name="bookmark"/>{memo.favorite?'즐겨찾기 해제':'즐겨찾기'}</button>
   {memo.mine&&<><button type="button" disabled={busy} onClick={onEdit}><Icon name="type"/>수정</button><button type="button" disabled={busy} onClick={onDelete}><Icon name="trash"/>삭제</button></>}
  </>}</footer>
 </dialog>;
}
function sampleMemos(today:string):DisplayMemo[]{
 const base={...emptyMemo(today),id:'sample-park',ownerId:'sample',ownerName:'샘플',mine:false,favorite:false,createdAt:'',updatedAt:'',photos:[],sample:true};
 return [
  {...base,title:'공원에서 보낸 오후',body:'함께 걷고 웃었던 순간을 남겨요. 사진과 현재 위치를 담으면 나중에 더 생생하게 떠올릴 수 있어요.',category:'OUTING',time:'15:30',samplePhoto:'/briefing/park.jpg',place:'우리 동네 공원 · 장소 예시',tags:['주말','산책']},
  {...base,id:'sample-growth',title:'처음 혼자 해낸 날',body:'“나 혼자 할 수 있어!” 작은 성장을 한 줄로 기록해요. 더보기에서 전체 글과 사진·위치를 보고, 오래 기억할 글은 즐겨찾기에 담아 보세요.',category:'FAMILY',time:'09:00',visibility:'GROUP',tags:['성장','기억할말']}
 ];
}

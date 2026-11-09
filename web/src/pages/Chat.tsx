import {useEffect,useRef,useState} from 'react';
import {startChatRealtime,type ChatConnectionState} from '../chat-realtime';
import {Link,Navigate} from 'react-router-dom';
import {AuthLayout,FormNotice} from '../components/AuthLayout';
import {Loading,ErrorState} from '../components/Common';
import {Icon} from '../components/Icon';
import {useApi} from '../api';
import {sessionSchema} from '../auth';
import {messageChangesSchema,messageListSchema,messageSchema,roomListSchema,type Message,type MessageInput} from '../../../shared/messages';
import {messageCatalog,messageGroups,type Sticker} from '../../../shared/message-catalog';

async function messageRequest(path:string,body?:unknown,method='POST',key:string=crypto.randomUUID(),childMode=false):Promise<any>{
 const r=await fetch(path,{credentials:'same-origin',cache:'no-store',method:body===undefined?'GET':method,headers:{...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':key}),...(childMode?{'X-Iharu-Actor':'child'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const json=await r.json();if(!r.ok)throw Object.assign(new Error(json.error?.message||'연결을 확인하고 다시 시도해 주세요.'),{code:json.error?.code});return json;
}
function StickerArt({id}:{id:string}){return <img src={`/stickers/v1/${id}.svg`} alt="" aria-hidden="true" width={48} height={48} onError={e=>{e.currentTarget.style.display='none';}}/>;}
export function ChatPage({childMode=false}:{childMode?:boolean}){return childMode?<ChatWorkspace childMode/>:<GuardianChat/>;}
function GuardianChat(){
 const session=useApi('/api/account/session',sessionSchema);
 if(session.loading)return <AuthLayout wide><Loading/></AuthLayout>;
 if(session.error)return <AuthLayout wide><ErrorState message={session.error} retry={session.retry}/></AuthLayout>;
 if(!session.data?.authenticated)return <Navigate to="/login" replace/>;
 if(session.data.assurance==='LOW')return <Navigate to="/account" replace/>;
 if(!session.data.accessReady)return <AuthLayout wide><Link className="auth-back" to="/timetable">← 오늘로</Link><section className="family-welcome"><span className="badge green">로그인 완료</span><h1>단체 대화를 준비하고 있어요</h1><p>로그인은 완료됐어요. 대화방을 열려면 계정 확인과 그룹 연결이 필요해요.</p><p>확인 서비스가 준비 중이면 지금은 단체 대화를 시작할 수 없어요. 연결 상태에서 가능한 다음 단계를 확인해 주세요.</p><Link className="button primary" to="/family">그룹 연결 상태 확인</Link><Link className="button" to="/account">내 계정 확인</Link></section></AuthLayout>;
 return <ChatWorkspace/>;
}
function ChatWorkspace({childMode=false}:{childMode?:boolean}){
 const rooms=useApi('/api/v1/chat-rooms',roomListSchema,childMode?'child':undefined),[accessLost,setAccessLost]=useState(false),[selected,setSelected]=useState(()=>new URLSearchParams(window.location.search).get('child')||''),dirty=useRef(false),[revision,setRevision]=useState(0);
 const choices=rooms.data?.data||[],room=selected?choices.find(r=>r.childId===selected):choices[0];
 useEffect(()=>{document.title='단체 대화 · 아이하루';},[]);
 function change(id:string){if(id===room?.childId)return;if(dirty.current&&!window.confirm('아직 보내지 않은 내용이 있어요. 지우고 다른 대화방으로 이동할까요?'))return;dirty.current=false;setSelected(id);setRevision(v=>v+1);}
 if(rooms.errorCode==='AUTH_REQUIRED')return <Navigate to={childMode?'/device/connect':'/login'} replace/>;
 return <AuthLayout wide><div className={`chat-page ${childMode?'chat-child':''}`}><Link className="auth-back" to={childMode?'/child/connected':'/timetable'}>← {childMode?'내 하루':'오늘로'}</Link><div className="chat-heading"><p className="eyebrow">그림으로도 충분한 한마디</p><h1>단체 대화</h1><p>짧은 소식부터 따뜻한 마음까지.</p></div>
 {accessLost||(childMode&&['AUTH_REQUIRED','DEVICE_REQUIRED'].includes(rooms.errorCode||''))?<section className="card"><h2>기기 연결을 확인해 주세요</h2><p>대화를 계속하려면 일반사용자와 기기를 다시 연결해 주세요.</p><Link className="button primary" to={childMode?'/device/connect':'/family'}>{childMode?'아이 기기 다시 연결':'그룹 연결 확인'}</Link></section>:rooms.loading?<Loading/>:rooms.error?<><ErrorState message={rooms.error} retry={rooms.retry}/><Link className="button primary" to={childMode?'/device/connect':'/family'}>{childMode?'아이 기기 연결':'그룹 연결 확인'}</Link></>:!room?<section className="card"><h2>{selected?'선택한 대화방에 접근할 수 없어요':'함께 이야기할 그룹을 연결해요'}</h2><p>공유가 허용된 아이의 대화방만 열 수 있어요.</p><Link className="button primary" to={childMode?'/child/connected':'/family'}>{childMode?'내 하루로 돌아가기':'그룹과 아이 관리'}</Link></section>:<><nav className={`chat-room-tabs ${childMode&&choices.length===1?'single-child-room':''}`} aria-label="대화방 선택">{choices.map(r=><button className={`button ${r.childId===room.childId?'primary':''}`} key={r.childId} aria-pressed={r.childId===room.childId} onClick={()=>change(r.childId)}>{r.childName}<small>{r.familyName}</small></button>)}</nav><ChatRoom key={`${room.childId}:${revision}`} childId={room.childId} childName={room.childName} childMode={childMode} accessLost={()=>setAccessLost(true)} dirty={value=>{dirty.current=value;}}/></>}
 </div></AuthLayout>;
}
function ChatRoom({childId,childName,childMode,dirty,accessLost}:{childId:string;childName:string;childMode:boolean;accessLost:()=>void;dirty:(v:boolean)=>void}){
 const path=`/api/v1/children/${childId}/messages`;
 const request=(path:string,body?:unknown,method='POST',key?:string)=>messageRequest(path,body,method,key,childMode);
 function checkAccess(error:unknown){if(['AUTH_REQUIRED','ACCESS_NOT_READY','DEVICE_REQUIRED','NOT_FOUND','FORBIDDEN'].includes((error as {code?:string}).code||'')){setItems([]);setChoice(null);setText('');pending.current=null;accessLost();}}
 const [items,setItems]=useState<Message[]>([]),[receipt,setReceipt]=useState(''),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [group,setGroup]=useState('daily'),[choice,setChoice]=useState<Sticker|null>(null),[text,setText]=useState(''),[typing,setTyping]=useState(false),[preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[deleteItem,setDeleteItem]=useState<Message|null>(null);
 const pending=useRef<{input:MessageInput;key:string}|null>(null),locked=useRef(false),mounted=useRef(true),loadNumber=useRef(0),dialog=useRef<HTMLDialogElement>(null),confirmButton=useRef<HTMLButtonElement>(null),list=useRef<HTMLDivElement>(null),seen=useRef(0),receiptSeqs=useRef<number[]>([]);
 const [connection,setConnection]=useState<ChatConnectionState>('CONNECTING'),connectionRef=useRef<ChatConnectionState>('CONNECTING'),syncAgain=useRef(false),reconnect=useRef<()=>void>(()=>{});
 const syncCursor=useRef<string|null>(null), syncing=useRef(false), latestItems=useRef<Message[]>([]), syncAction=useRef<()=>Promise<void>>(async()=>{});
 latestItems.current=items;
 const dirtyValue=Boolean(choice||text||pending.current);
 useEffect(()=>{dirty(dirtyValue);const stop=(e:BeforeUnloadEvent)=>{if(dirtyValue){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',stop);return()=>window.removeEventListener('beforeunload',stop);},[dirtyValue,dirty]);
 useEffect(()=>{
  mounted.current=true;void load();
  const realtime=startChatRealtime({loadToken:()=>request(`/api/v1/children/${childId}/realtime-token`,{}),change:()=>{void syncAction.current();},status:state=>{connectionRef.current=state;setConnection(state);},denied:checkAccess});
  reconnect.current=()=>realtime.refresh();
  const refresh=()=>{
   const visible=document.visibilityState==='visible';realtime.setActive(visible&&navigator.onLine);
   if(!visible){loadNumber.current++;syncCursor.current=null;latestItems.current=[];setItems([]);setReceipt('');}
   else if(navigator.onLine)void syncAction.current();
  };
  realtime.setActive(document.visibilityState==='visible'&&navigator.onLine);
  const tick=window.setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine&&connectionRef.current!=='LIVE')void syncAction.current();},15000);
  document.addEventListener('visibilitychange',refresh);window.addEventListener('online',refresh);window.addEventListener('offline',refresh);
  return()=>{mounted.current=false;loadNumber.current++;realtime.close();window.clearInterval(tick);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('online',refresh);window.removeEventListener('offline',refresh);window.speechSynthesis?.cancel();};
 },[childId,childMode]);
 useEffect(()=>{if((preview||deleteItem)&&!dialog.current?.open)dialog.current?.showModal();},[preview,deleteItem]);
 async function load(older=false){if(document.visibilityState!=='visible')return;const n=++loadNumber.current;setLoading(true);setError('');try{const data=messageListSchema.parse(await request(path+(older&&items.length?`?beforeSeq=${items[0].seq}`:''))).data;if(!mounted.current||n!==loadNumber.current||document.visibilityState!=='visible')return;if(!older)syncCursor.current=data.snapshotCursor;setItems(old=>older?[...data.items,...old]:data.items);receiptSeqs.current=data.items.map(m=>m.seq);setReceipt(data.receipt);setHasMore(data.hasMore);}catch(e){if(mounted.current&&n===loadNumber.current){checkAccess(e);setItems([]);setReceipt('');setError((e as Error).message);}}finally{if(mounted.current&&n===loadNumber.current)setLoading(false);}}
 async function sync(){
  if(!mounted.current||document.visibilityState!=='visible')return;
  if(syncing.current||locked.current){syncAgain.current=true;return;}
  syncing.current=true;const n=++loadNumber.current;
  try{
   let cursor=syncCursor.current,more=false,readsChanged=false;const changed:Message[]=[];
   // Bounded catch-up; a larger gap discards cached history and takes a fresh snapshot.
   for(let page=0;cursor&&page<10;page++){
    const result=messageChangesSchema.parse(await request(`/api/v1/children/${childId}/message-changes?cursor=${cursor}&limit=50`)).data;
    if(!mounted.current||n!==loadNumber.current||document.visibilityState!=='visible')return;
    changed.push(...result.items);readsChanged=readsChanged||result.readsChanged;cursor=result.cursor;more=result.hasMore;if(!more)break;
   }
   const snapshot=messageListSchema.parse(await request(path+'?limit=30')).data;
   if(!mounted.current||n!==loadNumber.current||document.visibilityState!=='visible')return;
   const merged=new Map((syncCursor.current&&!more&&!readsChanged?latestItems.current:[]).map(m=>[m.id,m]));
   for(const m of [...changed,...snapshot.items]){const old=merged.get(m.id);if(!old||m.version>=old.version)merged.set(m.id,m);}
   setItems([...merged.values()].sort((a,b)=>a.seq-b.seq));
   syncCursor.current=cursor&&!more?cursor:snapshot.snapshotCursor;
   receiptSeqs.current=snapshot.items.map(m=>m.seq);setReceipt(snapshot.receipt);setError('');setLoading(false);
   if(!latestItems.current.length||more||readsChanged)setHasMore(snapshot.hasMore);
  }catch(e){
   if(mounted.current&&n===loadNumber.current){checkAccess(e);setItems([]);setReceipt('');syncCursor.current=null;setLoading(false);
    if((e as {code?:string}).code==='SYNC_RESET_REQUIRED'){await load();reconnect.current();}else setError((e as Error).message);}
  }finally{syncing.current=false;if(syncAgain.current&&mounted.current){syncAgain.current=false;queueMicrotask(()=>void syncAction.current());}}
 }
 syncAction.current=sync;
 // Only messages actually intersecting the visible conversation pane generate read evidence.
 useEffect(()=>{if(!receipt||!list.current||document.visibilityState!=='visible')return;seen.current=0;let timer:ReturnType<typeof setTimeout>|undefined;const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting&&receiptSeqs.current.includes(Number((e.target as HTMLElement).dataset.seq)))seen.current=Math.max(seen.current,Number((e.target as HTMLElement).dataset.seq));if(timer)clearTimeout(timer);timer=setTimeout(()=>{if(!seen.current||document.visibilityState!=='visible')return;void request(`/api/v1/children/${childId}/read-cursor`,{receipt,lastReadSeq:seen.current},'PUT').catch(()=>{/* Read failure is not delivery confirmation. */});},250);},{threshold:0.5});list.current.querySelectorAll('[data-seq]').forEach(el=>observer.observe(el));return()=>{observer.disconnect();if(timer)clearTimeout(timer);};},[items,receipt,childId]);
 function choose(item:Sticker){if(locked.current)return;setChoice(item);setText('');setTyping(false);pending.current=null;setFailed(false);setError('');setNotice('');}
 function close(){if(locked.current)return;setPreview(false);setDeleteItem(null);dialog.current?.close();confirmButton.current?.focus();}
 async function send(){if(locked.current)return;locked.current=true;setBusy(true);setError('');setNotice('');if(!pending.current){pending.current={key:crypto.randomUUID(),input:choice?{kind:'STICKER',catalogId:choice.id,catalogVersion:choice.version,clientMessageId:crypto.randomUUID()}:{kind:'TEXT',body:text.trim(),clientMessageId:crypto.randomUUID()}};}
 try{const response=await request(path,pending.current.input,'POST',pending.current.key);messageSchema.parse(response.data);if(!mounted.current)return;pending.current=null;setChoice(null);setText('');setFailed(false);setPreview(false);dialog.current?.close();confirmButton.current?.focus();setNotice('저장했어요 · 읽음 확인 전');await load();}
 catch(e){if(!mounted.current)return;checkAccess(e);setFailed(true);setError((e as Error).message);const code=(e as {code?:string}).code;if(['CATALOG_VERSION_UNSUPPORTED','CATALOG_ITEM_UNAVAILABLE'].includes(code||'')){pending.current=null;setChoice(null);setPreview(false);dialog.current?.close();confirmButton.current?.focus();setFailed(false);setNotice('그림 목록에서 다른 그림을 다시 골라 주세요.');}}
 finally{locked.current=false;if(mounted.current){setBusy(false);if(syncAgain.current){syncAgain.current=false;void syncAction.current();}}}}
 async function remove(){if(!deleteItem||locked.current)return;locked.current=true;setBusy(true);try{await request(`/api/v1/messages/${deleteItem.id}`,{expectedVersion:deleteItem.version},'DELETE');if(!mounted.current)return;setDeleteItem(null);dialog.current?.close();confirmButton.current?.focus();await load();}catch(e){if(mounted.current){checkAccess(e);setError((e as Error).message);}}finally{locked.current=false;if(mounted.current){setBusy(false);if(syncAgain.current){syncAgain.current=false;void syncAction.current();}}}}
 function listen(){if(!choice)return;const voice=window.speechSynthesis?.getVoices().find(v=>v.localService&&v.lang.startsWith('ko'));if(!voice){setNotice('이 기기에서는 문장 듣기를 사용할 수 없어요. 그림과 문장을 확인해 주세요.');return;}window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(choice.label);u.voice=voice;u.lang='ko-KR';u.onerror=()=>setNotice('문장 듣기를 마치지 못했어요. 그림과 문장으로 확인해 주세요.');window.speechSynthesis.speak(u);}
 return <><header className="chat-room-header"><span className="chat-room-symbol"><Icon name="chat"/></span><div><h2>{childName} 그룹방</h2><p>대화 공유가 허용된 그룹과 함께해요</p></div><button className="button compact" disabled={loading||busy} onClick={()=>void load()} aria-label="대화 새로고침"><Icon name="repeat"/>새로고침</button></header>
 <p className="chat-sync-note"><span role="status">{connection==='LIVE'?'새 소식이 바로 반영되고 있어요.':connection==='CONNECTING'?'대화 연결을 확인하고 있어요.':connection==='PAUSED'?'화면으로 돌아오면 대화를 다시 확인해요.':'새 소식을 15초마다 확인하고 있어요.'}</span> 다른 앱에 있을 때의 기기 알림은 아직 준비 중이에요.</p><FormNotice error={!preview&&!deleteItem?error:undefined} message={notice}/>
 <div className={`chat-layout ${childMode?'chat-layout-child':''}`}><section className="chat-conversation" aria-label="대화 내용"><div className="chat-messages" ref={list} aria-label="메시지 목록">
 {hasMore&&<button className="button full" disabled={loading} onClick={()=>void load(true)}>이전 대화 보기</button>}{loading&&<Loading label="대화를 불러오고 있어요"/>}
 {!loading&&!items.length&&<div className="chat-empty"><Icon name="chat"/><h3>오늘의 첫 한마디를 건네 보세요</h3><p>그림을 골라 그룹에게 소식을 전해요.</p></div>}
 {items.map(m=><article className={`chat-message ${m.mine?'mine':''}`} key={m.id} data-seq={m.seq}><small>{m.senderName}</small><div className="chat-bubble">{m.deletedAt?<span className="chat-deleted">삭제된 메시지예요</span>:<>{m.emoji&&<span className="chat-sticker" aria-hidden="true">{m.catalogId?<StickerArt id={m.catalogId}/>:m.emoji}</span>}<p>{m.displayText}</p></>}</div><div className="chat-message-meta"><time>{new Date(m.createdAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})}</time>{m.mine&&!m.deletedAt&&<span>{m.readByOther?'그룹이 읽었어요':'저장됨 · 읽음 확인 전'}</span>}{m.mine&&!m.deletedAt&&<button className="chat-delete" aria-label={`메시지 삭제: ${m.displayText}`} onClick={()=>{setError('');setDeleteItem(m);}}>삭제</button>}</div></article>)}
 </div></section>
 <section className="chat-composer" aria-label="메시지 만들기"><div className="chat-picker-heading"><h2>어떤 말을 보낼까요?</h2><span className="badge soft">36개 그림</span></div><div className="chat-groups" aria-label="그림 종류">{messageGroups.map(([id,label])=><button key={id} aria-pressed={group===id} className={group===id?'active':''} onClick={()=>setGroup(id)}>{label}</button>)}</div>
 <div className="chat-sticker-grid">{messageCatalog(2).filter(s=>s.group===group).map(s=><button key={s.id} className={choice?.id===s.id?'selected':''} aria-pressed={choice?.id===s.id} disabled={busy} onClick={()=>choose(s)}><span aria-hidden="true"><StickerArt id={s.id}/></span><strong>{s.label}</strong></button>)}</div>
 <div className="chat-selection" aria-live="polite">{choice?<><span aria-hidden="true"><StickerArt id={choice.id}/></span><div><small>{childName} 그룹방에 보낼 말</small><strong>{choice.label}</strong></div><button className="button compact" onClick={listen}>듣기</button></>:<p>그림을 고른 뒤 보내기 전에 확인해요.</p>}</div>
 <button className="button full" aria-expanded={typing} disabled={busy} onClick={()=>{setTyping(v=>!v);setChoice(null);pending.current=null;setFailed(false);}}>직접 글 쓰기</button>
 {typing&&<label className="chat-text-label">그룹에게 쓸 말<textarea value={text} maxLength={2000} rows={3} onChange={e=>{setText(e.target.value);pending.current=null;setFailed(false);}} placeholder="전하고 싶은 말을 적어 주세요"/><small>{text.length}/2,000 · Enter는 줄바꿈이에요</small></label>}
 <button ref={confirmButton} className="button primary full chat-send" disabled={busy||(!choice&&!text.trim())} onClick={()=>{setError('');setPreview(true);}}><Icon name="chat"/>{failed?'다시 보내기 확인':'보낼 말 확인하기'}</button>
 <p className="chat-care-note">도착·출발 그림은 대화만 보내요. 등하원 기록은 내 하루에서 남겨 주세요.</p><small className="chat-attribution">그림: <a href="/stickers/ATTRIBUTION.txt" target="_blank" rel="noreferrer">Twemoji</a> · <a href="/stickers/LICENSE-GRAPHICS.txt" target="_blank" rel="noreferrer">CC BY 4.0</a></small></section></div>
 {(preview||deleteItem)&&<dialog ref={dialog} className="preview-dialog chat-dialog" aria-labelledby="chat-dialog-title" onCancel={e=>{e.preventDefault();close();}}><h2 id="chat-dialog-title">{deleteItem?'이 메시지를 삭제할까요?':`${childName} 그룹방에 보낼까요?`}</h2>{deleteItem?<p>대화에서 내용을 지워요. 이미 본 그룹의 화면이나 기억까지 되돌리지는 못해요.</p>:<div className="chat-preview">{choice&&<span aria-hidden="true"><StickerArt id={choice.id}/></span>}<p>{choice?.label||text}</p>{choice&&['help','hurt','call'].includes(choice.id)&&<small>답이 바로 오지 않을 수 있어요. 급하면 가까운 어른에게도 말해요.</small>}</div>}<FormNotice error={error}/><div className="chat-dialog-actions"><button className="button" disabled={busy} onClick={close}>{deleteItem?'취소':'다시 고르기'}</button><button className="button primary" disabled={busy} onClick={()=>void(deleteItem?remove():send())}>{busy?'처리 중…':deleteItem?'삭제하기':failed?'다시 보내기':'보내기'}</button></div></dialog>}
 </>;
}


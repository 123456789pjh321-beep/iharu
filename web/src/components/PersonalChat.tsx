import type {MenuReceipt} from '../../../shared/workspace-updates';
import {useOptionalWorkspaceGate} from './WorkspaceGate';
import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {Icon} from './Icon';
import {ConversationStickers,ConversationStickerArt} from './ConversationStickers';
import {conversationSticker,type ConversationSticker} from '../../../shared/conversation-stickers';
import {FormNotice} from './AuthLayout';
import {WorkspaceGroupFilter} from './WorkspaceGroupFilter';
import {ChatRooms} from './ChatRooms';
import {LeaveChatRoom} from './LeaveChatRoom';
import {workspaceRequest} from '../workspace-api';
import type {ChatRoom,ChatPage,ChatCursor,WorkspaceItem,WorkspaceMe} from '../../../shared/workspace';
const dateLabel=(stamp:string)=>new Date(stamp).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'short'});
type ChatProps={cache?:Map<string,ChatPage>;revision?:number;me:WorkspaceMe;edit:(item:WorkspaceItem)=>void;compact?:boolean};
export function PersonalChat(props:ChatProps){
 const {me,compact=false,revision=0}=props;
 const space=me.family?.id??null;
 const [rooms,setRooms]=useState<ChatRoom[]>([]),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState('');
 const generation=useRef(0);
 const refreshRooms=useCallback(async()=>{
  const request=++generation.current;
  try{const result=await workspaceRequest<{items:ChatRoom[]}>('chat.rooms',{},space);if(request!==generation.current)return;
   setRooms(result.items);setSelected(id=>id&&result.items.some(room=>room.id===id)?id:null);setError('');return result.items;
  }catch(e){if(request===generation.current){setRooms([]);setSelected(null);setError((e as Error).message);}throw e;}
 },[space]);
 useEffect(()=>{if(compact)return;const update=()=>{if(!document.hidden)void refreshRooms().catch(()=>{});};update();const timer=setInterval(update,5000);window.addEventListener('focus',update);return()=>{++generation.current;clearInterval(timer);window.removeEventListener('focus',update);};},[refreshRooms,compact,revision]);
 const room=rooms.find(room=>room.id===selected);
 return <section className={'chat-workspace '+(compact?'compact':'full')} aria-label="대화 공간">
  {!compact&&<><WorkspaceGroupFilter/><ChatRooms me={me} rooms={rooms} selected={selected} select={setSelected} error={error} created={async id=>{const next=await refreshRooms();if(!next?.some(room=>room.id===id))throw new Error('대화방 목록을 다시 확인해 주세요.');setSelected(id);}}/></>}
  <RoomChat left={()=>{if(!room)return;++generation.current;const prefix=me.id+':'+(me.family?.id||'')+':'+room.id+':';for(const key of props.cache?.keys()||[])if(key.startsWith(prefix))props.cache?.delete(key);setSelected(null);setRooms(old=>old.filter(value=>value.id!==room.id));void refreshRooms().catch(()=>{});}} key={me.id+':'+(me.family?.id||'')+':'+(selected||'default')} {...props} room={room}/>
 </section>;
}
function RoomChat({me,edit,compact=false,revision=0,cache,room,left}:ChatProps&{room?:ChatRoom;left:()=>void}){
 const space=me.family?.id??null;
 const roomId=room?.id,canSend=room?.canSend!==false;
 const cacheKey=me.id+':'+(me.family?.id||'')+':'+(roomId||'default')+':'+compact,cached=cache?.get(cacheKey);
 const previousQuery=useRef('');
 const [stickersOpen,setStickersOpen]=useState(false),stickerTrayId=useId();
 const markUpdatesRead=useOptionalWorkspaceGate()?.markUpdatesRead,[receipt,setReceipt]=useState<MenuReceipt|undefined>(undefined);
 const [items,setItems]=useState<WorkspaceItem[]>(cached?.items||[]),[cursor,setCursor]=useState<ChatCursor|null>(cached?.nextCursor||null),[loading,setLoading]=useState(!cached),[busy,setBusy]=useState(false),[error,setError]=useState(''),[text,setText]=useState(''),[searchOpen,setSearchOpen]=useState(false),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[people,setPeople]=useState(false),[leaving,setLeaving]=useState(false),[sticker,setSticker]=useState<ConversationSticker|null>(null),[newMessage,setNewMessage]=useState(false);
 const history=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),seq=useRef(0),pages=useRef(1),stick=useRef(true),prepend=useRef<{height:number;top:number}|null>(null),pending=useRef<{id:string;text:string}|null>(null),sending=useRef(false),latest=useRef<string|undefined>(undefined);
 const fitInput=useCallback(()=>{const node=input.current;if(node){node.style.height='44px';node.style.height=Math.min(132,Math.max(44,node.scrollHeight))+'px';}},[]);
 useLayoutEffect(fitInput,[fitInput,text]);
 useEffect(()=>{window.addEventListener('resize',fitInput);return()=>window.removeEventListener('resize',fitInput);},[fitInput]);
 const load=useCallback(async(more=false)=>{
  const id=++seq.current;try{
   if(more&&history.current)prepend.current={height:history.current.scrollHeight,top:history.current.scrollTop};
   const count=more?pages.current+1:pages.current;let next:ChatCursor|null=null,all:WorkspaceItem[]=[],readReceipt:MenuReceipt|undefined;
   for(let n=0;n<count;n++){const result:ChatPage=await workspaceRequest('chat.list',{...(roomId?{roomId}:{}),limit:compact?20:50,...(next?{before:next}:{}),...(query?{query}:{})},space);if(n===0)readReceipt=result.updateReceipt;all=[...result.items,...all];next=result.nextCursor;if(!next)break;}
   if(id!==seq.current)return;
   if(latest.current&&latest.current!==all.at(-1)?.id&&!stick.current&&!more)setNewMessage(true);
   latest.current=all.at(-1)?.id;if(!query)cache?.set(cacheKey,{items:all,nextCursor:next,hasMore:!!next,updateReceipt:readReceipt});setItems(old=>JSON.stringify(old)===JSON.stringify(all)?old:all);setReceipt(readReceipt);setCursor(next);pages.current=count;setError('');
  }catch(e){if(id===seq.current){cache?.delete(cacheKey);setError((e as Error).message);setItems([]);setCursor(null);}}
  finally{if(id===seq.current)setLoading(false);}
 },[query,compact,cache,cacheKey,roomId,space]);
 useEffect(()=>{if(previousQuery.current!==query){pages.current=1;setCursor(null);setLoading(true);stick.current=true;previousQuery.current=query;}void load();const update=()=>{if(!document.hidden&&!sending.current)void load();};const timer=setInterval(update,5000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);return()=>{++seq.current;clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};},[load,revision]);
 useLayoutEffect(()=>{const el=history.current;if(!el)return;if(prepend.current){el.scrollTop=el.scrollHeight-prepend.current.height+prepend.current.top;prepend.current=null;}else if(stick.current)el.scrollTop=el.scrollHeight;},[items]);
 const readVisible=useCallback(()=>{if(!compact&&!loading&&!error&&!query&&stick.current&&!document.hidden&&!document.querySelector('dialog[open]'))void markUpdatesRead?.(receipt);},[compact,loading,error,query,markUpdatesRead,receipt]);
 useEffect(()=>{readVisible();document.addEventListener('visibilitychange',readVisible);return()=>document.removeEventListener('visibilitychange',readVisible);},[readVisible,items]);
 async function submit(e?:FormEvent){e?.preventDefault();const value=sticker?.message||text.trim();if(sending.current||!value||!canSend||loading)return;const sentSticker=!!sticker;sending.current=true;setBusy(true);setError('');if(pending.current?.text!==value)pending.current={id:crypto.randomUUID(),text:value};try{await workspaceRequest('chat.send',{...(roomId?{roomId}:{}),text:value,clientMessageId:pending.current.id},space);pending.current=null;if(sentSticker){setSticker(null);setStickersOpen(false);}else setText('');stick.current=true;setNewMessage(false);await load();if(!sentSticker)input.current?.focus();}catch(e){setError((e as Error).message+' 입력한 메시지를 확인하고 다시 보내 주세요.');}finally{sending.current=false;setBusy(false);}}
 return <section className={'group-chat '+(compact?'compact':'full')} aria-label="대화"><header className="chat-room-header"><span className="chat-room-avatar"><Icon name="chat"/></span><div className="chat-room-details"><small className="chat-room-meta" title={room?.name||me.family?.name||me.name}><span>{room?.name||me.family?.name||me.name}{room?' · '+room.members.filter(m=>m.active).length+'명':me.family?' · '+me.family.members.length+'명':''}</span></small></div><div className="chat-room-tools">{compact?<Link className="icon-button" to="/chat" aria-label="대화 전체 보기"><Icon name="arrow"/></Link>:<><button className="icon-button" aria-label="대화 검색" aria-pressed={searchOpen} onClick={()=>{setSearchOpen(v=>!v);if(searchOpen){setSearch('');setQuery('');}}}><Icon name="search"/></button><button className="icon-button" aria-label="대화 참여자" aria-expanded={people} onClick={()=>setPeople(v=>!v)}><Icon name="users"/></button>{room&&<button type="button" className="button compact chat-room-leave" aria-label="대화방 나가기" onClick={()=>setLeaving(true)}>나가기</button>}</>}</div></header>
 {leaving&&room&&<LeaveChatRoom room={room} hasDraft={!!text.trim()||!!sticker} close={()=>setLeaving(false)} left={left}/>}
 {searchOpen&&<form className="chat-search" onSubmit={e=>{e.preventDefault();setQuery(search.trim());}}><input aria-label="대화 내용 검색" placeholder="대화 내용 검색" value={search} onChange={e=>setSearch(e.target.value)} maxLength={100}/><button className="button compact">검색</button>{query&&<button type="button" className="icon-button" aria-label="검색 해제" onClick={()=>{setQuery('');setSearch('');}}><Icon name="close"/></button>}</form>}
 {people&&<div className="chat-participants" aria-label="참여자 목록">{(room?.members.filter(m=>m.active)||me.family?.members||[{id:me.id,name:me.name}]).map(m=><span key={m.id}><i>{m.name.slice(0,1)}</i>{m.name}{m.id===me.id?' · 나':''}</span>)}</div>}
 <div ref={history} className="group-chat-history" role="log" aria-label="대화 메시지" aria-live="polite" aria-busy={loading} onScroll={e=>{const n=e.currentTarget;stick.current=n.scrollHeight-n.scrollTop-n.clientHeight<64;if(stick.current){setNewMessage(false);readVisible();}}}>
 {cursor&&!compact&&<button type="button" className="chat-load-more" onClick={()=>void load(true)}>이전 대화 보기</button>}
 {loading&&<p className="chat-query-status" role="status">대화를 불러오고 있어요</p>}{!items.length&&!loading?<div className="chat-empty"><Icon name="chat"/><strong>{query?'검색된 대화가 없어요':'첫 메시지를 남겨 보세요'}</strong></div>:items.map((item,index)=>{const picture=conversationSticker(item.data.note||item.data.title);const stamp=item.createdAt||item.data.date+'T12:00:00+09:00',day=dateLabel(stamp),previous=items[index-1],newDay=!previous||dateLabel(previous.createdAt||previous.data.date+'T12:00:00+09:00')!==day;return <div key={item.id}>{newDay&&<div className="chat-date"><span>{day}</span></div>}<article className={'chat-message '+(item.mine?'mine':'theirs')} data-item-id={item.id}>{!item.mine&&<span className="chat-author-avatar" aria-hidden="true">{item.ownerName.slice(0,1)}</span>}<div className="chat-message-content">{!item.mine&&<span className="chat-author-name">{item.ownerName}</span>}<div className="chat-bubble-line"><button type="button" className={'chat-bubble personal-note-text'+(picture?' picture-bubble':'')} onClick={()=>edit(item)} aria-label={(item.mine?'메시지 수정: ':'메시지 상세: ')+(item.data.note||item.data.title)}>{picture?<ConversationStickerArt sticker={picture}/>:item.data.note||item.data.title}</button><span className="chat-time">{item.version>1&&<small>수정됨</small>}<time dateTime={stamp}>{new Date(stamp).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit',hour12:true})}</time></span></div></div></article></div>;})}
 </div>{newMessage&&<button className="chat-new-message" onClick={()=>{stick.current=true;setNewMessage(false);history.current?.scrollTo({top:history.current.scrollHeight,behavior:'smooth'});}}>새 메시지 · 아래로 이동 ↓</button>}
 {!canSend&&<p className="chat-read-only" role="status">대화할 참여자가 남아 있지 않아요. 새 대화방에서 대화를 이어가세요.</p>}<FormNotice error={error}/><form className="group-chat-composer" onSubmit={submit}><div id={stickerTrayId} hidden={!stickersOpen}><ConversationStickers selected={sticker?.id} disabled={busy||loading||!canSend} onSelect={value=>{setSticker(value);setError('');}}/></div>{sticker&&<div className="conversation-sticker-selection" role="status"><span><strong>{sticker.label}</strong> 그림을 보낼까요?</span><button type="button" className="icon-button" aria-label="그림 선택 취소" disabled={busy||loading||!canSend} onClick={()=>setSticker(null)}><Icon name="close"/></button></div>}<div className="chat-compose-row"><button type="button" className="chat-sticker-toggle icon-button" aria-label="그림 메시지" title="그림 메시지" aria-expanded={stickersOpen} aria-controls={stickerTrayId} disabled={busy||loading||!canSend} onClick={()=>setStickersOpen(value=>!value)}><Icon name="smile"/></button><label className="sr-only" htmlFor={compact?'home-chat-input':'room-chat-input'}>참여자에게 전할 말</label><textarea ref={input} id={compact?'home-chat-input':'room-chat-input'} placeholder="메시지 입력" value={text} readOnly={busy||loading||!canSend} onChange={e=>{setText(e.target.value);setSticker(null);}} rows={1} maxLength={5000} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.nativeEvent.keyCode!==229&&matchMedia('(pointer:fine)').matches){e.preventDefault();void submit();}}}/><button className="chat-send" aria-label="메시지 보내기" title="메시지 보내기" aria-busy={busy} disabled={busy||loading||!canSend||(!sticker&&!text.trim())}><Icon name="send"/></button></div></form></section>;
}

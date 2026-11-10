import {useEffect,useRef,useState} from 'react';
import type {ChatRoom,WorkspaceMe} from '../../../shared/workspace';
import {workspaceRequest} from '../workspace-api';
import {Icon} from './Icon';
import {FormNotice} from './AuthLayout';

export function ChatRooms({me,rooms,selected,select,created,error}:{me:WorkspaceMe;rooms:ChatRoom[];selected:string|null;select:(id:string|null)=>void;created:(id:string)=>Promise<void>;error:string}){
 const [open,setOpen]=useState(false);
 return <div className="chat-rooms">
  <div className="chat-rooms-toolbar">
  <nav className="chat-room-list" aria-label="대화방 목록">
   <button type="button" aria-label={me.family?'단체 대화 그룹 전체':'나와의 대화 개인 메모'} title={me.family?'단체 대화 · 그룹 전체':'나와의 대화 · 개인 메모'} aria-pressed={selected===null} onClick={()=>select(null)}><Icon name="users"/><span>{me.family?'단체 대화':'나와의 대화'}</span></button>
   {rooms.map(room=><button type="button" key={room.id} aria-label={room.name+' '+(room.kind==='DIRECT'?'1:1 대화':room.members.filter(m=>m.active).length+'명 참여')+(!room.canSend?' · 읽기 전용':'')} title={room.name+' · '+(room.kind==='DIRECT'?'1:1 대화':room.members.filter(m=>m.active).length+'명 참여')+(!room.canSend?' · 읽기 전용':'')} aria-pressed={selected===room.id} onClick={()=>select(room.id)}><Icon name={room.kind==='DIRECT'?'chat':'users'}/><span>{room.name}{!room.canSend?' · 읽기 전용':''}</span></button>)}
  </nav>
  <button type="button" className="button compact chat-room-create" aria-label="대화방 만들기" title="대화방 만들기" onClick={()=>setOpen(true)}><Icon name="plus"/><span>대화방</span></button>
  </div><FormNotice error={error}/>
  {open&&<CreateChatRoom me={me} close={()=>setOpen(false)} saved={async id=>{await created(id);setOpen(false);}}/>}
 </div>;
}

function CreateChatRoom({me,close,saved}:{me:WorkspaceMe;close:()=>void;saved:(id:string)=>Promise<void>}){
 const ref=useRef<HTMLDialogElement>(null),[selected,setSelected]=useState<string[]>([]),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef<{key:string;id:string}|null>(null),lock=useRef(false);
 const choices=(me.family?.members||[]).filter(member=>member.id!==me.id);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 async function submit(){
  if(lock.current||!selected.length)return;lock.current=true;setBusy(true);setError('');
  const body={memberIds:selected,name:selected.length>1?name.trim():''},key=JSON.stringify(body);
  if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  try{const result=await workspaceRequest<{id:string}>('chat.room.create',{...body,clientRequestId:pending.current.id});await saved(result.id);}
  catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 return <dialog ref={ref} className="personal-editor chat-create-dialog" aria-labelledby="create-room-title" onCancel={e=>{e.preventDefault();if(!busy)close();}}>
  <header><h2 id="create-room-title">대화방 만들기</h2><button type="button" className="icon-button" aria-label="대화방 만들기 닫기" disabled={busy} onClick={close}><Icon name="close"/></button></header>
  <FormNotice error={error}/>
  {choices.length?<form onSubmit={e=>{e.preventDefault();void submit();}}>
   <fieldset className="chat-member-choices" disabled={busy}><legend>대화할 구성원</legend>{choices.map(member=><label key={member.id}><input type="checkbox" checked={selected.includes(member.id)} onChange={()=>setSelected(ids=>ids.includes(member.id)?ids.filter(id=>id!==member.id):[...ids,member.id])}/><span><strong>{member.name}</strong><small>{member.kind==='CHILD'?'어린이':'일반사용자'}</small></span></label>)}</fieldset>
   {selected.length>1&&<label className="form-field">대화방 이름<input value={name} maxLength={60} placeholder="예: 주말 모임" disabled={busy} onChange={e=>setName(e.target.value)}/></label>}
   <button className="button primary full" disabled={busy||!selected.length}>{busy?'대화방을 여는 중':'대화 시작하기'}</button>
  </form>:<div className="chat-empty"><Icon name="users"/><p>그룹 관리에서 다른 구성원을 먼저 연결해 주세요.</p></div>}
 </dialog>;
}

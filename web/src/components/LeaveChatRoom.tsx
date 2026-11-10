import {useEffect,useId,useRef,useState} from 'react';
import type {ChatRoom} from '../../../shared/workspace';
import {workspaceRequest} from '../workspace-api';
import {FormNotice} from './AuthLayout';
export function LeaveChatRoom({room,hasDraft,close,left}:{room:ChatRoom;hasDraft:boolean;close:()=>void;left:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false),id=useId(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 async function leave(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await workspaceRequest('chat.room.leave',{roomId:room.id});left();}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 return <dialog ref={dialog} className="chat-leave-dialog" aria-labelledby={id} aria-describedby={id+'-description'} onCancel={event=>{event.preventDefault();if(!busy)close();}}>
  <h2 id={id}>대화방에서 나갈까요?</h2><p id={id+'-description'}><strong>{room.name}</strong> 대화방이 내 목록에서 사라지고, 이 방의 지난 대화를 다시 볼 수 없어요.</p><p className="account-caption">다른 참여자의 대화는 유지돼요. 다시 대화하려면 새 대화방을 만들어 주세요.</p>{hasDraft&&<p className="account-caption">입력 중인 내용도 사라져요.</p>}<FormNotice error={error}/><footer><button type="button" className="button" disabled={busy} onClick={close}>취소</button><button type="button" className="button danger" aria-busy={busy} disabled={busy} onClick={()=>void leave()}>{busy?'나가는 중':'나가기'}</button></footer>
 </dialog>;
}

import {useState} from 'react';
import {FormNotice} from './Common';

export type InviteSummary={id:string;expiresAt:string};
export type IssuedInvite=InviteSummary&{url:string};
const formatExpiry=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});

export function InviteLinkActions({url,invite,shareFallback=false}:{url:string;invite?:IssuedInvite;shareFallback?:boolean}){
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const label=invite?'그룹 초대':'일반 초대';
 const canShare=typeof navigator.share==='function';

 async function copy(){
  setError('');setMessage('');
  try{
   await navigator.clipboard.writeText(url);
   setMessage(label+' 링크를 복사했어요. 카카오톡이나 문자에 붙여넣어 보내세요.');
  }catch{setError('공유할 링크를 선택해 복사해 주세요.');}
 }

 async function share(){
  if(!canShare){await copy();return;}
  setError('');setMessage('');
  try{
   await navigator.share({title:invite?'아이하루 그룹 초대':'아이하루 앱 초대',url});
  }catch(e){
   if((e as Error).name!=='AbortError')setError('공유 창을 열지 못했어요. 링크를 복사해 보내 주세요.');
  }
 }

 return <div className="group-invite-issued">
  {invite&&<small>{formatExpiry.format(new Date(invite.expiresAt))}까지 · 한 번 사용</small>}
  <input aria-label={invite?'발급한 그룹 초대 링크':'일반 초대 링크'} value={url} readOnly onFocus={e=>e.target.select()}/>
  <div className="group-invite-actions">
   {(canShare||shareFallback)&&<button type="button" className={invite?'button primary':'button'} onClick={()=>void share()}>{label} 공유</button>}
   <button type="button" className="button" onClick={()=>void copy()}>{label} 링크 복사</button>
  </div>
  <FormNotice error={error} message={message}/>
 </div>;
}

export {formatExpiry};

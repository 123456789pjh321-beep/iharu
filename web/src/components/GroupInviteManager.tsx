import {useEffect,useState,type FormEvent} from 'react';
import {workspaceRequest} from '../workspace-api';
import {FormNotice} from './AuthLayout';
import {Icon} from './Icon';

type InviteSummary={id:string;expiresAt:string};
type IssuedInvite=InviteSummary&{url:string};
const appInviteLink='https://myiharu.com/timetable';
const formatExpiry=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});

export function GroupInviteManager({canInvite,refresh}:{canInvite:boolean;refresh:()=>Promise<void>}){
 const [pending,setPending]=useState<InviteSummary[]>([]);
 const [issued,setIssued]=useState<IssuedInvite|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [revision,setRevision]=useState(0);

 useEffect(()=>{
  if(!canInvite)return;
  let active=true;
  workspaceRequest<{pending:InviteSummary[]}>('invite.link.options').then(result=>{
   if(active)setPending(result.pending);
  }).catch(e=>{if(active)setError((e as Error).message);});
  return()=>{active=false;};
 },[canInvite,revision]);

 async function issue(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy)return;
  const consent=new FormData(event.currentTarget).get('consent')==='on';
  setBusy(true);setError('');setMessage('');
  try{
   const result=await workspaceRequest<IssuedInvite>('invite.link.issue',{consent});
   setIssued(result);
   setRevision(value=>value+1);
   await refresh();
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 async function share(url:string,title:string){
  setError('');setMessage('');
  try{
   await navigator.share({title,url});
  }catch(e){
   if((e as Error).name!=='AbortError')setError('공유 창을 열지 못했어요. 링크를 복사해 보내 주세요.');
  }
 }

 async function copy(url:string,label:string){
  setError('');setMessage('');
  try{
   await navigator.clipboard.writeText(url);
   setMessage(label+'를 복사했어요. 카카오톡이나 문자에 붙여넣어 보내세요.');
  }catch{setError('공유할 링크를 선택해 복사해 주세요.');}
 }

 async function revoke(inviteId:string){
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  try{
   await workspaceRequest('invite.link.revoke',{inviteId});
   if(issued?.id===inviteId)setIssued(null);
   setRevision(value=>value+1);
   setMessage('그룹 초대 링크를 취소했어요.');
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 return <section className="account-card">
  <div className="card-title"><h2><Icon name="key"/>초대 링크</h2></div>
  <FormNotice error={error} message={message}/>
  <section className="group-invite-option" aria-labelledby="invite-group-title">
   <h3 id="invite-group-title">그룹 초대</h3>
   <p>받은 사람이 로그인하고 초대를 수락하면 같은 그룹으로 연결돼요.</p>
   {canInvite?<>
    <form className="auth-form" onSubmit={issue}><fieldset disabled={busy}>
     <legend className="sr-only">그룹 초대 링크 발급</legend>
     <label className="check-option"><input type="checkbox" name="consent" required/><span>초대받은 사람과 같은 그룹에서 일정 등 자료를 공유하는 데 동의합니다.</span></label>
     <button className="button primary full" disabled={busy}>그룹 초대 링크 만들기</button>
    </fieldset></form>
    {issued&&<div className="group-invite-issued">
     <small>{formatExpiry.format(new Date(issued.expiresAt))}까지 · 한 번 사용</small>
     <input aria-label="발급한 그룹 초대 링크" value={issued.url} readOnly onFocus={e=>e.target.select()}/>
     <div className="group-invite-actions">{typeof navigator.share==='function'&&<button className="button primary" onClick={()=>void share(issued.url,'아이하루 그룹 초대')}>그룹 초대 공유</button>}<button className="button" onClick={()=>void copy(issued.url,'그룹 초대 링크')}>그룹 초대 링크 복사</button></div>
    </div>}
    {!!pending.length&&<div className="group-invite-pending"><h4>사용 가능한 그룹 초대</h4><ul>
     {pending.map(invite=><li key={invite.id}><small>{formatExpiry.format(new Date(invite.expiresAt))}까지</small><button className="button compact" disabled={busy} onClick={()=>void revoke(invite.id)}>링크 취소</button></li>)}
    </ul></div>}
   </>:<p>그룹 초대 링크는 호스트에게 요청해 주세요.</p>}
  </section>
  <section className="group-invite-option" aria-labelledby="invite-app-title">
   <h3 id="invite-app-title">일반 초대</h3>
   <p>아이하루 시간표를 열어 앱을 둘러볼 수 있어요.</p>
   <div className="group-invite-issued">
    <input aria-label="일반 초대 링크" value={appInviteLink} readOnly onFocus={e=>e.target.select()}/>
    <div className="group-invite-actions">{typeof navigator.share==='function'&&<button className="button" onClick={()=>void share(appInviteLink,'아이하루 앱 초대')}>일반 초대 공유</button>}<button className="button" onClick={()=>void copy(appInviteLink,'일반 초대 링크')}>일반 초대 링크 복사</button></div>
   </div>
  </section>
 </section>;
}

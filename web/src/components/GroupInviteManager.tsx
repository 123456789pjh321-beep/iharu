import {useEffect,useId,useState,type FormEvent} from 'react';
import {workspaceRequest} from '../workspace-api';
import {FormNotice} from './Common';
import {useGroupInviteRevision} from './GroupInviteShare';
import {Icon} from './Icon';
import {InviteLinkActions,formatExpiry,type InviteSummary,type IssuedInvite} from './InviteLinkActions';
const appInviteLink='https://myiharu.com/timetable';

export function GroupInviteManager({canInvite,refresh}:{canInvite:boolean;refresh:()=>Promise<void>}){
 const id=useId();
 const [pending,setPending]=useState<InviteSummary[]>([]);
 const [issued,setIssued]=useState<IssuedInvite|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [revision,setRevision]=useState(0);
 const shortcutRevision=useGroupInviteRevision();

 const issuedId=issued?.id;
 useEffect(()=>{
  if(!canInvite)return;
  let active=true;
  workspaceRequest<{pending:InviteSummary[]}>('invite.link.options').then(result=>{
   if(!active)return;
   setPending(result.pending);
   if(issuedId&&!result.pending.some(invite=>invite.id===issuedId)){
    setIssued(current=>current?.id===issuedId?null:current);
   }
  }).catch(e=>{if(active)setError((e as Error).message);});
  return()=>{active=false;};
 },[canInvite,issuedId,revision,shortcutRevision]);

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
  <section className="group-invite-option" aria-labelledby={id+'-group'}>
   <h3 id={id+'-group'}>그룹 초대</h3>
   <p>받은 사람이 로그인하고 초대를 수락하면 같은 그룹으로 연결돼요.</p>
   {canInvite?<>
    <form className="auth-form" onSubmit={issue}><fieldset disabled={busy}>
     <legend className="sr-only">그룹 초대 링크 발급</legend>
     <label className="check-option"><input type="checkbox" name="consent" required/><span>초대받은 사람과 같은 그룹에서 일정 등 자료를 공유하는 데 동의합니다.</span></label>
     <button className="button primary full" disabled={busy}>그룹 초대 링크 만들기</button>
    </fieldset></form>
    {issued&&<InviteLinkActions key={issued.id} url={issued.url} invite={issued}/>}
    {!!pending.length&&<div className="group-invite-pending"><h4>사용 가능한 그룹 초대</h4><ul>
     {pending.map(invite=><li key={invite.id}><small>{formatExpiry.format(new Date(invite.expiresAt))}까지</small><button className="button compact" disabled={busy} onClick={()=>void revoke(invite.id)}>링크 취소</button></li>)}
    </ul></div>}
   </>:<p>그룹 초대 링크는 호스트에게 요청해 주세요.</p>}
  </section>
  <section className="group-invite-option" aria-labelledby={id+'-app'}>
   <h3 id={id+'-app'}>일반 초대</h3>
   <p>아이하루 시간표를 열어 앱을 둘러볼 수 있어요.</p>
   <InviteLinkActions url={appInviteLink}/>
  </section>
 </section>;
}

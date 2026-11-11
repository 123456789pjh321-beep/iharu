import {useEffect,useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {workspaceRequest} from '../workspace-api';
import {FormNotice} from './AuthLayout';
import {Icon} from './Icon';

type InviteKind='PARENT'|'CHILD';
type InviteSummary={id:string;kind:InviteKind;expiresAt:string};
type InviteOptions={childRegistrationReady:boolean;children:{id:string;label:string}[];pending:InviteSummary[]};
type IssuedInvite=InviteSummary&{url:string};
const formatExpiry=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});

export function GroupInviteManager({canInvite,refresh}:{canInvite:boolean;refresh:()=>Promise<void>}){
 const [kind,setKind]=useState<InviteKind>('PARENT');
 const [options,setOptions]=useState<InviteOptions|null>(null);
 const [issued,setIssued]=useState<IssuedInvite|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [revision,setRevision]=useState(0);

 useEffect(()=>{
  if(!canInvite)return;
  let active=true;
  workspaceRequest<InviteOptions>('invite.link.options').then(result=>{
   if(active)setOptions(result);
  }).catch(e=>{if(active)setError((e as Error).message);});
  return()=>{active=false;};
 },[canInvite,revision]);

 async function issue(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy)return;
  const data=new FormData(event.currentTarget);
  setBusy(true);setError('');setMessage('');
  try{
   const result=await workspaceRequest<IssuedInvite>('invite.link.issue',{
    kind,consent:data.get('consent')==='on',
    ...(kind==='CHILD'?{guardianApplicationId:data.get('guardianApplicationId')}:{})
   });
   setIssued(result);
   setRevision(value=>value+1);
   await refresh();
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 async function share(invite:IssuedInvite){
  setError('');setMessage('');
  try{
   await navigator.share({title:'아이하루 그룹 초대',url:invite.url});
  }catch(e){
   if((e as Error).name!=='AbortError')setError('공유 창을 열지 못했어요. 링크를 복사해 보내 주세요.');
  }
 }

 async function copy(invite:IssuedInvite){
  setError('');setMessage('');
  try{
   await navigator.clipboard.writeText(invite.url);
   setMessage('초대 링크를 복사했어요. 카카오톡이나 문자에 붙여넣어 보내세요.');
  }catch{setError('아래 링크를 선택해 복사해 주세요.');}
 }

 async function revoke(inviteId:string){
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  try{
   await workspaceRequest('invite.link.revoke',{inviteId});
   if(issued?.id===inviteId)setIssued(null);
   setRevision(value=>value+1);
   setMessage('초대 링크를 취소했어요.');
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 return <section className="account-card">
  <div className="card-title"><h2><Icon name="key"/>그룹 초대 링크</h2></div>
  {canInvite?<>
   <p>카카오톡이나 문자로 초대 링크를 보내세요. 링크 한 개로 한 사람이 참여할 수 있어요.</p>
   <FormNotice error={error} message={message}/>
   <form className="auth-form" onSubmit={issue}><fieldset disabled={busy}>
    <legend className="sr-only">그룹 초대 대상 선택</legend>
    <div className="form-field"><label htmlFor="group-invite-kind">초대 대상</label><select id="group-invite-kind" value={kind} onChange={e=>setKind(e.target.value as InviteKind)}><option value="PARENT">일반사용자</option><option value="CHILD">어린이</option></select></div>
    {kind==='CHILD'&&(options?.children.length?<div className="form-field"><label htmlFor="group-invite-child">보호자 확인이 끝난 어린이</label><select id="group-invite-child" name="guardianApplicationId" defaultValue="" required><option value="" disabled>어린이 선택</option>{options.children.map(child=><option key={child.id} value={child.id}>{child.label}</option>)}</select></div>:
     <div className="auth-notice" role="status"><p>{options&&!options.childRegistrationReady?'어린이 계정 등록을 준비 중이에요. 보호자 확인 신청 상태는 아래에서 확인할 수 있어요.':'보호자 확인을 마친 어린이에게 초대 링크를 보낼 수 있어요.'}</p><Link to="/family/verification">보호자 확인 신청 및 결과</Link></div>)}
    <label className="check-option"><input type="checkbox" name="consent" required/><span>{kind==='CHILD'?'이 어린이가 계정을 만들고 그룹에서 일정을 공유하도록 법정대리인으로서 동의합니다.':'초대받은 사람과 같은 그룹에서 일정 등 자료를 공유하는 데 동의합니다.'}</span></label>
    {kind==='CHILD'&&<Link to="/legal/privacy">어린이 계정 개인정보 안내</Link>}
    <button className="button primary full" disabled={busy||kind==='CHILD'&&!options?.children.length}>초대 링크 만들기</button>
   </fieldset></form>
   {issued&&<div className="group-invite-issued">
    <strong>{issued.kind==='CHILD'?'어린이':'일반사용자'} 초대 링크</strong>
    <small>{formatExpiry.format(new Date(issued.expiresAt))}까지 · 한 번 사용</small>
    <input aria-label="발급한 초대 링크" value={issued.url} readOnly onFocus={e=>e.target.select()}/>
    <div className="group-invite-actions">{typeof navigator.share==='function'&&<button className="button primary" onClick={()=>void share(issued)}>공유하기</button>}<button className="button" onClick={()=>void copy(issued)}>링크 복사</button></div>
   </div>}
   {!!options?.pending.length&&<div className="group-invite-pending"><h3>사용 가능한 초대</h3><ul>
    {options.pending.map(invite=><li key={invite.id}><div><strong>{invite.kind==='CHILD'?'어린이':'일반사용자'}</strong><small>{formatExpiry.format(new Date(invite.expiresAt))}까지</small></div><button className="button compact" disabled={busy} onClick={()=>void revoke(invite.id)}>링크 취소</button></li>)}
   </ul></div>}
  </>:<p>그룹 호스트에게 초대 링크를 받아 카카오톡이나 문자에서 열어 주세요.</p>}
 </section>;
}

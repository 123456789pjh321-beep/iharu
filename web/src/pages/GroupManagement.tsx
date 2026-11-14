import {useEffect,useRef,useState} from 'react';
import {Link,Navigate,useNavigate,useSearchParams} from 'react-router-dom';
import type {WorkspaceGroup} from '../../../shared/workspace';
import {AuthLayout} from '../components/AuthLayout';
import {GroupEditor} from '../components/GroupEditor';
import {useWorkspaceGate} from '../components/WorkspaceGate';
import {useEntryAccess} from '../components/EntryAccess';
import {Loading,ErrorState} from '../components/Common';
import {Icon} from '../components/Icon';
import {InviteLinkActions,type IssuedInvite} from '../components/InviteLinkActions';
import {workspaceRequest} from '../workspace-api';
import '../components/workspace-groups.css';

export function GroupManagement(){
 const gate=useWorkspaceGate(),{requestLogin}=useEntryAccess(),me=gate.access.identity;
 const [params,setParams]=useSearchParams(),navigate=useNavigate();
 const [editing,setEditing]=useState<WorkspaceGroup|null>(null),[inviting,setInviting]=useState<WorkspaceGroup|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false),receipt=me?.updateReceipt,{markUpdatesRead}=gate;
 useEffect(()=>{void markUpdatesRead(receipt);},[markUpdatesRead,receipt]);
 if(gate.access.status==='checking')return <AuthLayout wide><Loading label="그룹을 확인하고 있어요"/></AuthLayout>;
 if(gate.access.status==='error')return <AuthLayout wide><ErrorState message={gate.access.error||'그룹을 확인하지 못했어요'} retry={()=>void gate.refreshAccess()}/></AuthLayout>;
 if(gate.access.status==='restricted')return <Navigate to="/account" replace/>;
 const groups=me?.groups||[],selected=me?.family?.id??null;
 const detail=groups.find(group=>group.id===params.get('group'));
 const creating=params.get('create')==='1'&&me?.role==='PARENT';
 const closeEditor=()=>{setEditing(null);if(params.has('create'))setParams({}, {replace:true});};
 const create=()=>{if(me)setParams({create:'1'});else requestLogin({title:'그룹을 만들려면 로그인해 주세요'});};
 async function action(fn:()=>Promise<unknown>,message=''){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{await fn();await gate.refreshAccess();setNotice(message);}catch(e){setError((e as Error).message);}
  finally{lock.current=false;setBusy(false);}
 }
 const openSpace=(id:string|null)=>void action(async()=>{if(id!==selected)await gate.selectGroup(id);navigate('/timetable');});
 const leave=(group:WorkspaceGroup)=>{
  const self=group.members.find(m=>m.id===me?.id);
  if(self&&window.confirm(group.name+'에서 나갈까요? 이 그룹에 작성한 내 자료는 개인 공간에 보관돼요.'+(group.isHost&&group.members.length>1?' 그룹장은 다음 가입자에게 이어져요.':'')))void action(async()=>{await workspaceRequest('family.leave',{familyId:group.id,version:self.version});setParams({});},'그룹을 나왔어요.');
 };
 return <AuthLayout wide><div className="group-management">
  <h1 className="sr-only">그룹관리</h1>{detail&&<button type="button" className="group-back-button" onClick={()=>{setParams({});setError('');setNotice('');}}><Icon name="left"/>그룹 목록</button>}
  <div className="group-management-body">
   {error&&<p role="alert" className="group-error">{error}</p>}{notice&&<p role="status" className="group-notice">{notice}</p>}
   {detail?<section className="group-detail" aria-label={detail.name+' 그룹 상세'}>
    <div className="group-detail-heading"><GroupCover group={detail}/><div><h2>{detail.name}</h2><p>구성원 {detail.members.length}명 · {detail.isHost?'내가 만든 그룹':'함께하는 그룹'}</p></div>{detail.isHost&&<button type="button" className="icon-button" aria-label="그룹 설정" disabled={busy} onClick={()=>setEditing(detail)}><Icon name="settings"/></button>}</div>
    {detail.description&&<p className="group-description">{detail.description}</p>}
    <div className="group-detail-actions">{me?.role!=='CHILD'&&<button type="button" className="button primary" disabled={busy} onClick={()=>setInviting(detail)}><Icon name="plus"/>구성원 초대</button>}<button type="button" className="button" disabled={busy} onClick={()=>openSpace(detail.id)}>그룹 열기<Icon name="arrow"/></button></div>
    {detail.members.length===1&&<p className="group-invite-hint">초대 링크를 보내 함께할 사람을 초대해 보세요.</p>}
    <div className="group-member-list"><h3>함께하는 사람 <span>{detail.members.length}</span></h3>{detail.members.map(member=><div key={member.id} className="group-member-row"><span className="group-member-avatar" aria-hidden="true">{Array.from(member.name)[0]}</span><div><strong>{member.name}{member.id===me?.id&&<small> 나</small>}</strong><small>{member.host?'그룹장':'구성원'}</small></div></div>)}</div>
    <details className="group-manage-options"><summary>그룹 관리<Icon name="chevron"/></summary>
     {detail.isHost&&detail.members.filter(member=>member.id!==me?.id).map(member=><div className="group-member-row" key={member.id}><div className="group-admin-member-name">{member.name}</div><div className="group-member-actions">{member.kind==='PARENT'&&<button type="button" disabled={busy} aria-label={member.name+'에게 그룹장 위임'} onClick={()=>{if(window.confirm(member.name+'님에게 그룹장을 위임할까요? 기존 초대 링크는 폐기돼요.'))void action(()=>workspaceRequest('group.transfer',{groupId:detail.id,profileId:member.id,version:detail.version}),'그룹장을 위임했어요.');}}>그룹장 위임</button>}<button type="button" disabled={busy} aria-label={member.name+' 내보내기'} onClick={()=>{if(window.confirm(member.name+'님을 이 그룹에서 내보낼까요? 본인 자료와 다른 그룹 참여는 유지돼요.'))void action(()=>workspaceRequest('family.remove',{familyId:detail.id,profileId:member.id,version:member.version}),'구성원을 내보냈어요.');}}>내보내기</button></div></div>)}
     <button type="button" className="group-text-button danger" disabled={busy} onClick={()=>leave(detail)}>그룹 나가기</button>
    </details>
   </section>:<>
    <div className="groups-section-heading"><h2>내 그룹 <span>{groups.length}</span></h2></div>
    <div className="group-card-list">{groups.map(group=><section key={group.id} className={'managed-group'+(selected===group.id?' selected':'')} aria-label={group.name+' 그룹'}><button type="button" className="group-card-title" onClick={()=>setParams({group:group.id})}><GroupCover group={group}/><span className="group-row-text"><strong>{group.name}</strong><small><Icon name="users"/>{group.members.length}명<span className="group-row-members"> · {group.members.slice(0,3).map(member=>member.name).join(', ')}</span></small></span>{selected===group.id&&<span className="group-current-mark" aria-label="선택됨"><Icon name="check"/></span>}<Icon name="chevron"/></button></section>)}</div>
    <section className="personal-space-card" aria-label="개인 공간"><button type="button" className="group-card-title" disabled={busy||me?.role==='CHILD'} onClick={()=>me?openSpace(null):navigate('/timetable')}><span className="group-cover personal-cover"><Icon name="shield"/></span><span className="group-row-text"><strong>개인</strong><small>나만 보는 일정과 기록</small></span>{selected===null&&<span className="group-current-mark" aria-label="선택됨"><Icon name="check"/></span>}<Icon name="chevron"/></button></section>
    {me?.role!=='CHILD'&&<button type="button" className="group-create-row" onClick={create}><span className="group-cover"><Icon name="plus"/></span><span>새 그룹 만들기</span></button>}
    <p className="group-sharing-guide"><Icon name="shield"/>개인 자료는 그룹에 자동 공유되지 않아요.</p>
   </>}
  </div>
  {(creating||editing)&&<GroupEditor group={editing} initialName={groups.length?'새 그룹':'기본그룹'} onClose={closeEditor} onSaved={async groupId=>{setEditing(null);setParams({group:groupId},{replace:true});await gate.refreshAccess();}} onArchive={editing?()=>{const group=editing;if(window.confirm(group.name+'을 종료할까요? 작성 자료는 각자의 개인 공간에 보관됩니다. 이 그룹의 초대와 대화는 종료돼요.'))void action(async()=>{await workspaceRequest('group.archive',{groupId:group.id,version:group.version});setEditing(null);setParams({});},'그룹을 종료했어요.');}:undefined}/>}
  {inviting&&<GroupInviteSheet group={inviting} onClose={()=>setInviting(null)}/>}
 </div></AuthLayout>;
}
function GroupCover({group}:{group:WorkspaceGroup}){
 return <span className={'group-cover group-color-'+group.color} aria-hidden="true"><Icon name="users"/><span>{Array.from(group.name)[0]}</span></span>;
}
function GroupInviteSheet({group,onClose}:{group:WorkspaceGroup;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),[invite,setInvite]=useState<IssuedInvite|null>(null),[error,setError]=useState(''),[consentRequired,setConsentRequired]=useState(false),[revoked,setRevoked]=useState(false),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
 const issuance=useRef<{groupId:string;retry:number;request:Promise<IssuedInvite>} | null>(null);
 useEffect(()=>{const node=ref.current;node?.showModal();return()=>node?.close();},[]);
 useEffect(()=>{
  if(issuance.current?.groupId!==group.id||issuance.current.retry!==retry){
   issuance.current={groupId:group.id,retry,request:workspaceRequest<IssuedInvite>('invite.link.issue',{consent:true,groupId:group.id})};
  }
  let active=true;
  setError('');
  issuance.current.request.then(link=>{if(active)setInvite(link);}).catch(e=>{if(active){setError(e.message);setConsentRequired(e.code==='LEGAL_ACCEPTANCE_REQUIRED');}});
  return()=>{active=false;};
 },[group.id,retry]);
 return <dialog ref={ref} className="group-dialog" aria-labelledby="group-invite-title" onCancel={onClose}><header><h2 id="group-invite-title">{group.name} 초대</h2><button className="icon-button" type="button" aria-label="초대 닫기" onClick={onClose}><Icon name="close"/></button></header><div className="group-dialog-body"><p>링크를 보내고 상대방이 수락하면 이 그룹에 함께 참여해요.</p>{error?<><p className="group-error" role="alert">{error}</p>{consentRequired?<Link className="button" to="/privacy" onClick={onClose}>개인정보 관리 열기</Link>:<button type="button" className="button" onClick={()=>setRetry(n=>n+1)}>다시 시도</button>}</>:revoked?<p role="status">초대 링크를 폐기했어요.</p>:invite?<><InviteLinkActions url={invite.url} invite={invite} shareFallback/><button type="button" className="group-text-button danger" disabled={busy} onClick={async()=>{setBusy(true);try{await workspaceRequest('invite.link.revoke',{groupId:group.id,inviteId:invite.id});setRevoked(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>이 링크 폐기</button></>:<p role="status">초대 링크를 만들고 있어요.</p>}<p className="group-sharing-guide">그룹마다 최신 링크 1개만 유지돼요. 새로 발급하면 이 그룹의 이전 링크만 즉시 폐기됩니다. 유효 기간은 24시간이에요.</p></div></dialog>;
}

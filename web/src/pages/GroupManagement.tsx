import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,Navigate} from 'react-router-dom';
import type {WorkspaceGroup} from '../../../shared/workspace';
import {AuthLayout} from '../components/AuthLayout';
import {WorkspaceToolbar} from '../components/WorkspaceToolbar';
import {GroupInviteManager} from '../components/GroupInviteManager';
import {useWorkspaceGate} from '../components/WorkspaceGate';
import {useEntryAccess} from '../components/EntryAccess';
import {Loading,ErrorState} from '../components/Common';
import {Icon} from '../components/Icon';
import {InviteLinkActions,type IssuedInvite} from '../components/InviteLinkActions';
import {workspaceRequest} from '../workspace-api';
import '../components/workspace-groups.css';

export function GroupManagement(){
 const gate=useWorkspaceGate(),{requestLogin}=useEntryAccess(),me=gate.access.identity;
 const [editing,setEditing]=useState<WorkspaceGroup|'new'|null>(null),[inviting,setInviting]=useState<WorkspaceGroup|null>(null),[expanded,setExpanded]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false);
 if(gate.access.status==='checking')return <AuthLayout wide><Loading label="그룹을 확인하고 있어요"/></AuthLayout>;
 if(gate.access.status==='error')return <AuthLayout wide><ErrorState message={gate.access.error||'그룹을 확인하지 못했어요'} retry={()=>void gate.refreshAccess()}/></AuthLayout>;
 if(gate.access.status==='restricted')return <Navigate to="/account" replace/>;
 const groups=me?.groups||[],selected=me?.family?.id??null;
 async function action(fn:()=>Promise<unknown>,message:string){if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await fn();await gate.refreshAccess();setNotice(message);}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 const choose=(id:string|null)=>void action(()=>gate.selectGroup(id),id?'선택한 그룹의 자료를 표시해요.':'개인 자료는 본인만 볼 수 있어요.');
 return <AuthLayout wide><div className="group-management">
  <WorkspaceToolbar title="그룹관리">{me?.role!=='CHILD'&&<button type="button" className="button primary compact" disabled={busy} onClick={()=>me?setEditing('new'):requestLogin({title:'그룹을 만들려면 로그인해 주세요'})}><Icon name="plus"/>새 그룹</button>}</WorkspaceToolbar>
  <div className="group-management-body">
   <p className="group-intro">개인은 나만, 그룹은 함께.<br/><span>그룹을 선택하고 그 안에 등록한 자료만 구성원과 공유해요.</span></p>
   {error&&<p role="alert" className="group-error">{error}</p>}{notice&&<p role="status" className="group-notice">{notice}</p>}
   <section className="personal-space-card" aria-label="개인 공간"><span className="group-symbol"><Icon name="shield"/></span><div><h2>개인 <span>나만 보기</span></h2><p>그룹 생성·초대 수락과 관계없이<br/>개인 자료는 자동 공유되지 않아요.</p></div><button type="button" className="button compact" aria-pressed={selected===null} disabled={!me||me.role==='CHILD'||busy} onClick={()=>choose(null)}>{selected===null?'선택됨':'선택'}</button></section>
   <div className="groups-section-heading"><h2>참여 중인 그룹 <span>{groups.length}</span></h2><small>여러 그룹에 함께 참여할 수 있어요</small></div>
   {!groups.length?<section className="groups-empty"><Icon name="users"/><h3>함께할 첫 그룹을 만들어 보세요</h3><p>처음에는 ‘기본그룹’으로 시작해요.<br/>가족·학교·친구 모임마다 새 그룹을 추가할 수 있어요.</p><button type="button" className="button primary" onClick={()=>me?setEditing('new'):requestLogin({title:'그룹을 만들려면 로그인해 주세요'})}>기본그룹 만들기</button></section>:
    <div className="group-card-list">{groups.map(group=>{const open=expanded===group.id;return <section key={group.id} className={'managed-group'+(selected===group.id?' selected':'')} aria-label={group.name+' 그룹'}>
     <header><button type="button" className="group-card-title" aria-expanded={open} aria-controls={'group-members-'+group.id} onClick={()=>setExpanded(open?null:group.id)}><span className={'group-symbol group-color-'+group.color}><Icon name="users"/></span><span><strong>{group.name}</strong><small>{group.isHost?'그룹장':'구성원'} · {group.members.length}명</small></span><Icon name="chevron"/></button><button className="button compact" type="button" disabled={busy} aria-pressed={selected===group.id} onClick={()=>choose(group.id)}>{selected===group.id?'선택됨':'선택'}</button></header>
     {group.description&&<p className="group-description">{group.description}</p>}
     <div className="group-actions">{me?.role!=='CHILD'&&<button className="button compact" type="button" disabled={busy} onClick={()=>setInviting(group)}><Icon name="plus"/>구성원 초대</button>}{group.isHost&&<button className="button compact" type="button" disabled={busy} onClick={()=>setEditing(group)}><Icon name="settings"/>그룹 설정</button>}<button type="button" className="group-text-button" disabled={busy} onClick={()=>{const self=group.members.find(m=>m.id===me?.id);if(self&&window.confirm(group.name+'에서 나갈까요? 이 그룹에 작성한 내 자료는 개인 공간에 보관되고 다른 그룹 참여는 유지돼요.'+(group.isHost&&group.members.length>1?' 그룹장은 다음 가입자에게 자동으로 이어져요.':'')))void action(()=>workspaceRequest('family.leave',{familyId:group.id,version:self.version}),'그룹을 나왔어요. 내 자료는 개인 공간에서 확인하세요.');}}>나가기</button></div>
     {open&&<div className="group-member-list" id={'group-members-'+group.id}><h3>구성원</h3>{group.members.map(member=><div key={member.id} className="group-member-row"><span className="group-member-avatar" aria-hidden="true">{Array.from(member.name)[0]}</span><div><strong>{member.name}{member.id===me?.id&&<small> 나</small>}</strong><small>{member.host?'그룹장':'구성원'}</small></div>{group.isHost&&member.id!==me?.id&&<div className="group-member-actions">{member.kind==='PARENT'&&<button type="button" disabled={busy} aria-label={member.name+'에게 그룹장 위임'} onClick={()=>{if(window.confirm(member.name+'님에게 그룹장을 위임할까요? 기존 초대 링크는 폐기돼요.'))void action(()=>workspaceRequest('group.transfer',{groupId:group.id,profileId:member.id,version:group.version}),'그룹장을 위임했어요.');}}>위임</button>}<button type="button" disabled={busy} aria-label={member.name+' 내보내기'} onClick={()=>{if(window.confirm(member.name+'님을 이 그룹에서 내보낼까요? 이 그룹의 공유만 해제되고 본인 자료와 다른 그룹 참여는 유지돼요.'))void action(()=>workspaceRequest('family.remove',{familyId:group.id,profileId:member.id,version:member.version}),'구성원을 내보냈어요.');}}>내보내기</button></div>}</div>)}</div>}
    </section>;})}</div>}
   <p className="group-sharing-guide"><Icon name="shield"/>새 그룹에 참여해도 개인·다른 그룹의 자료는 옮겨지지 않아요. 그룹장은 구성원을 관리하며, 게시글은 작성자만 수정할 수 있어요.</p>
   {me?.role==='PARENT'&&<GroupInviteManager canInvite={true} showGroup={false}/>}
  </div>
  {editing&&<GroupEditor group={editing==='new'?null:editing} initialName={groups.length?'새 그룹':'기본그룹'} onClose={()=>setEditing(null)} onSaved={async()=>{setEditing(null);await gate.refreshAccess();setNotice('그룹을 저장했어요.');}} onArchive={editing==='new'?undefined:()=>{const group=editing;if(window.confirm(group.name+'을 종료할까요? 모든 구성원의 작성 자료는 각자의 개인 공간에 보관됩니다. 이 그룹의 초대와 대화는 종료돼요.'))void action(async()=>{await workspaceRequest('group.archive',{groupId:group.id,version:group.version});setEditing(null);},'그룹을 종료했어요.');}}/>}
  {inviting&&<GroupInviteSheet group={inviting} onClose={()=>setInviting(null)}/>}
 </div></AuthLayout>;
}
function GroupEditor({group,initialName,onClose,onSaved,onArchive}:{group:WorkspaceGroup|null;initialName:string;onClose:()=>void;onSaved:()=>Promise<void>;onArchive?:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),pending=useRef(false),[key]=useState(()=>crypto.randomUUID());
 const [name,setName]=useState(group?.name||initialName),[description,setDescription]=useState(group?.description||''),[color,setColor]=useState(group?.color||0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const node=ref.current;node?.showModal();return()=>node?.close();},[]);
 async function save(e:FormEvent){e.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await workspaceRequest(group?'group.update':'group.create',{name,description,color,...(group?{groupId:group.id,version:group.version}:{clientRequestId:key})});await onSaved();}catch(e){setError((e as Error).message);setBusy(false);pending.current=false;}}
 return <dialog ref={ref} className="group-dialog" aria-labelledby="group-editor-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><form onSubmit={save}><header><h2 id="group-editor-title">{group?'그룹 설정':'새 그룹 만들기'}</h2><button type="button" className="icon-button" aria-label="그룹 설정 닫기" disabled={busy} onClick={onClose}><Icon name="close"/></button></header><div className="group-dialog-body"><fieldset disabled={busy}><label>그룹 이름<input aria-label="그룹 이름" required value={name} maxLength={40} onChange={e=>setName(e.target.value)}/></label><label>그룹 소개<textarea aria-label="그룹 소개" value={description} maxLength={240} onChange={e=>setDescription(e.target.value)} rows={3} placeholder="함께할 사람들에게 그룹을 소개해 주세요"/></label><div className="group-color-picker" role="group" aria-label="그룹 색상">{['초록','파랑','분홍','갈색','보라','주황'].map((label,i)=><button type="button" key={label} aria-label={label} aria-pressed={color===i} onClick={()=>setColor(i)} className={'group-color-'+i}>{color===i&&<Icon name="check"/>}</button>)}</div><p className="group-sharing-guide">개인 자료는 이 그룹에 자동으로 공유되지 않아요. 그룹을 선택한 뒤 등록한 자료만 함께 볼 수 있어요.</p></fieldset>{error&&<p role="alert" className="group-error">{error}</p>}{onArchive&&<button type="button" className="group-text-button danger" disabled={busy} onClick={onArchive}>그룹 종료</button>}</div><footer><button className="button" type="button" disabled={busy} onClick={onClose}>취소</button><button className="button primary" type="submit" disabled={busy||!name.trim()}>{busy?'저장 중…':group?'변경 저장':'그룹 만들기'}</button></footer></form></dialog>;
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
 return <dialog ref={ref} className="group-dialog" aria-labelledby="group-invite-title" onCancel={onClose}><header><h2 id="group-invite-title">{group.name} 초대</h2><button className="icon-button" type="button" aria-label="초대 닫기" onClick={onClose}><Icon name="close"/></button></header><div className="group-dialog-body"><p>이 그룹에만 참여하는 링크예요. 기존 그룹 참여와 개인 자료는 그대로 유지돼요.</p>{error?<><p className="group-error" role="alert">{error}</p>{consentRequired?<Link className="button" to="/privacy" onClick={onClose}>개인정보 관리 열기</Link>:<button type="button" className="button" onClick={()=>setRetry(n=>n+1)}>다시 시도</button>}</>:revoked?<p role="status">초대 링크를 폐기했어요.</p>:invite?<><InviteLinkActions url={invite.url} invite={invite} shareFallback/><button type="button" className="group-text-button danger" disabled={busy} onClick={async()=>{setBusy(true);try{await workspaceRequest('invite.link.revoke',{groupId:group.id,inviteId:invite.id});setRevoked(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>이 링크 폐기</button></>:<p role="status">초대 링크를 만들고 있어요.</p>}<p className="group-sharing-guide">그룹마다 최신 링크 1개만 유지돼요. 새로 발급하면 이 그룹의 이전 링크만 즉시 폐기됩니다. 유효 기간은 24시간이에요.</p></div></dialog>;
}

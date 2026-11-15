import {useState} from 'react';
import {useOptionalWorkspaceGate} from './WorkspaceGate';
import {Icon} from './Icon';
import {GroupEditor} from './GroupEditor';
import './workspace-groups.css';
export function WorkspaceGroupFilter({preview,dialogId,onMembers}:{
 preview:boolean;dialogId:string;onMembers:(groupId:string|null,trigger:HTMLButtonElement)=>void
}){
 const gate=useOptionalWorkspaceGate(),me=gate?.access.identity;const [error,setError]=useState(''),[creating,setCreating]=useState(false);
 if(preview)return <section className="workspace-group-filter" aria-label="그룹 선택">
  <div className="workspace-group-chips" role="group" aria-label="조회할 그룹">
   <button type="button" className="guest-sample-badge" title="샘플 구성원 조회" aria-haspopup="dialog" aria-controls={dialogId}
    onClick={event=>onMembers(null,event.currentTarget)}>샘플 데이터<Icon name="chevron" className="group-members-chevron"/></button>
  </div>
 </section>;
 if(!me||!gate)return null;
 const groups=me.groups||[],selected=me.family?.id??null;
 const choose=async(id:string|null,trigger:HTMLButtonElement)=>{
  if(gate.groupBusy)return;
  setError('');
  try{
   if(id!==selected)await gate.selectGroup(id);
   if(id!==null&&trigger.isConnected)onMembers(id,trigger);
  }catch(e){setError((e as Error).message);}
 };
 return <><section className="workspace-group-filter" aria-label="그룹 선택">{me.role==='PARENT'&&<button type="button" onClick={()=>setCreating(true)} disabled={gate.groupBusy} className="group-add-shortcut" aria-label="새 그룹 만들기" title="새 그룹 만들기"><Icon name="plus"/></button>}<div className="workspace-group-chips" role="group" aria-label="조회할 그룹">
  {me.role==='PARENT'&&<button type="button" aria-pressed={selected===null} disabled={gate.groupBusy} onClick={event=>void choose(null,event.currentTarget)}><Icon name="shield"/>개인</button>}
  {groups.map(group=><button type="button" key={group.id} aria-pressed={selected===group.id} disabled={gate.groupBusy}
   title={group.name+' 구성원 조회'} aria-haspopup="dialog" aria-controls={dialogId} onClick={event=>void choose(group.id,event.currentTarget)}>
   <span className={'group-color group-color-'+group.color}/><span className="workspace-group-name">{group.name}</span><Icon name="chevron" className="group-members-chevron"/>
  </button>)}
 </div>{error&&<p role="alert">{error}</p>}</section>{creating&&<GroupEditor group={null} initialName={groups.length?'새 그룹':'기본그룹'} onClose={()=>setCreating(false)} onSaved={async()=>{await gate.refreshAccess();setCreating(false);}}/>}</>;
}

import {useState,type ReactNode} from 'react';
import {sampleGroup} from '../../../shared/guest-samples';
import {useEntryAccess} from './EntryAccess';
import {useOptionalWorkspaceGate,useWorkspaceGate} from './WorkspaceGate';
import {Icon} from './Icon';
import {GroupEditor} from './GroupEditor';
import './workspace-groups.css';
type GroupFilterProps={dialogId:string;onMembers:(groupId:string|null,trigger:HTMLButtonElement)=>void;trailing?:ReactNode};

function SampleGroupFilter({dialogId,onMembers,trailing}:GroupFilterProps){
 const {sampleGroupSelected,setSampleGroupSelected}=useWorkspaceGate(),{requestLogin}=useEntryAccess();
 return <section className="workspace-group-filter" aria-label="그룹 선택">
  <button type="button" className="group-add-shortcut" aria-label="새 그룹 만들기" title="새 그룹 만들기"
   onClick={()=>requestLogin({title:'그룹을 만들려면 로그인해 주세요'})}><Icon name="plus"/></button>
  <div className="workspace-group-chips" role="group" aria-label="조회할 그룹">
   <button type="button" aria-pressed={!sampleGroupSelected} onClick={()=>setSampleGroupSelected(false)}><Icon name="shield"/>개인</button>
   <button type="button" title="가상 예시 그룹 구성원 조회"
    aria-pressed={sampleGroupSelected} aria-haspopup="dialog" aria-controls={dialogId}
    onClick={event=>{setSampleGroupSelected(true);onMembers(null,event.currentTarget);}}>
    <span className={'group-color group-color-'+sampleGroup.color}/><span className="workspace-group-name">{sampleGroup.name}</span>
    <Icon name="chevron" className="group-members-chevron"/>
   </button>
  </div>
  {trailing}
 </section>;
}

export function WorkspaceGroupFilter({preview,dialogId,onMembers,trailing}:GroupFilterProps&{preview:boolean}){
 const gate=useOptionalWorkspaceGate(),me=gate?.access.identity;
 const [error,setError]=useState(''),[creating,setCreating]=useState(false);
 if(preview)return <SampleGroupFilter dialogId={dialogId} onMembers={onMembers} trailing={trailing}/>;
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
 </div>{trailing}{error&&<p role="alert">{error}</p>}</section>{creating&&<GroupEditor group={null} initialName={groups.length?'새 그룹':'기본그룹'} onClose={()=>setCreating(false)} onSaved={async()=>{await gate.refreshAccess();setCreating(false);}}/>}</>;
}

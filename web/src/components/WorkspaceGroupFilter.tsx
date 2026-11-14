import {useState} from 'react';
import {useOptionalWorkspaceGate} from './WorkspaceGate';
import {Icon} from './Icon';
import {GroupEditor} from './GroupEditor';
import './workspace-groups.css';
export function WorkspaceGroupFilter(){
 const gate=useOptionalWorkspaceGate(),me=gate?.access.identity;const [error,setError]=useState(''),[creating,setCreating]=useState(false);
 if(!me||!gate)return null;
 const groups=me.groups||[],selected=me.family?.id??null;
 const choose=async(id:string|null)=>{if(id===selected)return;setError('');try{await gate.selectGroup(id);}catch(e){setError((e as Error).message);}};
 return <><section className="workspace-group-filter" aria-label="그룹 선택">{me.role==='PARENT'&&<button type="button" onClick={()=>setCreating(true)} disabled={gate.groupBusy} className="group-add-shortcut" aria-label="새 그룹 만들기" title="새 그룹 만들기"><Icon name="plus"/></button>}<div className="workspace-group-chips" role="group" aria-label="조회할 그룹">
  {me.role==='PARENT'&&<button type="button" aria-pressed={selected===null} disabled={gate.groupBusy} onClick={()=>void choose(null)}><Icon name="shield"/>개인</button>}
  {groups.map(group=><button type="button" key={group.id} aria-pressed={selected===group.id} disabled={gate.groupBusy} onClick={()=>void choose(group.id)}><span className={'group-color group-color-'+group.color}/>{group.name}</button>)}
 </div>{error&&<p role="alert">{error}</p>}</section>{creating&&<GroupEditor group={null} initialName={groups.length?'새 그룹':'기본그룹'} onClose={()=>setCreating(false)} onSaved={async()=>{await gate.refreshAccess();setCreating(false);}}/>}</>;
}

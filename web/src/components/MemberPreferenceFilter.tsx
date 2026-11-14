import {useEffect,useRef,useState} from 'react';
import type {WorkspaceMember} from '../../../shared/workspace';
import {MemberFilter} from './MemberFilter';
import {GroupInviteShareButton} from './GroupInviteShare';
import {useOptionalWorkspaceGate} from './WorkspaceGate';

export type MemberPreferenceProps={preview?:boolean;viewerId?:string;defaultMemberIds?:string[];saveDefaultMembers?:(ids:string[])=>Promise<void>};
export function useMemberPreference(members:WorkspaceMember[],{viewerId,defaultMemberIds,saveDefaultMembers}:MemberPreferenceProps){
 const [selected,setSelected]=useState<string[]|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),lock=useRef(false);
 useEffect(()=>{setSelected(null);setError('');setNotice('');},[viewerId]);
 const available=new Set(members.map(m=>m.id)),fallback=available.has(viewerId||'')?viewerId!:members[0]?.id||'';
 const validSaved=(defaultMemberIds||[]).filter(id=>available.has(id)),saved=members.filter(m=>(validSaved.length?validSaved:[fallback]).includes(m.id)).map(m=>m.id);
 const validSelected=selected?.filter(id=>available.has(id)),memberIds=validSelected?.length?validSelected:saved;
 const isSaved=memberIds.length===saved.length&&memberIds.every(id=>saved.includes(id));
 useEffect(()=>{if(selected){const valid=selected.filter(id=>members.some(m=>m.id===id));if(valid.length!==selected.length)setSelected(valid.length?valid:null);}},[members,selected]);
 const toggle=(id:string)=>{if(lock.current)return;setError('');setNotice('');if(memberIds.includes(id)&&memberIds.length===1){setNotice('한 명 이상 선택해 주세요.');return;}setSelected(memberIds.includes(id)?memberIds.filter(value=>value!==id):[...memberIds,id]);};
 const save=async()=>{if(lock.current||!saveDefaultMembers||!memberIds.length||isSaved)return;lock.current=true;setSaving(true);setError('');setNotice('');try{await saveDefaultMembers([...memberIds]);setNotice('첫 화면에 표시할 사람들을 저장했어요.');}catch(e){setError((e as Error).message);}finally{lock.current=false;setSaving(false);}};
 const selectAll=()=>{if(lock.current)return;setError('');setNotice('');setSelected(members.map(m=>m.id));};
 return {memberIds,saved,isSaved,saving,error,notice,toggle,selectAll,save,canSave:!!saveDefaultMembers};
}
export function MemberPreferenceFilter({members,selection,label,className='',preview=false}:{members:WorkspaceMember[];selection:ReturnType<typeof useMemberPreference>;label:string;className?:string;preview?:boolean}){
 const gate=useOptionalWorkspaceGate();
 const {memberIds,isSaved,saving,error,notice,toggle,selectAll,save,canSave}=selection;
 const names=members.filter(m=>memberIds.includes(m.id)).map(m=>m.name);
 const name=names.join(' · ')||'나',summary=names.length>1?`${names[0]} 외 ${names.length-1}명`:name;
 const action=saving?'저장 중':isSaved?'첫 화면으로 설정됨':'첫 화면으로 저장';
 return <section className="member-preference" aria-label={label+' 설정'}>
  <div className="member-preference-row">
   {!preview&&gate?.access.identity?.family&&<GroupInviteShareButton/>}
   <MemberFilter className={className} members={members} value={memberIds} allLabel="전체선택" onSelectAll={selectAll} allSelected={members.length>0&&memberIds.length===members.length} compact disabled={saving} onChange={toggle} label={label}/>
   {preview?<span className="guest-sample-badge" title="가상 예시이며 실제 그룹 자료가 아닙니다">샘플 데이터</span>:<div className="timetable-preference"><button type="button" className="button compact" title={name+' · '+action} aria-label={name+' · '+action} aria-busy={saving} data-saved={isSaved} disabled={saving||isSaved||!canSave} onClick={()=>void save()}><strong className="preference-member-names">{summary}</strong><span className="preference-action-short" aria-hidden="true">{saving?'저장 중':isSaved?'설정됨':'저장'}</span></button></div>}
  </div>
  {error&&<p className="timetable-preference-message error" role="alert">{error}</p>}{notice&&<p className="timetable-preference-message" role="status">{notice}</p>}
 </section>;
}

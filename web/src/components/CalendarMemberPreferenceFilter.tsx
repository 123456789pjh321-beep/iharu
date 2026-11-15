import type {WorkspaceMember} from '../../../shared/workspace';
import type {useMemberPreference} from './MemberPreferenceFilter';
import {MemberFilter} from './MemberFilter';
import {WorkspaceTopBarSlot} from './WorkspaceTopBar';

type MemberSelection=Pick<ReturnType<typeof useMemberPreference>,'memberIds'|'toggle'|'selectAll'>&Partial<ReturnType<typeof useMemberPreference>>;
export function CalendarMemberPreferenceFilter({members,selection,label,className='',preview=false}:{members:WorkspaceMember[];selection:MemberSelection;label:string;className?:string;preview?:boolean}){
 const {memberIds,isSaved=false,saving=false,error='',notice='',toggle,selectAll,save,canSave=false}=selection;
 const names=members.filter(m=>memberIds.includes(m.id)).map(m=>m.name);
 const name=names.join(' · ')||'나';
 const action=saving?'저장 중':isSaved?'첫 화면으로 설정됨':'첫 화면으로 저장';
 return <WorkspaceTopBarSlot slot="members">
   <MemberFilter className={className} members={members} value={memberIds} allLabel="전체선택" onSelectAll={selectAll} allSelected={members.length>0&&memberIds.length===members.length} wrap disabled={saving} onChange={toggle} label={label+' 전체 구성원'}/>
   <p className="preference-selected-names">{name}</p>
   {!preview&&save&&<div className="preference-save-row timetable-preference"><button type="button" className="button" title={name+' · '+action} aria-label={name+' · '+action} aria-busy={saving} disabled={saving||isSaved||!canSave} onClick={()=>void save()}>{saving?'저장 중':isSaved?'기본 필터로 설정됨':'기본 필터로 저장'}</button></div>}
   {error&&<p className="timetable-preference-message error" role="alert">{error}</p>}{notice&&<p className="timetable-preference-message" role="status">{notice}</p>}
 </WorkspaceTopBarSlot>;
}

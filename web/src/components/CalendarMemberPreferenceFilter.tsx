import {useId,useRef,useState} from 'react';
import type {WorkspaceMember} from '../../../shared/workspace';
import type {useMemberPreference} from './MemberPreferenceFilter';
import {MemberFilter} from './MemberFilter';
import {Icon} from './Icon';

export function CalendarMemberPreferenceFilter({members,selection,label,className='',preview=false}:{members:WorkspaceMember[];selection:ReturnType<typeof useMemberPreference>;label:string;className?:string;preview?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
 const [open,setOpen]=useState(false);
 const {memberIds,isSaved,saving,error,notice,toggle,selectAll,save,canSave}=selection;
 const names=members.filter(m=>memberIds.includes(m.id)).map(m=>m.name);
 const name=names.join(' · ')||'나';
 const action=saving?'저장 중':isSaved?'첫 화면으로 설정됨':'첫 화면으로 저장';
 const dismiss=()=>{dialog.current?.close();setOpen(false);trigger.current?.focus({preventScroll:true});};
 return <section className="member-preference" aria-label={label+' 설정'}>
  <div className="member-preference-row">
   <MemberFilter className={className} members={members} value={memberIds} showAll={false} expandable={false} disabled={saving} onChange={toggle} label={label}/>
   {preview&&<span className="guest-sample-badge" title="가상 예시이며 실제 그룹 자료가 아닙니다">샘플 데이터</span>}
   <button ref={trigger} type="button" className="member-preference-options icon-button" aria-label={`구성원 필터 설정 · ${names.length}명 선택됨`} title="구성원 필터 설정" aria-haspopup="dialog" aria-controls={id} onClick={()=>{dialog.current?.showModal();setOpen(true);}}><span aria-hidden="true"><Icon name="chevron"/><Icon name="chevron"/></span></button>
  </div>
  <dialog ref={dialog} id={id} className="member-filter-dialog preference-dialog" aria-labelledby={id+'-title'} onCancel={e=>{e.preventDefault();dismiss();}} onClick={e=>{if(e.target===e.currentTarget)dismiss();}}>
   <header><h2 id={id+'-title'}>조회할 구성원</h2><button type="button" className="icon-button" aria-label="구성원 필터 닫기" onClick={dismiss}><Icon name="close"/></button></header>
   <p>함께 보고 싶은 사람을 선택하세요.</p>
   <MemberFilter members={members} value={memberIds} allLabel="전체선택" onSelectAll={selectAll} allSelected={members.length>0&&memberIds.length===members.length} wrap disabled={saving} onChange={toggle} label={label+' 전체 구성원'}/>
   <p className="preference-selected-names">{name}</p>
   {!preview&&<div className="preference-save-row timetable-preference"><button type="button" className="button" title={name+' · '+action} aria-label={name+' · '+action} aria-busy={saving} disabled={saving||isSaved||!canSave} onClick={()=>void save()}>{saving?'저장 중':isSaved?'기본 필터로 설정됨':'기본 필터로 저장'}</button></div>}
   {error&&<p className="timetable-preference-message error" role="alert">{error}</p>}{notice&&<p className="timetable-preference-message" role="status">{notice}</p>}
   <footer><button type="button" className="button primary" onClick={dismiss}>선택 완료</button></footer>
  </dialog>
  {!open&&error&&<p className="timetable-preference-message error" role="alert">{error}</p>}{!open&&notice&&<p className="timetable-preference-message" role="status">{notice}</p>}
 </section>;
}

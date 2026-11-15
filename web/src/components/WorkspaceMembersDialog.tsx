import {useLayoutEffect,useRef,type ReactNode} from 'react';
import type {WorkspaceMember} from '../../../shared/workspace';
import {GroupInviteShareSection} from './GroupInviteShare';
import {Icon} from './Icon';

export function WorkspaceMembersDialog({id,groupName,members,trigger,onDismiss,children}:{
 id:string;groupName:string;members?:WorkspaceMember[];trigger:HTMLButtonElement;onDismiss:()=>void;children?:ReactNode
}){
 const dialog=useRef<HTMLDialogElement>(null);
 useLayoutEffect(()=>{
  const node=dialog.current;
  node?.showModal();
  return ()=>node?.close();
 },[]);

 function dismiss(){
  dialog.current?.close();
  onDismiss();
  trigger.focus({preventScroll:true});
 }

 return <dialog ref={dialog} id={id} className="member-filter-dialog preference-dialog workspace-members-dialog"
  aria-labelledby={id+'-title'} onCancel={event=>{event.preventDefault();dismiss();}}
  onClick={event=>{if(event.target===event.currentTarget)dismiss();}}>
  <header>
   <h2 id={id+'-title'}>{children?'조회할 구성원':'그룹 구성원'}</h2>
   <button type="button" className="icon-button" aria-label="구성원 팝업 닫기" onClick={dismiss}><Icon name="close"/></button>
  </header>
  <p className="workspace-members-group">{groupName}</p>
  {children||<ul className="workspace-members-roster" aria-label="그룹 구성원 목록">
   {members?.map(member=><li key={member.id}>{member.name}</li>)}
  </ul>}
  <GroupInviteShareSection/>
  <footer><button type="button" className="button primary" onClick={dismiss}>{children?'선택 완료':'완료'}</button></footer>
 </dialog>;
}

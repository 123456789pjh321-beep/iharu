import type {WorkspaceMember} from '../../../shared/workspace';
import {Icon} from './Icon';

/** Native radios keep single selection, form submission and arrow-key navigation together. */
export function ScheduleMemberPicker({members,myId,selectedId,allowAll=true}:{members:WorkspaceMember[];myId:string;selectedId?:string;allowAll?:boolean}){
 const choices=[...(allowAll?[{id:'ALL',name:'전체'}]:[]),...members.map(member=>({id:member.id,name:member.name+(member.id===myId?' · 나':'')+(member.kind==='CHILD'?' · 자녀':'')}))];
 return <div className="form-field schedule-member-field"><span id="schedule-member-label">가족 구성원</span>
  <div className="schedule-member-options" role="radiogroup" aria-labelledby="schedule-member-label">
   {choices.map(choice=><label key={choice.id} className="schedule-member-choice"><input type="radio" name="assigneeId" value={choice.id} defaultChecked={choice.id===selectedId} required/><span><Icon name="check"/>{choice.name}</span></label>)}
  </div>
 </div>;
}

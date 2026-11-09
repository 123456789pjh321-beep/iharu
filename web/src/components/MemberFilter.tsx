import {useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import type {WorkspaceMember} from '../../../shared/workspace';
import {Icon} from './Icon';
import {calendarColors} from './scheduleColors';

export function MemberFilter({members,value,onChange,label,className='',showAll=true,disabled=false,wrap=false,expandable=true}:{members:WorkspaceMember[];value:string|readonly string[];onChange:(id:string)=>void;label:string;className?:string;showAll?:boolean;disabled?:boolean;wrap?:boolean;expandable?:boolean}){
 const isSelected=(memberId:string)=>typeof value==='string'?value===memberId:value.includes(memberId);
 const [expanded,setExpanded]=useState(false),id=useId(),list=useRef<HTMLDivElement>(null),lastClicked=useRef<HTMLButtonElement|null>(null);
 const selectionKey=typeof value==='string'?value:[...value].sort().join(',');
 useLayoutEffect(()=>{
  if(wrap||expanded||!list.current)return;
  const node=list.current;
  const reveal=()=>{
   const selected=lastClicked.current&&node.contains(lastClicked.current)?lastClicked.current:node.querySelector<HTMLElement>('[aria-pressed="true"]');if(!selected)return;
   const box=node.getBoundingClientRect(),item=selected.getBoundingClientRect();
   if(item.left<box.left)node.scrollLeft+=item.left-box.left-2;
   else if(item.right>box.right)node.scrollLeft+=item.right-box.right+2;
  };
  reveal();const observer=new ResizeObserver(reveal);observer.observe(node);
  return()=>observer.disconnect();
 },[wrap,expanded,selectionKey]);
 return <div className={'member-filter-bar '+className+(wrap?' wrapped':expanded?' expanded':'')}>
  <div ref={list} id={id} className="member-filters" role="group" aria-label={label}>
   {showAll&&<button type="button" disabled={disabled} aria-pressed={value==='all'} onClick={()=>onChange('all')}><span className="member-filter-marker all" aria-hidden="true"><Icon name={value==='all'?'check':'users'}/></span>전체 보기</button>}
   {members.map((member,index)=><button type="button" disabled={disabled} key={member.id} aria-pressed={isSelected(member.id)} onClick={event=>{lastClicked.current=event.currentTarget;onChange(member.id);}} style={{'--member-color':calendarColors[index%calendarColors.length]} as CSSProperties}><span className="member-filter-marker" aria-hidden="true">{isSelected(member.id)&&<Icon name="check"/>}</span><span className="member-filter-name">{member.name}</span></button>)}
  </div>
  {!wrap&&expandable&&members.length>2&&<button type="button" className="member-filter-expand" aria-label={label+(expanded?' 접기':' 펼치기')} aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(open=>!open)}><Icon name="chevron"/></button>}
 </div>;
}

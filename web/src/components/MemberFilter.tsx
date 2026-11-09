import {useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import type {WorkspaceMember} from '../../../shared/workspace';
import {Icon} from './Icon';
import {calendarColors} from './scheduleColors';

export function MemberFilter({members,value,onChange,label,className='',showAll=true,disabled=false,wrap=false,expandable=true,compact=false}:{members:WorkspaceMember[];value:string|readonly string[];onChange:(id:string)=>void;label:string;className?:string;showAll?:boolean;disabled?:boolean;wrap?:boolean;expandable?:boolean;compact?:boolean}){
 const isSelected=(memberId:string)=>typeof value==='string'?value===memberId:value.includes(memberId);
 const [expanded,setExpanded]=useState(false),id=useId(),list=useRef<HTMLDivElement>(null),lastClicked=useRef<HTMLButtonElement|null>(null);
 const [visibleCount,setVisibleCount]=useState(0),dialog=useRef<HTMLDialogElement>(null),more=useRef<HTMLButtonElement>(null);
 const selectionKey=typeof value==='string'?value:[...value].sort().join(',');
 useLayoutEffect(()=>{
  if(compact||wrap||expanded||!list.current)return;
  const node=list.current;
  const reveal=()=>{
   const selected=lastClicked.current&&node.contains(lastClicked.current)?lastClicked.current:node.querySelector<HTMLElement>('[aria-pressed="true"]');if(!selected)return;
   const box=node.getBoundingClientRect(),item=selected.getBoundingClientRect();
   if(item.left<box.left)node.scrollLeft+=item.left-box.left-2;
   else if(item.right>box.right)node.scrollLeft+=item.right-box.right+2;
  };
  reveal();const observer=new ResizeObserver(reveal);observer.observe(node);
  return()=>observer.disconnect();
 },[compact,wrap,expanded,selectionKey]);
 useLayoutEffect(()=>{
  if(!compact||!list.current)return;
  const node=list.current,measure=()=>{
   const style=getComputedStyle(node),chip=parseFloat(style.getPropertyValue('--member-chip-width')),overflow=parseFloat(style.getPropertyValue('--member-overflow-width')),gap=parseFloat(style.columnGap)||0,width=node.clientWidth;
   if(!chip||!overflow)return;
   const count=members.length*chip+Math.max(0,members.length-1)*gap<=width?members.length:Math.max(0,Math.floor((width-overflow)/(chip+gap)));
   setVisibleCount(Math.min(members.length,count));
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
 },[compact,members.length]);
 const visible=compact?members.slice(0,visibleCount):members,remaining=members.length-visible.length,hiddenSelected=members.slice(visible.length).filter(m=>isSelected(m.id)).length;
 function close(){dialog.current?.close();(more.current||list.current?.querySelector<HTMLButtonElement>('button'))?.focus({preventScroll:true});}
 return <div className={'member-filter-bar '+className+(compact?' compact-members':wrap?' wrapped':expanded?' expanded':'')}>
  <div ref={list} id={id} className="member-filters" role="group" aria-label={label}>
   {showAll&&<button type="button" disabled={disabled} aria-pressed={value==='all'} onClick={()=>onChange('all')}><span className="member-filter-marker all" aria-hidden="true"><Icon name={value==='all'?'check':'users'}/></span>전체 보기</button>}
   {visible.map((member,index)=><button type="button" disabled={disabled} key={member.id} title={member.name} aria-pressed={isSelected(member.id)} onClick={event=>{lastClicked.current=event.currentTarget;onChange(member.id);}} style={{'--member-color':calendarColors[index%calendarColors.length]} as CSSProperties}><span className="member-filter-marker" aria-hidden="true">{isSelected(member.id)&&<Icon name="check"/>}</span><span className="member-filter-name">{member.name}</span></button>)}
   {compact&&remaining>0&&<button ref={more} type="button" className="member-filter-more" disabled={disabled} aria-haspopup="dialog" aria-controls={id+'-dialog'} aria-label={`가족 선택 · 추가 ${remaining}명${hiddenSelected?`, ${hiddenSelected}명 선택됨`:''}`} data-selected={hiddenSelected>0||undefined} onClick={()=>dialog.current?.showModal()}>+{remaining}명</button>}
  </div>
  {compact&&<dialog ref={dialog} id={id+'-dialog'} className="member-filter-dialog" aria-labelledby={id+'-title'} onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
   <header><h2 id={id+'-title'}>조회할 가족 선택</h2><button type="button" className="icon-button" aria-label="가족 선택 닫기" onClick={close}><Icon name="close"/></button></header>
   <p>한 명 이상 선택해 주세요. 첫 화면으로 유지하려면 선택 후 저장해 주세요.</p>
   <MemberFilter members={members} value={value} onChange={onChange} label={label+' 전체 구성원'} showAll={false} wrap disabled={disabled}/>
   <footer><button type="button" className="button primary" onClick={close}>선택 완료</button></footer>
  </dialog>}
  {!compact&&!wrap&&expandable&&members.length>2&&<button type="button" className="member-filter-expand" aria-label={label+(expanded?' 접기':' 펼치기')} aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(open=>!open)}><Icon name="chevron"/></button>}
 </div>;
}

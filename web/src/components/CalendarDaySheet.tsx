import {useEffect,useRef,type CSSProperties} from 'react';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {scheduleAssignee} from '../../../shared/workspace-schedules';
import {eventColor} from './scheduleColors';
import {Icon} from './Icon';
export function CalendarDaySheet({date,holiday,items,members,loading,close,create,edit}:{date:string;holiday:string;items:WorkspaceItem[];members:WorkspaceMember[];loading:boolean;close:()=>void;create:()=>void;edit:(item:WorkspaceItem)=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=ref.current,previous=document.activeElement as HTMLElement|null;node?.showModal();return()=>{node?.close();previous?.focus({preventScroll:true});};},[]);
 const label=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Seoul'}).format(new Date(date+'T12:00:00+09:00'));
 return <dialog ref={ref} className="calendar-day-sheet" aria-labelledby="calendar-day-title" onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}>
  <header><div><h2 id="calendar-day-title">{label}</h2>{holiday&&<p className="holiday-label">{holiday}</p>}</div><button type="button" className="icon-button" aria-label="날짜 일정 닫기" onClick={close}><Icon name="close"/></button></header>
  <div className="calendar-day-sheet-body" aria-busy={loading}>{loading?<p className="day-sheet-empty">일정을 불러오고 있어요</p>:items.length?items.map(item=><button type="button" key={item.id} className="day-sheet-event" style={{'--event-color':eventColor(item,members)} as CSSProperties} onClick={()=>edit(item)}><span>{item.data.allDay?'종일':`${item.data.startTime}–${item.data.endTime}`}</span><div><strong>{item.data.title}</strong><small>{scheduleAssignee(item,members)}{item.data.place?' · '+item.data.place:''}</small></div><Icon name="chevron"/></button>):<p className="day-sheet-empty">등록된 일정이 없어요</p>}</div>
  <footer><button type="button" className="button primary" onClick={create}><Icon name="plus"/>이 날짜에 일정 추가</button></footer>
 </dialog>;
}

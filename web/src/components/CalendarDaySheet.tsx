import type {CSSProperties} from 'react';
import {PlusButton} from './PlusButton';
import {useSlidingDialog} from './useSlidingDialog';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {scheduleAssignee,scheduleTimeCaption} from '../../../shared/workspace-schedules';
import {eventColor} from './scheduleColors';
import {Icon} from './Icon';
export function CalendarDaySheet({date,holiday,items,members,loading,close,create,edit}:{date:string;holiday:string;items:WorkspaceItem[];members:WorkspaceMember[];loading:boolean;close:()=>void;create:()=>void;edit:(item:WorkspaceItem)=>void}){
 const {ref,closing,closeWithAnimation}=useSlidingDialog();
 const dismiss=()=>{void closeWithAnimation(close);};
 const label=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Seoul'}).format(new Date(date+'T12:00:00+09:00'));
 return <dialog ref={ref} className="calendar-day-sheet" data-closing={closing||undefined} aria-labelledby="calendar-day-title" onCancel={e=>{e.preventDefault();dismiss();}} onClick={e=>{if(e.target===e.currentTarget)dismiss();}}>
  <header><div><h2 id="calendar-day-title">{label}</h2>{holiday&&<p className="holiday-label">{holiday}</p>}</div><button type="button" className="icon-button" aria-label="날짜 일정 닫기" onClick={dismiss} disabled={closing}><Icon name="close"/></button></header>
  <div className="calendar-day-sheet-body" aria-busy={loading}>{loading?<p className="day-sheet-empty">일정을 불러오고 있어요</p>:items.length?items.map(item=><button type="button" key={item.id} className="day-sheet-event" style={{'--event-color':eventColor(item,members)} as CSSProperties} disabled={closing} onClick={()=>void closeWithAnimation(()=>edit(item))}><span>{scheduleTimeCaption(item,date)}</span><div><strong>{item.data.title}</strong><small>{scheduleAssignee(item,members)}{item.data.place?' · '+item.data.place:''}</small></div><Icon name="chevron"/></button>):<p className="day-sheet-empty">등록된 일정이 없어요</p>}</div>
  <footer><PlusButton label="이 날짜에 일정 추가" disabled={closing} onClick={()=>void closeWithAnimation(create)}/></footer>
 </dialog>;
}

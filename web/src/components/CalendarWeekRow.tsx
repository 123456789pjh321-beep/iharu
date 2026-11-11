import type {CSSProperties,MouseEvent} from 'react';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import type {calendarWeekLayout,CalendarRun} from '../../../shared/calendar-layout';
import {scheduleAssignee,scheduleTimeCaption} from '../../../shared/workspace-schedules';
import {eventColor} from './scheduleColors';
import {lunarDateCaption} from '../../../shared/lunar-calendar';
import {calendarDayBadge} from '../../../shared/calendar-day-badge';

export function CalendarWeekRow({dates,layout,members,month,day,today,holidayName,openDay,edit}:{dates:string[];layout:ReturnType<typeof calendarWeekLayout>;members:WorkspaceMember[];month:string;day:string;today:string;holidayName:(date:string)=>string;openDay:(date:string)=>void;edit:(item:WorkspaceItem,date:string)=>void}){
 const {runs,hidden,rows}=layout,hasHoliday=dates.some(date=>holidayName(date)),hasBadge=dates.some(date=>calendarDayBadge(date,holidayName(date)));
 function openRun(event:MouseEvent<HTMLButtonElement>,run:CalendarRun){
  const bounds=event.currentTarget.getBoundingClientRect();
  const index=event.detail===0?Math.max(0,run.days.findIndex(d=>d.date===day)):Math.min(run.days.length-1,Math.max(0,Math.floor((event.clientX-bounds.left)/bounds.width*run.days.length)));
  const occurrence=run.days[index];
  if(occurrence.items.length===1)edit(occurrence.items[0],occurrence.date);else openDay(occurrence.date);
 }
 return <div className={'calendar-week-row'+(hasHoliday?' has-holiday':'')+(hasBadge?' has-day-badge':'')} data-week-start={dates[0]} style={{'--calendar-event-rows':rows} as CSSProperties}>
  {dates.map((date,index)=>{const holiday=holidayName(date),badge=calendarDayBadge(date,holiday),dow=new Date(date+'T12:00:00Z').getUTCDay();return <div key={date} className={'calendar-cell '+(holiday||dow===0?'holiday-date ':dow===6?'saturday-date ':'')+(date.slice(0,7)!==month?'outside ':'')+(date===day?'selected ':'')+(date===today?'is-today':'')} data-date={date}>
   <button type="button" className="calendar-day-target" aria-label={`${date}${holiday?' '+holiday:''} 일정 보기`} aria-current={date===today?'date':undefined} aria-pressed={day===date} onClick={()=>openDay(date)}><span>{Number(date.slice(8))}</span></button>
   <small className="calendar-lunar" aria-hidden="true">{lunarDateCaption(date)}</small>
   {badge&&<span className={'calendar-day-badge '+(badge.tone==='holiday'?'calendar-holiday':'calendar-observance')} title={badge.sourceLabel}>{badge.label}</span>}
   {hidden[index]>0&&<button type="button" className="calendar-overflow" aria-label={`${date} 일정 ${hidden[index]}개 더 보기`} onClick={()=>openDay(date)}>+{hidden[index]}개</button>}
  </div>;})}
  <div className="calendar-week-events">
   {runs.map(run=>{const item=run.days[0].items[0],range=run.days.length>1?`${run.days[0].date} ~ ${run.days.at(-1)!.date}`:run.days[0].date,duplicates=Math.max(...run.days.map(d=>d.items.length)),label=`${item.data.title} · ${scheduleTimeCaption(item,run.days[0].date)} · ${scheduleAssignee(item,members)} · ${range}${duplicates>1?' · 개별 일정 보기':item.mine?' · 수정':' · 상세'}`;return <button key={run.key} type="button" className="calendar-event" data-all-day={item.data.allDay||undefined} data-dates={run.days.map(d=>d.date).join(' ')} data-span={run.days.length} data-continues-before={run.continuesBefore||undefined} data-continues-after={run.continuesAfter||undefined} title={label} style={{gridColumn:`${run.start+1} / ${run.end+2}`,gridRow:run.lane+1,'--event-color':eventColor(item,members)} as CSSProperties} aria-label={label} onClick={event=>openRun(event,run)}><span className="event-time">{item.data.allDay?'종일':item.data.startTime}</span><strong>{item.data.allMembers&&<span className="calendar-all-members">전체 · </span>}{item.data.title}</strong>{duplicates>1&&<small className="calendar-duplicate-count">{duplicates}건</small>}</button>;})}
  </div>
 </div>;
}

import type {CSSProperties,ReactNode} from 'react';
import {addDays} from '../../../shared/schedules';
import {lunarDateCaption} from '../../../shared/lunar-calendar';
import {calendarDayBadge} from '../../../shared/calendar-day-badge';

const weekdays=['일','월','화','수','목','금','토'];

export function monthWeeks(month:string){
 const first=month+'-01';
 const date=new Date(first+'T12:00:00Z');
 const offset=date.getUTCDay();
 date.setUTCMonth(date.getUTCMonth()+1,0);
 const count=Math.ceil((offset+date.getUTCDate())/7);
 return Array.from({length:count},(_,week)=>
  Array.from({length:7},(_,day)=>addDays(first,week*7+day-offset)));
}

export function CalendarGrid({label,weekCount,rowMinimum=68,weekly=false,children}:{
 label?:string;weekCount:number;rowMinimum?:number;weekly?:boolean;children:ReactNode;
}){
 return <section className="calendar-month-content" aria-label={label}>
  <div className="calendar-weekdays">{weekdays.map(day=><span key={day}>{day}</span>)}</div>
  <div className={'calendar-grid'+(weekly?' week-view':'')} style={{gridTemplateRows:`repeat(${weekCount},minmax(${rowMinimum}px,1fr))`}}>
   {children}
  </div>
 </section>;
}

export function CalendarWeek({dates,month,selectedDate,today,holidayName,openDay,dayDetails,dateWeather,eventRows=0,children}:{
 dates:string[];month:string;selectedDate:string|null;today:string;holidayName:(date:string)=>string;
 openDay:(date:string)=>void;dayDetails:(date:string,holiday:string,index:number)=>{label:string;disabled?:boolean;content?:ReactNode};
 dateWeather?:(date:string)=>ReactNode;eventRows?:number;children?:ReactNode;
}){
 const cells=dates.map(date=>{
  const holiday=holidayName(date);
  return {date,holiday,badge:calendarDayBadge(date,holiday)};
 });
 const hasHoliday=cells.some(cell=>cell.holiday),hasBadge=cells.some(cell=>cell.badge);
 return <div className={'calendar-week-row'+(hasHoliday?' has-holiday':'')+(hasBadge?' has-day-badge':'')+(dateWeather?' has-weather':'')}
  data-week-start={dates[0]} style={{'--calendar-event-rows':eventRows} as CSSProperties}>
  {cells.map(({date,holiday,badge},index)=>{
   const weekday=new Date(date+'T12:00:00Z').getUTCDay();
   const classes=['calendar-cell'];
   if(holiday||weekday===0)classes.push('holiday-date');
   else if(weekday===6)classes.push('saturday-date');
   if(date.slice(0,7)!==month)classes.push('outside');
   if(date===selectedDate)classes.push('selected');
   if(date===today)classes.push('is-today');
   const {label,disabled,content}=dayDetails(date,holiday,index);
   return <div key={date} className={classes.join(' ')} data-date={date}>
    <div className="calendar-date-control">
     <button type="button" className="calendar-day-target" aria-label={label} disabled={disabled}
      aria-current={date===today?'date':undefined} aria-pressed={date===selectedDate} onClick={()=>openDay(date)}>
      <span>{Number(date.slice(8))}</span>
     </button>
    </div>
    <small className="calendar-lunar" aria-hidden="true">{lunarDateCaption(date)}</small>
    {badge&&<span className={'calendar-day-badge '+(badge.tone==='holiday'?'calendar-holiday':'calendar-observance')}
     title={badge.sourceLabel}>{badge.label}</span>}
    {dateWeather?.(date)}
    {content}
   </div>;
  })}
  {children}
 </div>;
}

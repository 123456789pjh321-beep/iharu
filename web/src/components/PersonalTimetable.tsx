import {timetableRuns} from '../../../shared/timetable-runs';
import {useHolidays} from './useHolidays';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {addDays,koreaToday} from '../../../shared/schedules';
import {dailySchedules,scheduleAssignee,schedulePhase,timetableLayout,timeLabel,timeMinutes} from '../../../shared/workspace-schedules';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {eventColor} from './scheduleColors';
import {Icon} from './Icon';
import {MemberFilter} from './MemberFilter';
import {DateNavigator,WorkspaceToolbar} from './WorkspaceToolbar';
import {useCalendarSlide} from './useCalendarSlide';
import {useDaySwipe} from './useDaySwipe';

const weekday=['일','월','화','수','목','금','토'];
const minuteHeight=.8;
const hourLabel=(hour:number)=>`${hour<12||hour===24?'오전':'오후'} ${hour%12||12}`;
const koreaTime=()=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
export function PersonalTimetable({day,items,members,loading,embedded=false,setDay,create,edit}:{day:string;items:WorkspaceItem[];members:WorkspaceMember[];loading:boolean;embedded?:boolean;setDay:(date:string)=>void;create:(date:string,time?:string)=>void;edit:(item:WorkspaceItem)=>void}){
 const holidays=useHolidays(day.slice(0,7));
 const [member,setMember]=useState('all'),[now,setNow]=useState(koreaTime),[slot,setSlot]=useState(36),page=useRef<HTMLDivElement>(null),scroller=useRef<HTMLDivElement>(null),scrolledDay=useRef(''),week=useRef<HTMLDivElement>(null);
 useEffect(()=>{const update=()=>setNow(koreaTime()),timer=setInterval(update,30000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[]);
 useEffect(()=>{if(member!=='all'&&!members.some(m=>m.id===member))setMember('all');},[members,member]);
 useCalendarSlide(page,day,'day');
 const moveDay=(delta:number)=>setDay(addDays(day,delta));
 const daySwipe=useDaySwipe(page,moveDay),weekSwipe=useDaySwipe(week,moveDay,target=>{
  const button=target instanceof Element?target.closest<HTMLButtonElement>('button[data-timetable-date]'):null;
  if(!button||!week.current?.contains(button))return false;
  setDay(button.dataset.timetableDate!);return true;
 });
 const today=koreaToday(),dates=Array.from({length:embedded?1:3},(_,n)=>addDays(day,n));
 const lanes=dates.map(date=>{const events=dailySchedules(items,date,member);return {date,events,allDay:events.filter(i=>i.data.allDay),layout:timetableLayout(events)};});
 const joined=timetableRuns(lanes),joinedKeys=new Set(joined.flatMap(run=>run.days.map(({date,item})=>date+':'+item.id)));
 const events=lanes.flatMap(lane=>lane.events),showToday=dates.includes(today),currentEvents=dailySchedules(items,today,member).filter(i=>!i.data.allDay&&schedulePhase(i,today,today,now)==='current');
 const firstStart=Math.min(...lanes.flatMap(lane=>lane.layout.map(event=>event.start)),1440);
 const startMinute=firstStart<1440?Math.max(0,firstStart-60):540,firstSlot=Math.floor(startMinute/15),activeSlot=Math.max(firstSlot,slot);
 const ticks=[startMinute,...Array.from({length:24-Math.floor(startMinute/60)},(_,n)=>(Math.floor(startMinute/60)+n+1)*60)];
 const scrollToNow=()=>{const node=scroller.current;if(node)node.scrollTop=Math.max(0,(timeMinutes(koreaTime())-startMinute)*minuteHeight-node.clientHeight*.3);};
 useLayoutEffect(()=>{
  const key=day+':'+member+':'+startMinute;
  if(loading||scrolledDay.current===key||!scroller.current)return;
  scrolledDay.current=key;
  const target=showToday?timeMinutes(now):startMinute;
  scroller.current.scrollTop=Math.max(0,(target-startMinute)*minuteHeight-scroller.current.clientHeight*.3);
 },[day,member,loading,startMinute,now,showToday]);
 const content=(item:WorkspaceItem)=><><strong className="timetable-title">{item.data.title}</strong><span className="timetable-range">{item.data.allDay?'종일':`${item.data.startTime} – ${item.data.endTime}`}</span></>;
 const label=(item:WorkspaceItem)=>`${item.data.title} · ${scheduleAssignee(item,members)} · ${item.data.allDay?'종일':item.data.startTime+' – '+item.data.endTime} · ${item.mine?'수정':'상세'}`;
 return <section className={'personal-timetable'+(embedded?' calendar-daily':' timetable-three-day')} aria-label={embedded?'일간 일정':'3일 시간표'}>
  {!embedded&&<><WorkspaceToolbar title="시간표" navigation={<DateNavigator type="date" value={day} inputLabel="시간표 날짜 선택" onChange={setDay}/>}/>
  <MemberFilter className="timetable-filters" members={members} value={member} onChange={setMember} label="시간표 구성원 필터"/></>}
  <div className="timetable-summary"><span>{loading?'불러오는 중':`${embedded?'':'3일 · '}${events.length}개 일정`}{showToday&&<button type="button" className="timetable-now-jump" onClick={scrollToNow} aria-label="현재 시간으로 이동"><Icon name="clock"/>현재 {now}</button>}</span>
   {showToday&&!loading&&<div className={'timetable-current-summary'+(currentEvents.length?'':' empty')} aria-label="현재 진행 중인 일정"><strong>지금</strong><span>{currentEvents.length?currentEvents.map(i=>`${scheduleAssignee(i,members)} · ${i.data.title}`).join(' / '):'등록된 일정이 없는 시간이에요'}</span></div>}
  </div>
  {!embedded&&<><div className="timetable-weekdays" aria-hidden="true">{dates.map(date=>{const dow=new Date(date+'T12:00:00Z').getUTCDay();return <span key={date} className={holidays.name(date)||dow===0?'holiday-date':dow===6?'saturday-date':''}>{weekday[dow]}</span>;})}</div><div ref={week} className="timetable-week" aria-label="날짜 선택" {...weekSwipe}>{dates.map(date=>{const dow=new Date(date+'T12:00:00Z').getUTCDay(),holiday=holidays.name(date);return <button type="button" key={date} data-timetable-date={date} aria-label={`${date} 시간표${holiday?' · '+holiday:''}`} aria-pressed={date===day} className={(date===today?'is-today ':'')+(holiday||dow===0?'holiday-date':dow===6?'saturday-date':'')} onClick={()=>setDay(date)}><strong>{Number(date.slice(8))}</strong>{holiday&&<small className="calendar-holiday" title={holiday}>{holiday}</small>}</button>;})}</div></>}
  {holidays.name(day)&&<p className={'timetable-holiday holiday-label'+(embedded?'':' sr-only')}>{holidays.name(day)}</p>}
  <div className="calendar-viewport timetable-viewport"><div ref={page} className="timetable-day" aria-busy={loading} {...daySwipe}>
   {lanes.some(lane=>lane.allDay.length>0)&&<div className="timetable-all-day"><span>종일</span><div className="timetable-all-day-columns" style={{gridTemplateColumns:`repeat(${dates.length},minmax(0,1fr))`}}>{lanes.map(lane=><div key={lane.date}>{lane.allDay.map(item=><button type="button" key={item.id} className="timetable-card timetable-all-day-card" style={{'--event-color':eventColor(item,members)} as CSSProperties} onClick={()=>edit(item)} aria-label={label(item)} title={label(item)} data-timetable-item={item.id}>{content(item)}</button>)}</div>)}</div></div>}
   <div className="timetable-scroll" ref={scroller} data-calendar-scroll aria-label="하루 시간 눈금">
    <div className="timetable-grid" data-start-minute={startMinute} style={{height:(1440-startMinute)*minuteHeight,'--timetable-line-offset':`${(60-startMinute%60)%60*minuteHeight}px`} as CSSProperties}>
     <div className="timetable-time-axis" aria-hidden="true">{ticks.map(minute=><span key={minute} className={showToday&&Math.floor(timeMinutes(now)/60)===Math.floor(minute/60)?'current-hour':''} style={{top:(minute-startMinute)*minuteHeight}}>{minute%60?timeLabel(minute):hourLabel(Math.floor(minute/60))}</span>)}</div>
     <div className="timetable-event-area" style={{gridTemplateColumns:`repeat(${dates.length},minmax(0,1fr))`}}>
      {lanes.map(({date,layout})=><div key={date} className={'timetable-day-column'+(date===today?' today-column':'')} data-date={date}>
       <div className="timetable-slots" role="group" aria-label={`${date} 15분 단위 일정 등록`}>{Array.from({length:96-firstSlot},(_,offset)=>{
        const index=firstSlot+offset,minute=Math.max(startMinute,index*15),time=timeLabel(minute);
        return <button type="button" key={time} data-slot={index} data-time={time} tabIndex={date===day&&activeSlot===index?0:-1} className="timetable-slot" aria-label={`${date} ${time} 일정 등록`} style={{top:(minute-startMinute)*minuteHeight,height:((index+1)*15-minute)*minuteHeight}} onFocus={()=>setSlot(index)} onClick={()=>create(date,time)} onKeyDown={e=>{
         const target=e.key==='ArrowDown'?Math.min(95,index+1):e.key==='ArrowUp'?Math.max(firstSlot,index-1):e.key==='Home'?firstSlot:e.key==='End'?95:null;
         if(target!==null){e.preventDefault();setSlot(target);e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-slot="${target}"]`)?.focus();}
         const lane=e.key==='ArrowRight'?dates.indexOf(date)+1:e.key==='ArrowLeft'?dates.indexOf(date)-1:-1;
         if(lane>=0&&lane<dates.length){e.preventDefault();scroller.current?.querySelector<HTMLButtonElement>(`[data-date="${dates[lane]}"] [data-slot="${index}"]`)?.focus();}
        }}/>;
       })}</div>
       {layout.filter(({item})=>!joinedKeys.has(date+':'+item.id)).map(({item,start,end,column,columns})=>{
        const duration=end-start;
        return <button type="button" key={item.id} className={'timetable-card timetable-event '+(schedulePhase(item,date,today,now)==='current'?'current-event ':'')+(duration<30?'short-event ':duration<60?'compact-event ':'')+(columns>1?'overlap-event':'')} style={{'--event-color':eventColor(item,members),top:(start-startMinute)*minuteHeight,height:duration*minuteHeight,left:`calc(${column/columns*100}% + 2px)`,width:`calc(${100/columns}% - 4px)`} as CSSProperties} onClick={()=>edit(item)} aria-label={label(item)} title={label(item)+(item.data.place?' · '+item.data.place:'')+(item.kind==='REPEAT'?' · 매주 반복':'')} data-timetable-item={item.id} data-start-minute={start} data-end-minute={end}>{content(item)}</button>;
       })}
       {date===today&&timeMinutes(now)>=startMinute&&<div className="timetable-now" style={{top:(timeMinutes(now)-startMinute)*minuteHeight}} aria-label={'현재 시간 '+now}><span/><strong>현재 {now}</strong></div>}
      </div>)}
      {joined.map(run=>{const item=run.days[0].item,duration=run.end-run.start;return <button type="button" key={run.key} className={'timetable-card timetable-event timetable-joined '+(run.days.some(d=>schedulePhase(d.item,d.date,today,now)==='current')?'current-event ':'')+(duration<30?'short-event ':duration<60?'compact-event ':'')} data-dates={run.days.map(d=>d.date).join(' ')} data-span={run.days.length} data-timetable-item={item.id} style={{'--event-color':eventColor(item,members),top:(run.start-startMinute)*minuteHeight,height:duration*minuteHeight,left:`calc(${run.firstColumn/dates.length*100}% + 2px)`,width:`calc(${run.days.length/dates.length*100}% - 4px)`} as CSSProperties} aria-label={label(item)+' · '+run.days[0].date+' ~ '+run.days.at(-1)!.date} title={label(item)+' · 날짜별 영역을 누르면 해당 일정이 열려요'} onClick={event=>{const bounds=event.currentTarget.getBoundingClientRect(),index=event.detail===0?Math.max(0,run.days.findIndex(d=>d.date===day)):Math.min(run.days.length-1,Math.max(0,Math.floor((event.clientX-bounds.left)/bounds.width*run.days.length)));edit(run.days[index].item);}}>{content(item)}</button>;})}
     </div>
    </div>
   </div>
  </div></div>
 </section>;
}

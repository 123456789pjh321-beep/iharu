import {timetableRuns} from '../../../shared/timetable-runs';
import {useHolidays} from './useHolidays';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {koreaToday} from '../../../shared/schedules';
import {dailySchedules,scheduleTimeCaption,scheduleAssignee,schedulePhase,timetableRange,timetableLayout,timetableWeekDates,timeLabel,timeMinutes} from '../../../shared/workspace-schedules';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {eventColor} from './scheduleColors';
import {useMemberPreference} from './MemberPreferenceFilter';
import {CalendarMemberPreferenceFilter} from './CalendarMemberPreferenceFilter';
import {WorkspaceToolbar} from './WorkspaceToolbar';
import {WorkspaceTopBarActions} from './WorkspaceTopBar';
import {TimetableGraphic} from './TimetableGraphic';
import {Icon} from './Icon';

const weekday=['일','월','화','수','목','금','토'];
const minuteHeight=.8;
const hourLabel=(hour:number)=>hour===24?'밤 12':`${hour>=21?'밤':hour<12?'오전':'오후'} ${hour%12||12}`;
const koreaTime=()=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
type CalendarTimetable={view:'day'}|{view:'week';header:ReactNode};
type Interval={start:number;end:number};
const timedKey=(date:string,item:WorkspaceItem,start:number)=>date+':'+item.id+':'+start;
export function PersonalTimetable({day,items,members,loading,calendar,preview=false,setDay,create,edit,viewerId,defaultMemberIds,saveDefaultMembers}:{day:string;items:WorkspaceItem[];members:WorkspaceMember[];loading:boolean;calendar?:CalendarTimetable;preview?:boolean;viewerId?:string;defaultMemberIds?:string[];saveDefaultMembers?:(ids:string[])=>Promise<void>;setDay:(date:string)=>void;create:(date:string,time?:string)=>void;edit:(item:WorkspaceItem,date:string)=>void}){
 const embedded=!!calendar,calendarWeek=calendar?.view==='week';
 const holidays=useHolidays((embedded?day:koreaToday()).slice(0,7));
 const selection=useMemberPreference(members,{viewerId,defaultMemberIds,saveDefaultMembers}); const [now,setNow]=useState(koreaTime),[slot,setSlot]=useState(36),scroller=useRef<HTMLDivElement>(null),scrolledDay=useRef('');
 const [view,setView]=useState<'calendar'|'graphic'>('calendar');
 const showGraphic=!embedded&&view==='graphic';
 useEffect(()=>{const update=()=>setNow(koreaTime()),timer=setInterval(update,30000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[]);
 const member=embedded?'all':selection.memberIds;
 const memberKey=embedded?'all':[...selection.memberIds].sort().join(',');
 const today=koreaToday(),dates=calendar?.view==='day'?[day]:timetableWeekDates(calendarWeek?day:today);
 const period=dates[0],selectedDay=dates.includes(day)?day:today;
 const sourceItems=items.filter(item=>item.kind===(embedded?'EVENT':'REPEAT'));
 const lanes=dates.map(date=>{const events=dailySchedules(sourceItems,date,member);return {date,events,allDay:events.filter(i=>i.data.allDay),layout:timetableLayout(events,embedded?undefined:timetableRange,date)};});
 const joined=timetableRuns(lanes),joinedKeys=new Set(joined.flatMap(run=>run.days.map(({date,item})=>timedKey(date,item,run.start))));
 const events=lanes.flatMap(lane=>lane.events),showToday=dates.includes(today),currentEvents=dailySchedules(sourceItems,today,member).filter(i=>!i.data.allDay&&schedulePhase(i,today,today,now)==='current');
 const timed=lanes.flatMap(lane=>lane.layout);
 const firstEventHour=timed.length?Math.max(0,Math.min(...timed.map(row=>row.start))-60):540;
 const startMinute=calendarWeek?0:embedded?firstEventHour:timetableRange.start,endMinute=embedded?1440:timetableRange.end;
 const nowMinute=timeMinutes(now);
 const isCurrent=(date:string,start:number,end:number)=>date===today&&nowMinute>=start&&nowMinute<end;
 const firstSlot=Math.floor(startMinute/15),lastSlot=Math.ceil(endMinute/15)-1,activeSlot=Math.min(lastSlot,Math.max(firstSlot,slot));
 const ticks=[startMinute,...Array.from({length:Math.floor(endMinute/60)-Math.floor(startMinute/60)},(_,n)=>(Math.floor(startMinute/60)+n+1)*60).filter(minute=>minute-startMinute>=20&&endMinute-minute>=20),endMinute];
 useLayoutEffect(()=>{
  if(showGraphic){scrolledDay.current='';return;}
  const key=(calendar?.view??'timetable')+':'+period+':'+memberKey+':'+startMinute+':'+endMinute;
  if(loading||scrolledDay.current===key||!scroller.current)return;
  scrolledDay.current=key;
  const target=showToday&&nowMinute>=startMinute&&nowMinute<endMinute?nowMinute:calendarWeek?firstEventHour:startMinute;
  scroller.current.scrollTop=Math.max(0,(target-startMinute)*minuteHeight-scroller.current.clientHeight*.3);
 },[calendar?.view,calendarWeek,firstEventHour,period,memberKey,loading,startMinute,endMinute,nowMinute,showToday,showGraphic]);
 const timeCaption=(item:WorkspaceItem,date:string,interval?:Interval)=>embedded&&interval?`${timeLabel(interval.start)} – ${timeLabel(interval.end)}`:scheduleTimeCaption(item,embedded?date:undefined);
 const content=(item:WorkspaceItem,date:string,interval?:Interval)=><><strong className="timetable-title">{item.data.title}</strong><span className="timetable-range">{timeCaption(item,date,interval)}</span></>;
 const label=(item:WorkspaceItem,date:string,interval?:Interval)=>`${item.data.title} · ${scheduleAssignee(item,members)} · ${timeCaption(item,date,interval)} · ${item.mine?'수정':'상세'}`;
 const currentCaption=currentEvents.map(item=>`${scheduleAssignee(item,members)} · ${item.data.title}`).join(' / ');
 const currentSummary=showToday&&!loading?<div className={'timetable-current-summary'+(currentCaption?'':' empty')} aria-label="현재 진행 중인 일정"><strong>지금</strong><span title={currentCaption||undefined}>{currentCaption||'등록된 일정이 없는 시간이에요'}</span></div>:null;
 return <section className={'personal-timetable'+(calendarWeek?' calendar-weekly':embedded?' calendar-daily':' timetable-weekly')} aria-label={calendarWeek?'주간 일정':embedded?'일간 일정':'주간 시간표'}>
  {calendar?.view==='week'?calendar.header:embedded?<div className="timetable-summary"><span>{loading?'불러오는 중':`${events.length}개 일정`}</span>{currentSummary}</div>:<>
   <WorkspaceToolbar title="시간표" navigation={<span className="workspace-toolbar-title">{Number(today.slice(0,4))}년 {Number(today.slice(5,7))}월</span>}>{currentSummary}</WorkspaceToolbar>
   {!!members.length&&<CalendarMemberPreferenceFilter preview={preview} members={members} selection={selection} label="시간표 구성원 필터"/>}
   <WorkspaceTopBarActions label="시간표 보기">
    <button type="button" aria-pressed={!showGraphic} onClick={()=>setView('calendar')}><Icon name="calendar"/><span>달력</span></button>
    <button type="button" aria-pressed={showGraphic} onClick={()=>setView('graphic')}><Icon name="graph"/><span>그래픽</span></button>
   </WorkspaceTopBarActions>
   <div className="timetable-weekdays timetable-day-headings" role="group" aria-label="요일 선택">
    {dates.map(date=>{
     const dow=new Date(date+'T12:00:00Z').getUTCDay(),holiday=holidays.name(date);
     return <button type="button" key={date} data-timetable-date={date} aria-label={`${date} ${weekday[dow]}요일 시간표${holiday?' · '+holiday:''}`} aria-pressed={date===selectedDay} aria-current={date===today?'date':undefined} className={(date===today?'is-today ':'')+(holiday||dow===0?'holiday-date':dow===6?'saturday-date':'')} onClick={()=>setDay(date)}>
      <span>{weekday[dow]}</span><time dateTime={date}>{Number(date.slice(8))}</time>
      {holiday&&<small className="calendar-holiday" title={holiday}>{holiday}</small>}
     </button>;
    })}
   </div>
  </>}
  {!calendarWeek&&holidays.name(day)&&<p className={'timetable-holiday holiday-label'+(embedded?'':' sr-only')}>{holidays.name(day)}</p>}
  {showGraphic?<TimetableGraphic day={selectedDay} today={today} now={now} items={lanes.find(lane=>lane.date===selectedDay)?.events||[]}
   members={members} loading={loading} create={create} edit={item=>edit(item,selectedDay)}/>
  :<div className="calendar-viewport timetable-viewport"><div className="timetable-day" aria-busy={loading}>
   {!calendarWeek&&lanes.some(lane=>lane.allDay.length>0)&&<div className="timetable-all-day"><span>종일</span><div className="timetable-all-day-columns" style={{gridTemplateColumns:`repeat(${dates.length},minmax(0,1fr))`}}>{lanes.map(lane=><div key={lane.date}>{lane.allDay.map(item=><button type="button" key={item.id} className="timetable-card timetable-all-day-card" style={{'--event-color':eventColor(item,members)} as CSSProperties} onClick={()=>edit(item,lane.date)} aria-label={label(item,lane.date)} title={label(item,lane.date)} data-timetable-item={item.id}>{content(item,lane.date)}</button>)}</div>)}</div></div>}
   <div className="timetable-scroll" ref={scroller} data-calendar-scroll aria-label={calendarWeek?'주간 시간 눈금':'하루 시간 눈금'}>
    <div className="timetable-grid" data-start-minute={startMinute} data-end-minute={endMinute} style={{height:(endMinute-startMinute)*minuteHeight,'--timetable-line-offset':`${(60-startMinute%60)%60*minuteHeight}px`} as CSSProperties}>
     <div className="timetable-time-axis" aria-hidden="true">{ticks.map(minute=><span key={minute} className={showToday&&Math.floor(nowMinute/60)===Math.floor(minute/60)?'current-hour':''} style={{top:(minute-startMinute)*minuteHeight}}>{minute%60?timeLabel(minute):hourLabel(Math.floor(minute/60))}</span>)}</div>
     <div className="timetable-event-area" style={{gridTemplateColumns:`repeat(${dates.length},minmax(0,1fr))`}}>
      {lanes.map(({date,layout})=><div key={date} className={'timetable-day-column'+(date===today?' today-column':'')} data-date={date} data-selected={(!embedded||calendarWeek)&&date===selectedDay?true:undefined}>
       <div className="timetable-slots" role="group" aria-label={`${date} 15분 단위 일정 등록`}>{Array.from({length:lastSlot-firstSlot+1},(_,offset)=>{
        const index=firstSlot+offset,minute=Math.max(startMinute,index*15),time=timeLabel(minute);
        return <button type="button" key={time} data-slot={index} data-time={time} tabIndex={date===selectedDay&&activeSlot===index?0:-1} className="timetable-slot" aria-label={`${date} ${time} 일정 등록`} style={{top:(minute-startMinute)*minuteHeight,height:(Math.min(endMinute,(index+1)*15)-minute)*minuteHeight}} onFocus={()=>setSlot(index)} onClick={()=>create(date,time)} onKeyDown={e=>{
         const target=e.key==='ArrowDown'?Math.min(lastSlot,index+1):e.key==='ArrowUp'?Math.max(firstSlot,index-1):e.key==='Home'?firstSlot:e.key==='End'?lastSlot:null;
         if(target!==null){e.preventDefault();setSlot(target);e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-slot="${target}"]`)?.focus();}
         const lane=e.key==='ArrowRight'?dates.indexOf(date)+1:e.key==='ArrowLeft'?dates.indexOf(date)-1:-1;
         if(lane>=0&&lane<dates.length){e.preventDefault();scroller.current?.querySelector<HTMLButtonElement>(`[data-date="${dates[lane]}"] [data-slot="${index}"]`)?.focus();}
        }}/>;
       })}</div>
       {layout.filter(({item,start})=>!joinedKeys.has(timedKey(date,item,start))).map(({item,start,end,column,columns})=>{
        const duration=end-start;
        return <button type="button" key={item.id+':'+start} className={'timetable-card timetable-event '+(isCurrent(date,start,end)?'current-event ':'')+(duration<30?'short-event ':duration<60?'compact-event ':'')+(columns>1?'overlap-event':'')} style={{'--event-color':eventColor(item,members),top:(start-startMinute)*minuteHeight,height:duration*minuteHeight,left:`calc(${column/columns*100}% + 2px)`,width:`calc(${100/columns}% - 4px)`} as CSSProperties} onClick={()=>edit(item,date)} aria-label={label(item,date,{start,end})} title={label(item,date,{start,end})+(item.data.place?' · '+item.data.place:'')+(item.kind==='REPEAT'?' · 매주 반복':'')} data-timetable-item={item.id} data-start-minute={start} data-end-minute={end}>{content(item,date,{start,end})}</button>;
       })}
       {isCurrent(date,startMinute,endMinute)&&<div className="timetable-now" style={{top:(nowMinute-startMinute)*minuteHeight}} aria-label={'현재 시간 '+now}><span/><strong>{calendarWeek?now:'현재 '+now}</strong></div>}
      </div>)}
      {joined.map(run=>{
       const {date,item}=run.days[0],duration=run.end-run.start,caption=label(item,date,run);
       return <button type="button" key={run.key} className={'timetable-card timetable-event timetable-joined '+(run.days.some(d=>isCurrent(d.date,run.start,run.end))?'current-event ':'')+(duration<30?'short-event ':duration<60?'compact-event ':'')} data-dates={run.days.map(d=>d.date).join(' ')} data-span={run.days.length} data-timetable-item={item.id} data-start-minute={run.start} data-end-minute={run.end}
        style={{'--event-color':eventColor(item,members),top:(run.start-startMinute)*minuteHeight,height:duration*minuteHeight,left:`calc(${run.firstColumn/dates.length*100}% + 2px)`,width:`calc(${run.days.length/dates.length*100}% - 4px)`} as CSSProperties}
        aria-label={caption+' · '+date+' ~ '+run.days.at(-1)!.date} title={caption+' · 날짜별 영역을 누르면 해당 일정이 열려요'} onClick={event=>{
         const bounds=event.currentTarget.getBoundingClientRect();
         const index=event.detail===0?Math.max(0,run.days.findIndex(d=>d.date===selectedDay)):Math.min(run.days.length-1,Math.max(0,Math.floor((event.clientX-bounds.left)/bounds.width*run.days.length)));
         const target=run.days[index];edit(target.item,target.date);
        }}>{content(item,date,run)}</button>;
      })}
     </div>
    </div>
   </div>
  </div></div>}
  {!calendarWeek&&holidays.unavailable&&<p className="holiday-status" role="status">이 연도의 공휴일 정보를 확인하지 못했어요.</p>}
 </section>;
}

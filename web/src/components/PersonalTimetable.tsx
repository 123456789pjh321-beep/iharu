import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {addDays,koreaToday} from '../../../shared/schedules';
import {dailySchedules,scheduleAssignee,schedulePhase,timetableLayout,timeLabel,timeMinutes,visibleOn} from '../../../shared/workspace-schedules';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {eventColor} from './PersonalCalendar';
import {Icon} from './Icon';
import {useCalendarSlide} from './useCalendarSlide';

const weekday=['일','월','화','수','목','금','토'];
const minuteHeight=1.2;
const koreaTime=()=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
export function PersonalTimetable({day,items,members,loading,setDay,create,edit}:{day:string;items:WorkspaceItem[];members:WorkspaceMember[];loading:boolean;setDay:(date:string)=>void;create:(date:string,time?:string)=>void;edit:(item:WorkspaceItem)=>void}){
 const [member,setMember]=useState('all'),[now,setNow]=useState(koreaTime),[slot,setSlot]=useState(36),page=useRef<HTMLDivElement>(null),scroller=useRef<HTMLDivElement>(null),scrolledDay=useRef(''),gesture=useRef<{x:number;y:number}|null>(null),suppressClick=useRef(0);
 useEffect(()=>{const update=()=>setNow(koreaTime()),timer=setInterval(update,30000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[]);
 useEffect(()=>{if(member!=='all'&&!members.some(m=>m.id===member))setMember('all');},[members,member]);
 useCalendarSlide(page,day,'day');
 const today=koreaToday(),weekStart=addDays(day,-new Date(day+'T12:00:00Z').getUTCDay()),dates=Array.from({length:7},(_,n)=>addDays(weekStart,n)),events=dailySchedules(items,day,member),allDay=events.filter(i=>i.data.allDay),layout=timetableLayout(events),next=layout.find(({item})=>schedulePhase(item,day,today,now)==='upcoming')?.start;
 useLayoutEffect(()=>{
  if(loading||scrolledDay.current===day||!scroller.current)return;
  scrolledDay.current=day;
  const first=layout[0]?.start??540,last=Math.max(...layout.map(r=>r.end),first),current=timeMinutes(now),target=day===today&&current>=first&&current<=last?current:first;
  scroller.current.scrollTop=Math.max(0,Math.floor(target/60)-1)*60*minuteHeight;
 },[day,loading,layout,now,today]);
 const content=(item:WorkspaceItem)=>{
  const who=scheduleAssignee(item,members),phase=schedulePhase(item,day,today,now),upNext=phase==='upcoming'&&timeMinutes(item.data.startTime!)===next;
  return <><span className="timetable-card-top"><span className="timetable-person"><Icon name={item.data.allMembers?'users':'sun'}/>{who}</span>{phase==='current'?<span className="timetable-status">진행 중</span>:upNext?<span className="timetable-status next">다음 일정</span>:null}</span><strong className="timetable-title">{item.data.title}</strong><span className="timetable-range">{item.data.allDay?'종일':`${item.data.startTime} – ${item.data.endTime}`}{item.kind==='REPEAT'&&<><Icon name="repeat"/><span>매주 반복</span></>}</span>{item.data.place&&<span className="timetable-place"><Icon name="pin"/>{item.data.place}</span>}</>;
 };
 const label=(item:WorkspaceItem)=>`${item.data.title} · ${scheduleAssignee(item,members)} · ${item.data.allDay?'종일':item.data.startTime+' – '+item.data.endTime} · ${item.mine?'수정':'상세'}`;
 return <section className="personal-timetable" aria-label="일별 시간표">
  <div className="timetable-toolbar"><label className="calendar-month-picker timetable-date"><span aria-hidden="true">{Number(day.slice(5,7))}월 {Number(day.slice(8))}일 {weekday[new Date(day+'T12:00:00Z').getUTCDay()]}요일</span><input type="date" aria-label="시간표 날짜 선택" value={day} onChange={e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))setDay(e.target.value);}}/></label><div className="timetable-date-actions"><button className="icon-button" aria-label="이전 날" onClick={()=>setDay(addDays(day,-1))}><Icon name="chevron" className="flip"/></button><button className="button compact" onClick={()=>setDay(today)}>오늘</button><button className="icon-button" aria-label="다음 날" onClick={()=>setDay(addDays(day,1))}><Icon name="chevron"/></button></div></div>
  <div className="timetable-week" aria-label="날짜 선택">{dates.map((date,n)=><button type="button" key={date} aria-label={`${date} 시간표`} aria-pressed={date===day} className={date===today?'is-today':''} onClick={()=>setDay(date)}><span>{weekday[n]}</span><strong>{Number(date.slice(8))}</strong><i className={items.some(i=>visibleOn(i,date))?'has-events':''} aria-hidden="true"/></button>)}</div>
  <div className="timetable-filters" role="group" aria-label="시간표 구성원 필터"><button type="button" aria-pressed={member==='all'} onClick={()=>setMember('all')}>전체 보기</button>{members.map(m=><button type="button" key={m.id} aria-pressed={member===m.id} onClick={()=>setMember(m.id)}>{m.name}</button>)}</div>
  <div className="timetable-summary"><span>{loading?'불러오는 중':`${events.length}개 일정`}{day===today&&<small>오늘 · {now}</small>}</span><button type="button" className="button compact" onClick={()=>create(day)}><Icon name="plus"/>일정 등록</button></div>
  <div className="calendar-viewport timetable-viewport"><div ref={page} className="timetable-day" aria-busy={loading} onPointerDown={e=>{if(e.button===0&&e.isPrimary)gesture.current={x:e.clientX,y:e.clientY};}} onPointerMove={e=>{const g=gesture.current;if(g&&Math.abs(e.clientX-g.x)>20&&Math.abs(e.clientX-g.x)>Math.abs(e.clientY-g.y)*1.5)e.currentTarget.setPointerCapture(e.pointerId);}} onPointerCancel={()=>{gesture.current=null;}} onPointerUp={e=>{const g=gesture.current;gesture.current=null;if(g&&Math.abs(e.clientX-g.x)>60&&Math.abs(e.clientX-g.x)>Math.abs(e.clientY-g.y)*1.5){suppressClick.current=Date.now()+350;setDay(addDays(day,e.clientX<g.x?1:-1));}}} onClickCapture={e=>{if(Date.now()<suppressClick.current){e.preventDefault();e.stopPropagation();}}}>
   {allDay.length>0&&<div className="timetable-all-day"><span>종일</span><div>{allDay.map(item=><button type="button" key={item.id} className="timetable-card timetable-all-day-card" style={{'--event-color':eventColor(item,members)} as CSSProperties} onClick={()=>edit(item)} aria-label={label(item)} data-timetable-item={item.id}>{content(item)}</button>)}</div></div>}
   <div className="timetable-scroll" ref={scroller} data-calendar-scroll aria-label="하루 시간 눈금">
    <div className="timetable-grid" style={{height:1440*minuteHeight}}>
     <div className="timetable-time-axis" aria-hidden="true">{Array.from({length:49},(_,tick)=><span key={tick} className={tick%2?'minor-tick':''} style={{top:tick*30*minuteHeight}}>{timeLabel(tick*30)}</span>)}</div>
     <div className="timetable-event-area">
      <div className="timetable-slots" role="group" aria-label="15분 단위 일정 등록">{Array.from({length:96},(_,index)=>{
       const time=timeLabel(index*15);
       return <button type="button" key={time} data-slot={index} data-time={time} tabIndex={slot===index?0:-1} className="timetable-slot" aria-label={`${day} ${time} 일정 등록`} style={{top:index*15*minuteHeight,height:15*minuteHeight}} onFocus={()=>setSlot(index)} onClick={()=>create(day,time)} onKeyDown={e=>{
        const target=e.key==='ArrowDown'?Math.min(95,index+1):e.key==='ArrowUp'?Math.max(0,index-1):e.key==='Home'?0:e.key==='End'?95:null;
        if(target!==null){e.preventDefault();setSlot(target);scroller.current?.querySelector<HTMLButtonElement>(`[data-slot="${target}"]`)?.focus();}
       }}/>;
      })}</div>
      {layout.map(({item,start,end,column,columns})=>{
       const duration=end-start;
       return <button type="button" key={item.id} className={'timetable-card timetable-event '+(duration<30?'short-event ':duration<60?'compact-event ':'')+(columns>1?'overlap-event':'')} style={{'--event-color':eventColor(item,members),top:start*minuteHeight,height:duration*minuteHeight,left:`calc(${column/columns*100}% + 2px)`,width:`calc(${100/columns}% - 5px)`} as CSSProperties} onClick={()=>edit(item)} aria-label={label(item)} title={label(item)} data-timetable-item={item.id} data-start-minute={start} data-end-minute={end}>
        {content(item)}
       </button>;
      })}
      {day===today&&<div className="timetable-now" style={{top:timeMinutes(now)*minuteHeight}} aria-label={'현재 시간 '+now}><span/>{now}</div>}
     </div>
    </div>
   </div>
  </div></div>
 </section>;
}

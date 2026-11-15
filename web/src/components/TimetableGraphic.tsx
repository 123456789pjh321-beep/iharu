import {scheduleAssignee,schedulePhase,scheduleTimeCaption,timeLabel,timeMinutes,timetableLayout} from '../../../shared/workspace-schedules';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {GraphicRing,type RingSlice} from './GraphicRing';
import {Icon} from './Icon';
import {eventColor} from './scheduleColors';

const dateCaption=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Seoul'});

export function TimetableGraphic({day,today,now,items,members,loading,create,edit}:{
 day:string;today:string;now:string;items:WorkspaceItem[];members:WorkspaceMember[];loading:boolean;
 create:(date:string,time?:string)=>void;edit:(item:WorkspaceItem)=>void;
}){
 const slots=timetableLayout(items,undefined,day);
 const slices:RingSlice[]=slots.map(slot=>({id:slot.item.id+':'+slot.start,from:slot.start/1440,to:slot.end/1440,
  lane:slot.column,color:eventColor(slot.item,members)}));
 const currentMinute=day===today?timeMinutes(now):undefined;
 const next=currentMinute===undefined?undefined:slots.find(slot=>slot.start>currentMinute);
 const caption=dateCaption.format(new Date(day+'T12:00:00+09:00'));
 return <section className="timetable-graphic" aria-label="그래픽 시간표" aria-busy={loading}>
  <div className="timetable-graphic-dial">
   <GraphicRing clock label={`${caption} 24시간 원형 시간표`} slices={slices}
    now={currentMinute===undefined?undefined:currentMinute/1440}
    onSelect={id=>{
     const row=slots.find(slot=>slot.item.id+':'+slot.start===id);
     if(row)edit(row.item);
    }}
    center={<><small>{caption}</small><strong>{loading?'불러오는 중':items.length+'개 일정'}</strong>
     {currentMinute!==undefined&&<small className="graphic-now">현재 {now}</small>}</>}/>
   {next&&<button type="button" className="timetable-graphic-next" onClick={()=>edit(next.item)}>
    <span>다음 {timeLabel(next.start)}</span><strong>{next.item.data.title}</strong><Icon name="chevron"/>
   </button>}
  </div>
  <div className="timetable-graphic-list">
   <header><h2>{caption}</h2>
    <button type="button" className="button compact" onClick={()=>create(day)}><Icon name="plus"/>일정 추가</button>
   </header>
   {loading?<p role="status">일정을 불러오는 중이에요.</p>:items.length?<ul aria-label="시간순 일정">{items.map(item=>{
    const current=schedulePhase(item,day,today,now)==='current';
    return <li key={item.id}><button type="button" onClick={()=>edit(item)}
     aria-label={`${item.data.title} · ${item.mine?'수정':'상세'}`} data-current={current||undefined}>
     <span className="timetable-graphic-swatch" style={{background:eventColor(item,members)}}/>
     <span className="timetable-graphic-entry"><strong>{item.data.title}</strong>
      <small>{scheduleTimeCaption(item,day)} · {scheduleAssignee(item,members)}</small></span>
     {current&&<span className="timetable-graphic-current">진행 중</span>}
     <Icon name="chevron"/>
    </button></li>;
   })}</ul>:<p>등록된 일정이 없어요.</p>}
  </div>
 </section>;
}

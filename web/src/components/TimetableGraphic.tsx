import {useState,type ReactNode} from 'react';
import {scheduleAssignee,schedulePhase,scheduleTimeCaption,timeLabel,timeMinutes,timetableLayout} from '../../../shared/workspace-schedules';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {GraphicRing,type RingSlice} from './GraphicRing';
import {Icon,type IconName} from './Icon';
import {eventColor} from './scheduleColors';
import {infographicSlices} from './ring-model';

const dateCaption=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Seoul'});
const routineColors=['#247467','#365f91','#92516f','#8c6025','#685696','#9e4f3a'];
const routinePageSize=routineColors.length;

function routineIcon(item:WorkspaceItem):IconName{
 const title=item.data.title;
 if(/귀가|하원|하교/.test(title))return 'home';
 if(/등교|등원|학교|유치원/.test(title))return 'bag';
 if(/학원|수업|독서|공부/.test(title))return 'book';
 if(/출발|이동|픽업/.test(title))return 'pin';
 if(/준비|운동|태권도|수영|축구/.test(title))return 'checklist';
 if(!item.data.startTime||item.data.allDay)return 'clock';
 const hour=Number(item.data.startTime.slice(0,2));
 return hour<12?'sun':hour>=18?'moon':'clock';
}

function RoutineInfographic({items,caption,day,center,edit,engineEnabled}:{
 items:WorkspaceItem[];caption:string;day:string;center:ReactNode;edit:(item:WorkspaceItem)=>void;engineEnabled:boolean;
}){
 const [selectedPage,setPage]=useState(0);
 const pageCount=Math.ceil(items.length/routinePageSize);
 const page=Math.min(selectedPage,Math.max(0,pageCount-1));
 const visibleItems=items.slice(page*routinePageSize,(page+1)*routinePageSize);
 const slices=infographicSlices(visibleItems.map((item,index)=>({id:item.id,weight:1,color:routineColors[index]})));
 return <>
  <GraphicRing kind="infographic" label={`${caption} 하루 일과 인포그래픽`} slices={slices} center={center} engineEnabled={engineEnabled}
   onSelect={id=>{const item=visibleItems.find(row=>row.id===id);if(item)edit(item);}}
   annotations={visibleItems.map((item,index)=>{
    const {from,to}=slices[index];
    const time=scheduleTimeCaption(item,day);
    const detail=item.data.allDay?'종일':item.data.startTime&&item.data.endTime?time.replace(/\s+–\s+/g,'–'):'시간 미정';
    return {id:item.id,turn:(from+to)/2,icon:routineIcon(item),caption:{title:item.data.title,detail}};
   })}/>
  {pageCount>1&&<div className="timetable-routine-pagination" role="group" aria-label="일과 인포그래픽 페이지">
   <button type="button" className="button compact" disabled={page===0} aria-label="이전 일과" onClick={()=>setPage(page-1)}>
    <Icon name="left"/>
   </button>
   <span aria-live="polite">{page+1} / {pageCount}</span>
   <button type="button" className="button compact" disabled={page+1===pageCount} aria-label="다음 일과" onClick={()=>setPage(page+1)}>
    <Icon name="chevron"/>
   </button>
  </div>}
 </>;
}

export function TimetableGraphic({day,today,now,items,members,loading,create,edit,engineEnabled}:{
 day:string;today:string;now:string;items:WorkspaceItem[];members:WorkspaceMember[];loading:boolean;
 create:(date:string,time?:string)=>void;edit:(item:WorkspaceItem)=>void;engineEnabled:boolean;
}){
 const [view,setView]=useState<'infographic'|'clock'>('infographic');
 const slots=timetableLayout(items,undefined,day);
 const slices:RingSlice[]=slots.map(slot=>({id:slot.item.id+':'+slot.start,from:slot.start/1440,to:slot.end/1440,
  lane:slot.column,color:eventColor(slot.item,members)}));
 const currentMinute=day===today?timeMinutes(now):undefined;
 const next=currentMinute===undefined?undefined:slots.find(slot=>slot.start>currentMinute);
 const caption=dateCaption.format(new Date(day+'T12:00:00+09:00'));
 const center=<><small>{caption}</small><strong>{loading?'불러오는 중':items.length+'개 일정'}</strong>
  {currentMinute!==undefined&&<small className="graphic-now">현재 {now}</small>}</>;
 return <section className="timetable-graphic" aria-label="그래픽 시간표" aria-busy={loading}>
  <div className="timetable-graphic-dial">
   <div className="timetable-graphic-views" role="group" aria-label="그래픽 표시">
    <button type="button" aria-pressed={view==='infographic'} onClick={()=>setView('infographic')}>하루 일과</button>
    <button type="button" aria-pressed={view==='clock'} onClick={()=>setView('clock')}>24시간</button>
   </div>
   {view==='infographic'?<RoutineInfographic key={day} items={loading?[]:items} day={day} caption={caption} center={center} edit={edit} engineEnabled={engineEnabled}/>
   :<GraphicRing kind="clock" label={`${caption} 24시간 원형 시간표`} slices={slices}
    engineEnabled={engineEnabled}
    now={currentMinute===undefined?undefined:currentMinute/1440}
    onSelect={id=>{
     const row=slots.find(slot=>slot.item.id+':'+slot.start===id);
     if(row)edit(row.item);
    }}
    center={center}/>}
   {next&&<button type="button" className="timetable-graphic-next" onClick={()=>edit(next.item)}>
    <span>다음 {timeLabel(next.start)}</span><strong>{next.item.data.title}</strong><Icon name="chevron"/>
   </button>}
  </div>
  <div className="timetable-graphic-list">
   <header><h2>{caption}</h2>
    <button type="button" className="button compact" onClick={()=>create(day)}><Icon name="plus"/>일정 추가</button>
   </header>
   {loading?<p role="status">일정을 불러오는 중이에요.</p>:items.length?<ul aria-label="시간순 일정">{items.map((item,index)=>{
    const current=schedulePhase(item,day,today,now)==='current';
    return <li key={item.id}><button type="button" onClick={()=>edit(item)}
     aria-label={`${item.data.title} · ${item.mine?'수정':'상세'}`} data-current={current||undefined}>
     <span className="timetable-graphic-swatch" style={{background:view==='infographic'?routineColors[index%routinePageSize]:eventColor(item,members)}}/>
     <span className="timetable-graphic-entry"><strong>{item.data.title}</strong>
      <small>{scheduleTimeCaption(item,day)} · {scheduleAssignee(item,members)}</small></span>
     {current&&<span className="timetable-graphic-current">진행 중</span>}
     <Icon name="chevron"/>
    </button></li>;
   })}</ul>:<p>등록된 일정이 없어요.</p>}
  </div>
 </section>;
}

import {useId,useState} from 'react';
import {clockValue,durationCaption,minutesOf,moveStartTime} from '../../../shared/entry-input';
import {Icon} from './Icon';

function ClockInput({label,name,value,onChange,invalid}:{label:string;name:string;value:string;onChange:(value:string)=>void;invalid?:boolean}){
 const id=useId(),minutes=minutesOf(value),hour=Math.floor(minutes/60),minute=minutes%60;
 const set=(h:number,m:number)=>onChange(clockValue(h*60+m));
 return <div className="entry-clock" role="group" aria-labelledby={id}>
  <div className="entry-clock-label"><span id={id}>{label}</span><span className="entry-clock-24">{value}</span></div>
  <input type="hidden" name={name} value={value}/>
  <div className="entry-clock-controls">
   <select aria-label={`${label} 오전·오후`} value={hour>=12?'PM':'AM'} onChange={e=>set(hour%12+(e.target.value==='PM'?12:0),minute)}><option value="AM">오전</option><option value="PM">오후</option></select>
   <select aria-label={`${label} 시`} aria-invalid={invalid||undefined} value={hour%12||12} onChange={e=>set(Number(e.target.value)%12+(hour>=12?12:0),minute)}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}시</option>)}</select>
   <span aria-hidden="true">:</span>
   <select aria-label={`${label} 분`} aria-invalid={invalid||undefined} value={minute} onChange={e=>set(hour,Number(e.target.value))}>{Array.from({length:60},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')}분</option>)}</select>
  </div>
 </div>;
}
export function EntryTimeRange({start,end,onChange,allDay,onAllDay}:{start:string;end:string;onChange:(start:string,end:string)=>void;allDay:boolean;onAllDay:(value:boolean)=>void}){
 const [adjusted,setAdjusted]=useState(false),duration=minutesOf(end)-minutesOf(start),invalid=duration<=0;
 return <section className="entry-section entry-time-section" aria-label="일정 시간">
  <div className="entry-section-heading"><h3><Icon name="clock"/>시간</h3><label className="entry-all-day"><input type="checkbox" checked={allDay} onChange={e=>onAllDay(e.target.checked)}/>종일</label></div>
  {allDay?<p className="entry-summary"><Icon name="sun"/>시간을 정하지 않고 하루 종일 표시해요.</p>:<>
   <div className="entry-time-pair"><ClockInput label="시작 시간" name="startTime" value={start} onChange={next=>{const nextEnd=moveStartTime(start,end,next);onChange(next,nextEnd);setAdjusted(nextEnd!==end);}}/><Icon name="arrow"/><ClockInput label="종료 시간" name="endTime" value={end} invalid={invalid} onChange={next=>{onChange(start,next);setAdjusted(false);}}/></div>
   <div className="entry-quick-row" role="group" aria-label="소요 시간 빠른 선택"><span>소요 시간</span>{[30,60,90,120,180].map(n=><button key={n} type="button" aria-pressed={duration===n} disabled={minutesOf(start)+n>=1440} onClick={()=>{onChange(start,clockValue(minutesOf(start)+n));setAdjusted(false);}}>{durationCaption(n)}</button>)}</div>
   <p className={`entry-summary ${invalid?'entry-error':''}`} role={invalid?'alert':'status'}>{invalid?<><Icon name="clock"/>종료 시간은 시작 시간보다 늦게 선택해 주세요. 오전·오후도 확인해 주세요.</>:<><Icon name="check"/>{start} – {end} · 총 {durationCaption(duration)}{adjusted&&<span>시작 시간에 맞춰 종료 시간도 이동했어요.</span>}</>}</p>
  </>}
 </section>;
}

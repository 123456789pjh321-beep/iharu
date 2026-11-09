import {useId,useRef,useState,type KeyboardEvent} from 'react';
import {dateCaption,dateValue,periodDays,shiftDate,shiftMonth} from '../../../shared/entry-input';
import {koreaToday} from '../../../shared/schedules';
import {Icon} from './Icon';

const weekdays=['일','월','화','수','목','금','토'];
type Props={start:string;end?:string;range?:boolean;eventRange?:boolean;startLabel?:string;endLabel?:string;onChange:(start:string,end:string)=>void;onOpenChange:(open:boolean)=>void};
export function EntryDatePicker({start,end='',range=false,eventRange=false,startLabel='날짜',endLabel='반복 종료일 (선택)',onChange,onOpenChange}:Props){
 const id=useId(),[open,setOpen]=useState(false),[active,setActive]=useState<'start'|'end'>('start'),[draftStart,setDraftStart]=useState(start),[draftEnd,setDraftEnd]=useState(end),[month,setMonth]=useState(start.slice(0,7)),[hover,setHover]=useState('');
 const panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),today=koreaToday(),invalid=range&&!!end&&end<start;
 const show=(part:'start'|'end')=>{const validStart=dateValue(start)?start:today;setDraftStart(validStart);setDraftEnd(end);setActive(part);setMonth((part==='end'&&end?end:validStart).slice(0,7));setOpen(true);onOpenChange(true);};
 const close=()=>{setOpen(false);onOpenChange(false);trigger.current?.focus();};
 const choose=(day:string)=>{if(active==='start'||!range){setDraftStart(day);if(draftEnd<day||eventRange&&draftEnd===draftStart)setDraftEnd(eventRange?day:'');if(range)setActive('end');}else if(day<draftStart){setDraftStart(day);setDraftEnd(eventRange?day:'');}else setDraftEnd(day);setHover('');};
 const moveFocus=(e:KeyboardEvent<HTMLButtonElement>,day:string)=>{
  let next='';const week=dateValue(day)!.getUTCDay();
  if(e.key==='ArrowRight')next=shiftDate(day,1);if(e.key==='ArrowLeft')next=shiftDate(day,-1);if(e.key==='ArrowDown')next=shiftDate(day,7);if(e.key==='ArrowUp')next=shiftDate(day,-7);if(e.key==='Home')next=shiftDate(day,-week);if(e.key==='End')next=shiftDate(day,6-week);if(e.key==='PageUp')next=shiftMonth(day,-1);if(e.key==='PageDown')next=shiftMonth(day,1);
  if(!next)return;e.preventDefault();setMonth(next.slice(0,7));requestAnimationFrame(()=>panel.current?.querySelector<HTMLButtonElement>(`[data-picker-date="${next}"]`)?.focus());
 };
 const selectedEnd=active==='end'&&hover>=draftStart?hover:draftEnd;
 return <section className="entry-section entry-date-section" aria-label={eventRange?'일정 기간':range?'날짜와 반복 기간':'날짜 선택'}>
  <div className="entry-section-heading"><h3><Icon name="calendar"/>{eventRange?'일정 기간':range?'날짜와 반복 기간':startLabel}</h3><button ref={trigger} type="button" className="entry-text-button" aria-expanded={open} aria-controls={id} onClick={()=>open?close():show('start')}><Icon name="calendar"/>{open?'달력 닫기':'달력에서 선택'}</button></div>
  <div className={`entry-date-pair ${range?'has-range':''}`}>
   <label className="entry-date-card"><span>{startLabel}</span><input id="personal-date" name="date" type="date" aria-label={startLabel} required readOnly={open} value={start} onChange={e=>onChange(e.target.value,end)}/><small>{start?dateCaption(start):'날짜를 선택해 주세요'}</small></label>
   {range&&<><Icon name="arrow"/><label className="entry-date-card"><span>{endLabel}</span><input name={eventRange?'endDate':'untilDate'} required={eventRange} type="date" aria-label={endLabel} min={start} readOnly={open} value={end} aria-invalid={invalid||undefined} onChange={e=>onChange(start,e.target.value)}/><small>{end?dateCaption(end):eventRange?'종료일을 선택해 주세요':'종료일 없이 계속 반복'}</small></label></>}
  </div>
  {invalid&&<p className="entry-error" role="alert">종료일은 시작일과 같거나 이후 날짜로 선택해 주세요.</p>}
  {!open&&<div className="entry-quick-row" aria-label="날짜 빠른 선택"><span>빠른 선택</span><button type="button" onClick={()=>onChange(today,end)}>오늘</button><button type="button" onClick={()=>onChange(shiftDate(today,1),end)}>내일</button><button type="button" onClick={()=>onChange(shiftDate(today,(6-dateValue(today)!.getUTCDay()+7)%7),end)}>이번 토요일</button>{range&&!eventRange&&<button type="button" aria-pressed={!end} onClick={()=>onChange(start,'')}>종료일 없음</button>}</div>}
  {open&&<div ref={panel} id={id} className="entry-date-panel" role="region" aria-label="날짜 선택 달력" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();close();}}}>
   <div className="entry-date-steps" role="group" aria-label="선택할 날짜"><button type="button" aria-pressed={active==='start'} onClick={()=>setActive('start')}><span>{range?'1. ':''}{startLabel}</span><strong>{dateCaption(draftStart)}</strong></button>{range&&<button type="button" aria-pressed={active==='end'} onClick={()=>setActive('end')}><span>2. 종료일</span><strong>{dateCaption(draftEnd)}</strong></button>}</div>
   <p className="entry-picker-hint" aria-live="polite">{active==='start'?`${startLabel}를 선택해 주세요.`:eventRange?'종료 날짜를 선택해 주세요. 하루 일정은 같은 날을 선택하세요.':'종료 날짜를 선택하거나, 종료일 없음으로 설정하세요.'}</p>
   <div className="entry-month-nav"><button type="button" className="icon-button" aria-label="이전 달" onClick={()=>setMonth(shiftMonth(month+'-01',-1).slice(0,7))}><Icon name="chevron" className="flip"/></button><label><span className="sr-only">날짜 선택 달력 월</span><input type="month" value={month} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value))setMonth(e.target.value);}}/></label><button type="button" className="icon-button" aria-label="다음 달" onClick={()=>setMonth(shiftMonth(month+'-01',1).slice(0,7))}><Icon name="chevron"/></button></div>
   <div className="entry-picker-months">{[0,1].map(offset=>{
    const first=shiftMonth(month+'-01',offset),date=dateValue(first);if(!date)return null;const pad=date.getUTCDay(),days=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    return <div className="entry-picker-month" key={offset}><h4>{date.getUTCFullYear()}년 {date.getUTCMonth()+1}월</h4><div className="entry-picker-grid" role="group" aria-label={`${date.getUTCFullYear()}년 ${date.getUTCMonth()+1}월`}>{weekdays.map((d,i)=><span className={`entry-picker-weekday day-${i}`} key={d}>{d}</span>)}{Array.from({length:pad},(_,i)=><span key={'empty'+i}/>)}{Array.from({length:days},(_,i)=>{
     const day=shiftDate(first,i),selected=day===draftStart||range&&day===draftEnd,inRange=range&&day>draftStart&&!!selectedEnd&&day<selectedEnd;
     return <button key={day} type="button" data-picker-date={day} className={[selected?'is-selected':'',inRange?'in-range':'',day===today?'is-today':'',`day-${(pad+i)%7}`].join(' ')} aria-label={`${day} ${weekdays[(pad+i)%7]}요일`} aria-pressed={selected} aria-current={day===today?'date':undefined} onMouseEnter={()=>setHover(day)} onMouseLeave={()=>setHover('')} onFocus={()=>setHover(day)} onBlur={()=>setHover('')} onKeyDown={e=>moveFocus(e,day)} onClick={()=>choose(day)}>{i+1}</button>;
    })}</div></div>;
   })}</div>
   {eventRange&&<div className="entry-quick-row" role="group" aria-label="일정 기간 빠른 선택">{[[0,'당일'],[1,'1박 2일'],[2,'2박 3일'],[6,'일주일']].map(([n,label])=><button type="button" key={label} onClick={()=>{setDraftEnd(shiftDate(draftStart,Number(n)));setActive('end');}}>{label}</button>)}</div>}
   {range&&!eventRange&&<div className="entry-quick-row" role="group" aria-label="반복 기간 빠른 선택">{[1,3,6].map(n=><button type="button" key={n} onClick={()=>{setDraftEnd(shiftMonth(draftStart,n));setActive('end');}}>+{n}개월</button>)}<button type="button" onClick={()=>{setDraftEnd(draftStart.slice(0,4)+'-12-31');setActive('end');}}>올해 말</button><button type="button" aria-pressed={!draftEnd} onClick={()=>{setDraftEnd('');setActive('end');}}>종료일 없음</button></div>}
   <div className="entry-picker-footer"><span aria-live="polite">{range?draftEnd?`${dateCaption(draftStart)} – ${dateCaption(draftEnd)} · ${periodDays(draftStart,draftEnd)}일간`:'종료일 없이 반복':dateCaption(draftStart)}</span><div><button type="button" className="button" onClick={close}>취소</button><button type="button" className="button primary" disabled={!dateValue(draftStart)||eventRange&&!dateValue(draftEnd)||range&&!!draftEnd&&draftEnd<draftStart} onClick={()=>{onChange(draftStart,draftEnd);close();}}>선택 완료</button></div></div>
  </div>}
  {range&&!open&&!invalid&&<p className="entry-summary"><Icon name={eventRange?'calendar':'repeat'}/>{eventRange?`${dateCaption(start)}부터 ${dateCaption(end)}까지 · ${periodDays(start,end)}일간`:end?`${dateCaption(start)}부터 ${dateCaption(end)}까지 반복`:'종료일 없이 계속 반복해요.'}</p>}
 </section>;
}

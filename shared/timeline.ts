import {ledgerCategory,ledgerFlow} from './ledger.js';
import {addDays} from './schedules.js';
import {calendarOccurrenceStart,scheduleTimeCaption,visibleOn} from './workspace-schedules.js';
import type {WorkspaceItem} from './workspace.js';

export type TimelineKind='REPEAT'|'EVENT'|'FEE';
export type TimelineAnnotation={itemId:string;date:string;reviewed:boolean;saved:boolean;note:string};
export type TimelinePatch=Partial<Pick<TimelineAnnotation,'reviewed'|'saved'|'note'>>;
export type TimelineData={items:WorkspaceItem[];annotations:TimelineAnnotation[]};
export type TimelineEntry={key:string;kind:TimelineKind;date:string;time:string;caption:string;item:WorkspaceItem};
export type TimelinePeriod='recent'|'upcoming'|'month';

export function timelineRange(period:TimelinePeriod,today:string,month:string){
 if(period==='recent')return {from:addDays(today,-29),to:today};
 if(period==='upcoming')return {from:addDays(today,1),to:addDays(today,30)};
 const [year,number]=month.split('-').map(Number);
 const last=new Date(Date.UTC(year,number,0)).getUTCDate();
 return {from:month+'-01',to:month+'-'+last};
}

export const timelineKey=(id:string,date:string)=>id+':'+date;

export function timelineEntries(items:WorkspaceItem[],from:string,to:string){
 const days:string[]=[];
 for(let day=from;day<=to;day=addDays(day,1))days.push(day);
 const entries:TimelineEntry[]=[];
 for(const item of items){
  const kind=item.kind,d=item.data;
  if(kind!=='FEE'&&kind!=='EVENT'&&kind!=='REPEAT')continue;
  // List an event once per start, including multi-day calendar events and monthly ledger entries.
  const dates=kind==='FEE'?[item.fee?.dueDate||d.date]:days.filter(day=>kind==='REPEAT'?visibleOn(item,day):calendarOccurrenceStart(d,day)===day);
  for(const date of dates){
   if(date<from||date>to)continue;
   entries.push({
    key:timelineKey(item.id,date),kind,date,time:kind==='FEE'||d.allDay?'':d.startTime||'',
    caption:kind==='FEE'?ledgerCategory(item).label:scheduleTimeCaption(item,date),item,
   });
  }
 }
 return entries.sort((a,b)=>b.date.localeCompare(a.date)||b.time.localeCompare(a.time)||
  a.item.data.title.localeCompare(b.item.data.title,'ko')||a.key.localeCompare(b.key));
}

const amountFormat=new Intl.NumberFormat('ko-KR');
export function timelineAmount(item:WorkspaceItem){
 return (ledgerFlow(item)==='INCOME'?'+':'−')+amountFormat.format(item.data.amount||0)+'원';
}

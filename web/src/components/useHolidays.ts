import {useEffect,useState} from 'react';
import {addDays} from '../../../shared/schedules';
import {holidayCalendarSchema,holidayNames,publishedHolidays,type HolidayCalendar} from '../../../shared/korean-holidays';
const cache=new Map<number,HolidayCalendar>(),pending=new Map<number,Promise<HolidayCalendar>>();
function load(year:number){
 if(cache.has(year))return Promise.resolve(cache.get(year)!);
 let request=pending.get(year);if(!request){request=(async()=>{try{const r=await fetch(`/api/calendar/holidays?year=${year}`);if(!r.ok)throw new Error('HOLIDAYS_UNAVAILABLE');const data=holidayCalendarSchema.parse(await r.json());if(data.year!==year)throw new Error('INVALID_YEAR');if(data.source!=='unavailable')cache.set(year,data);return data;}catch{return publishedHolidays(year);}finally{pending.delete(year);}})();pending.set(year,request);}return request;
}
export function useHolidays(month:string){
 const [remote,setRemote]=useState<HolidayCalendar[]>([]);
 const first=month+'-01',years=[...new Set([addDays(first,-40),addDays(first,100)].map(d=>Number(d.slice(0,4))))],key=years.join(',');
 useEffect(()=>{let active=true;void Promise.all(key.split(',').map(value=>load(Number(value)))).then(data=>{if(active)setRemote(data);});return()=>{active=false;};},[key]);
 const calendars=years.map(year=>remote.find(c=>c.year===year)||cache.get(year)||publishedHolidays(year));
 return {name:(date:string)=>holidayNames(calendars,date),unavailable:calendars.find(c=>c.year===Number(month.slice(0,4)))?.source==='unavailable'};
}

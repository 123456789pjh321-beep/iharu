import {useEffect,useState} from 'react';
import {addDays} from '../../../shared/schedules';
import {holidayCalendarSchema,holidayNames,publishedHolidays,type HolidayCalendar} from '../../../shared/korean-holidays';
const cache=new Map<number,HolidayCalendar>();
export function useHolidays(month:string){
 const [remote,setRemote]=useState<HolidayCalendar[]>([]);
 const first=month+'-01',years=[...new Set([addDays(first,-7),addDays(first,38)].map(d=>Number(d.slice(0,4))))],key=years.join(',');
 useEffect(()=>{
  let active=true;const controller=new AbortController();
  void Promise.all(key.split(',').map(async value=>{
   const year=Number(value);if(cache.has(year))return cache.get(year)!;
   try{const r=await fetch(`/api/calendar/holidays?year=${year}`,{signal:controller.signal});if(!r.ok)throw new Error('HOLIDAYS_UNAVAILABLE');const data=holidayCalendarSchema.parse(await r.json());if(data.year!==year)throw new Error('INVALID_YEAR');if(data.source!=='unavailable')cache.set(year,data);return data;}catch{return publishedHolidays(year);}
  })).then(data=>{if(active)setRemote(data);});return()=>{active=false;controller.abort();};
 },[key]);
 const calendars=years.map(year=>remote.find(c=>c.year===year)||cache.get(year)||publishedHolidays(year));
 return {name:(date:string)=>holidayNames(calendars,date),unavailable:calendars.find(c=>c.year===Number(month.slice(0,4)))?.source==='unavailable'};
}

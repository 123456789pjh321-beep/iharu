import {Hono} from 'hono';
import {publishedHolidays,type HolidayCalendar} from '../../shared/korean-holidays.js';
import {fetchHolidayYear} from './holidays.js';

// Public calendar facts only; no family data, DB credentials or API keys in responses.
// Coalesce concurrent requests and bound both successful and failed upstream retries.
export function holidayCalendarRoutes(env=process.env,fetchYear=fetchHolidayYear,clock=Date.now){
 const app=new Hono(),cache=new Map<number,{expires:number;data:HolidayCalendar}>(),pending=new Map<number,Promise<HolidayCalendar>>();
 const load=async(year:number):Promise<HolidayCalendar>=>{
  const cached=cache.get(year);if(cached&&cached.expires>clock())return cached.data;
  if(pending.has(year))return pending.get(year)!;
  const task=(async()=>{
   let data=publishedHolidays(year),ttl=300_000;
   if(env.HOLIDAY_API_KEY)try{
    const result=await fetchYear(year,env.HOLIDAY_API_KEY);
    data={year,items:result.items.filter(i=>i.isHoliday).map(({date,name})=>({date,name})),source:'api',checkedAt:new Date(clock()).toISOString()};ttl=86400_000;
   }catch{data=cached?.data||data;}
   cache.set(year,{data,expires:clock()+ttl});return data;
  })();pending.set(year,task);try{return await task;}finally{pending.delete(year);}
 };
 app.get('/api/calendar/holidays',async c=>{
  const raw=c.req.query('year')||'',year=Number(raw);
  if(!/^\d{4}$/.test(raw)||year<1900||year>2100)return c.json({error:{code:'INVALID_YEAR'}},400);
  const data=await load(year);c.header('Cache-Control','public, max-age=300, s-maxage=300');return c.json(data);
 });return app;
}

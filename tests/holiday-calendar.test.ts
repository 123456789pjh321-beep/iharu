import {describe,it,expect,vi} from 'vitest';
import {holidayCalendarRoutes} from '../server/schedules/holiday-calendar';
import {publishedHolidays,holidayNames} from '../shared/korean-holidays';

describe('Korean calendar publication and refresh',()=>{
 it('includes published lunar dates, replacements and the 2026 additions without inventing holidays',()=>{
  const years=[publishedHolidays(2026),publishedHolidays(2027)];
  expect(years.map(y=>y.items.length)).toEqual([22,24]);
  for(const [date,name] of [['2026-02-17','설날'],['2026-05-01','노동절'],['2026-07-17','제헌절'],['2026-06-03','전국동시지방선거'],['2026-09-25','추석'],['2027-02-09','대체공휴일(설날)'],['2027-05-13','부처님오신날'],['2027-07-19','대체공휴일(제헌절)'],['2027-12-27','대체공휴일(성탄절)']])expect(holidayNames(years,date)).toBe(name);
  expect(holidayNames(years,'2026-09-28')).toBe('');expect(holidayNames(years,'2027-06-07')).toBe('');
  expect(publishedHolidays(2028)).toMatchObject({source:'unavailable',items:[]});
 });
 it('serves fallback without credentials and rejects invalid/unbounded years',async()=>{
  const fetchYear=vi.fn(),app=holidayCalendarRoutes({},fetchYear);
  expect(await(await app.request('/api/calendar/holidays?year=2026')).json()).toEqual(publishedHolidays(2026));
  for(const value of ['2026x','2026.0','1899','2101',''])expect((await app.request('/api/calendar/holidays?year='+value)).status).toBe(400);
  expect(fetchYear).not.toHaveBeenCalled();
 });
 it('coalesces refreshes, excludes commemorations and preserves last good data after a failure',async()=>{
  let now=0;const fetchYear=vi.fn().mockResolvedValue({items:[{date:'2026-12-31',name:'임시공휴일 테스트',isHoliday:true},{date:'2026-04-05',name:'기념일',isHoliday:false}],hash:'fixture'});
  const app=holidayCalendarRoutes({HOLIDAY_API_KEY:'never-exposed'},fetchYear,()=>now);
  const results=await Promise.all(Array.from({length:3},()=>app.request('/api/calendar/holidays?year=2026')));
  const result=await results[0].json();expect(result).toMatchObject({source:'api',items:[{date:'2026-12-31',name:'임시공휴일 테스트'}]});expect(JSON.stringify(result)).not.toContain('never-exposed');expect(fetchYear).toHaveBeenCalledTimes(1);
  now+=86400_001;fetchYear.mockRejectedValue(new Error('secret in upstream URL'));
  expect(await(await app.request('/api/calendar/holidays?year=2026')).json()).toEqual(result);
  await app.request('/api/calendar/holidays?year=2026');expect(fetchYear).toHaveBeenCalledTimes(2);
 });
 it('falls back to verified publication on upstream errors and never claims unknown years are complete',async()=>{
  const app=holidayCalendarRoutes({HOLIDAY_API_KEY:'fixture'},vi.fn().mockRejectedValue(new Error('offline')));
  expect(await(await app.request('/api/calendar/holidays?year=2027')).json()).toEqual(publishedHolidays(2027));
  expect(await(await app.request('/api/calendar/holidays?year=2028')).json()).toMatchObject({source:'unavailable',items:[]});
 });
});

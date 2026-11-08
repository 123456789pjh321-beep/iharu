import {z} from 'zod';

export const holidayCalendarSchema=z.object({
 year:z.number().int(),
 items:z.array(z.object({date:z.iso.date(),name:z.string().min(1).max(100)})),
 source:z.enum(['api','published','unavailable']),
 checkedAt:z.string(),
});
export type HolidayCalendar=z.infer<typeof holidayCalendarSchema>;
// Official KASA almanacs, checked 2026-11-08. 2027 announcement also confirms
// the 2026 additions of Labour Day and Constitution Day. See docs/UI96-calendar-entry-navigation.md.
// Explicit dates: never infer lunar, substitute, election or temporary holidays.
const published:Record<number,Record<string,string>>={
 2026:{'01-01':'신정','02-16':'설날 연휴','02-17':'설날','02-18':'설날 연휴','03-01':'삼일절','03-02':'대체공휴일(삼일절)','05-01':'노동절','05-05':'어린이날','05-24':'부처님오신날','05-25':'대체공휴일(부처님오신날)','06-03':'전국동시지방선거','06-06':'현충일','07-17':'제헌절','08-15':'광복절','08-17':'대체공휴일(광복절)','09-24':'추석 연휴','09-25':'추석','09-26':'추석 연휴','10-03':'개천절','10-05':'대체공휴일(개천절)','10-09':'한글날','12-25':'성탄절'},
 2027:{'01-01':'신정','02-06':'설날 연휴','02-07':'설날','02-08':'설날 연휴','02-09':'대체공휴일(설날)','03-01':'삼일절','05-01':'노동절','05-03':'대체공휴일(노동절)','05-05':'어린이날','05-13':'부처님오신날','06-06':'현충일','07-17':'제헌절','07-19':'대체공휴일(제헌절)','08-15':'광복절','08-16':'대체공휴일(광복절)','09-14':'추석 연휴','09-15':'추석','09-16':'추석 연휴','10-03':'개천절','10-04':'대체공휴일(개천절)','10-09':'한글날','10-11':'대체공휴일(한글날)','12-25':'성탄절','12-27':'대체공휴일(성탄절)'},
};
export function publishedHolidays(year:number):HolidayCalendar{
 return {year,items:Object.entries(published[year]||{}).map(([date,name])=>({date:`${year}-${date}`,name})),source:published[year]?'published':'unavailable',checkedAt:published[year]?'2026-11-08':''};
}
export function holidayNames(calendars:HolidayCalendar[],date:string){return calendars.flatMap(c=>c.items.filter(i=>i.date===date).map(i=>i.name)).join(' · ');}

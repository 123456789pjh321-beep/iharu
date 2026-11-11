import {describe,it,expect} from 'vitest';
import {calendarDayBadge} from '../shared/calendar-day-badge';
import {holidayNames,publishedHolidays} from '../shared/korean-holidays';

describe('calendar holiday presentation',()=>{
 it('uses familiar captions while preserving the official source name',()=>{
  expect(calendarDayBadge('2026-12-25','기독탄신일')).toEqual({label:'성탄절',sourceLabel:'기독탄신일',tone:'holiday'});
  expect(calendarDayBadge('2027-01-01','1월1일')).toEqual({label:'신정',sourceLabel:'1월1일',tone:'holiday'});
  expect(calendarDayBadge('2027-12-27','대체공휴일(기독탄신일)')?.label).toBe('대체공휴일(성탄절)');
 });
 it('annotates eves without changing the official holiday classification',()=>{
  expect(calendarDayBadge('2026-12-24','')?.tone).toBe('observance');
  expect(calendarDayBadge('2026-12-31','')).toEqual({label:'새해 전날',sourceLabel:'새해 전날',tone:'observance'});
  expect(holidayNames([publishedHolidays(2026)],'2026-12-24')).toBe('');
  expect(holidayNames([publishedHolidays(2026)],'2026-12-31')).toBe('');
  expect(calendarDayBadge('2026-12-20','')).toBeNull();
  expect(calendarDayBadge('not-a-date','')).toBeNull();
 });
 it('lets an official temporary holiday take precedence over an eve annotation',()=>{
  expect(calendarDayBadge('2026-12-31','임시공휴일 테스트')).toEqual({label:'임시공휴일 테스트',sourceLabel:'임시공휴일 테스트',tone:'holiday'});
 });
});

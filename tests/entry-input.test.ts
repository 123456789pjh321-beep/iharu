import {expect,it} from 'vitest';
import {dateValue,shiftDate,shiftMonth,periodDays,minutesOf,moveStartTime,durationCaption} from '../shared/entry-input';
it('clamps period shortcuts at month ends, leap days and year boundaries',()=>{
 expect(shiftMonth('2028-01-31',1)).toBe('2028-02-29');
 expect(shiftMonth('2027-01-31',1)).toBe('2027-02-28');
 expect(shiftMonth('2028-02-29',12)).toBe('2029-02-28');
 expect(shiftMonth('2026-11-30',3)).toBe('2027-02-28');
 expect(shiftDate('2026-12-31',1)).toBe('2027-01-01');
 expect(periodDays('2028-02-28','2028-03-01')).toBe(3);
 expect(dateValue('2027-02-29')).toBeNull();expect(dateValue('')).toBeNull();
});
it('preserves the selected duration on start changes without silently crossing midnight',()=>{
 expect(moveStartTime('09:10','16:20','10:00')).toBe('17:10');
 expect(moveStartTime('11:30','12:30','12:00')).toBe('13:00');
 expect(moveStartTime('09:00','04:20','10:00')).toBe('04:20');
 expect(moveStartTime('22:30','23:30','23:30')).toBe('23:30');
 expect(minutesOf('00:00')).toBe(0);expect(minutesOf('12:00')).toBe(720);expect(minutesOf('24:00')).toBeNaN();
 expect(durationCaption(90)).toBe('1시간 30분');expect(durationCaption(30)).toBe('30분');
});

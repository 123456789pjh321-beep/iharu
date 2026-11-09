/** Date-only math stays in UTC; the editor's default day is supplied in Korea time. */
export function dateValue(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const date=new Date(value+'T12:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?date:null;
}
export function shiftDate(value:string,days:number){const date=dateValue(value);if(!date)return value;date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
export function shiftMonth(value:string,months:number){
 const date=dateValue(value);if(!date)return value;
 const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+months);
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));return date.toISOString().slice(0,10);
}
export function dateCaption(value:string){const date=dateValue(value);return date?new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short',timeZone:'UTC'}).format(date):'종료일 없음';}
export function periodDays(start:string,end:string){const a=dateValue(start),b=dateValue(end);return a&&b?Math.round((b.getTime()-a.getTime())/86400000)+1:0;}
export function minutesOf(value:string){return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;}
export function clockValue(minutes:number){return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
export function durationCaption(minutes:number){return minutes>0?`${Math.floor(minutes/60)?`${Math.floor(minutes/60)}시간`:''}${minutes%60?`${minutes>=60?' ':''}${minutes%60}분`:''}`:'';}
export function moveStartTime(start:string,end:string,next:string){
 const duration=minutesOf(end)-minutesOf(start),nextMinutes=minutesOf(next);
 // Preserve duration only within the same day. Never silently cross midnight.
 return duration>0&&Number.isFinite(nextMinutes)&&nextMinutes+duration<1440?clockValue(nextMinutes+duration):end;
}

import {useRef,type ReactNode} from 'react';
import {useCalendarPager} from './useCalendarPager';

export function MonthSwipeArea({month,onChange,children}:{month:string;onChange:(month:string)=>void;children:ReactNode}){
 const page=useRef<HTMLDivElement>(null);
 const swipe=useCalendarPager(page,month,'month',delta=>{
  const date=new Date(month+'-01T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth()+delta);
  if(date.getUTCFullYear()>=1&&date.getUTCFullYear()<=9999)onChange(date.toISOString().slice(0,7));
 });
 return <div className="calendar-viewport month-swipe-viewport" {...swipe}><div ref={page} className="month-swipe-area">{children}</div></div>;
}

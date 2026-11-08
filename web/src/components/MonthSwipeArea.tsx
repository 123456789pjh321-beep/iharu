import {useRef,type ReactNode} from 'react';
import {useDaySwipe} from './useDaySwipe';
import {useCalendarSlide} from './useCalendarSlide';

export function MonthSwipeArea({month,onChange,children}:{month:string;onChange:(month:string)=>void;children:ReactNode}){
 const page=useRef<HTMLDivElement>(null);
 const swipe=useDaySwipe(page,delta=>{
  const date=new Date(month+'-01T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth()+delta);
  if(date.getUTCFullYear()>=1&&date.getUTCFullYear()<=9999)onChange(date.toISOString().slice(0,7));
 },target=>{
  const button=target instanceof Element?target.closest<HTMLButtonElement>('button'):null;
  if(!button||button.disabled||!page.current?.contains(button))return false;
  button.click();return true;
 });
 useCalendarSlide(page,month,'month');
 return <div className="calendar-viewport month-swipe-viewport"><div ref={page} className="month-swipe-area" {...swipe}>{children}</div></div>;
}

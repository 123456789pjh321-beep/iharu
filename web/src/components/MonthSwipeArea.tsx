import {useLayoutEffect,useRef,type ReactNode} from 'react';
import {useDaySwipe} from './useDaySwipe';
import {useExperience} from './Experience';

export function MonthSwipeArea({month,onChange,children}:{month:string;onChange:(month:string)=>void;children:ReactNode}){
 const page=useRef<HTMLDivElement>(null),previous=useRef(month);
 const {preferences}=useExperience();
 const swipe=useDaySwipe(page,delta=>{
  const date=new Date(month+'-01T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth()+delta);
  if(date.getUTCFullYear()>=1&&date.getUTCFullYear()<=9999)onChange(date.toISOString().slice(0,7));
 });
 useLayoutEffect(()=>{
  const before=previous.current;previous.current=month;
  const node=page.current,reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  if(before===month||preferences.quiet||reduce.matches||!node?.animate)return;
  const animation=node.animate([{transform:`translateX(${month>before?100:-100}%)`},{transform:'translateX(0)'}],{duration:280,easing:'cubic-bezier(.22,.61,.36,1)'});
  const stop=()=>animation.cancel();reduce.addEventListener('change',stop);
  return()=>{reduce.removeEventListener('change',stop);stop();};
 },[month,preferences.quiet]);
 return <div className="calendar-viewport month-swipe-viewport"><div ref={page} className="month-swipe-area" {...swipe}>{children}</div></div>;
}

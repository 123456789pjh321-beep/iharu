import {useRef,type ReactNode} from 'react';
import {useCalendarPager} from './useCalendarPager';
/** Real adjacent pages stay mounted and inert; the track is the only transform owner. */
export function PeriodPager({period,view,onMove,renderPage,className=''}:{period:string;view:string;onMove:(delta:number)=>void;renderPage:(offset:number)=>ReactNode;className?:string}){
 const track=useRef<HTMLDivElement>(null),swipe=useCalendarPager(track,period,view,onMove);
 return <div className={'calendar-viewport continuous-pager '+className} {...swipe}><div ref={track} className="calendar-page-track">{[-1,0,1].map(offset=><div key={offset} className="calendar-page" data-page-offset={offset} data-pager-current={offset===0?'true':undefined} inert={offset!==0} aria-hidden={offset!==0?true:undefined}>{renderPage(offset)}</div>)}</div></div>;
}
export function shiftMonth(month:string,delta:number){const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+delta);return date.toISOString().slice(0,7);}

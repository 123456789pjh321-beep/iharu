import type {ReactNode} from 'react';
import {PeriodPager,shiftMonth} from './PeriodPager';
export function MonthSwipeArea({month,onChange,children}:{month:string;onChange:(month:string)=>void;children:(month:string)=>ReactNode}){
 return <PeriodPager period={month} view="month" className="month-swipe-viewport" onMove={delta=>onChange(shiftMonth(month,delta))} renderPage={offset=><div className="month-swipe-area">{children(shiftMonth(month,offset))}</div>}/>;
}

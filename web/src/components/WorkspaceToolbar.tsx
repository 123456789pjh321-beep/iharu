import type {ReactNode} from 'react';
import {Icon} from './Icon';

const weekdays=['일','월','화','수','목','금','토'];

export function WorkspaceToolbar({title,navigation,children}:{title:string;navigation:ReactNode;children:ReactNode}){
 return <header className="workspace-toolbar" aria-label={title+' 날짜 및 등록'}>
  <h1 className="sr-only">{title}</h1>
  {navigation}
  <div className="workspace-toolbar-actions">{children}</div>
 </header>;
}

export function DateNavigator({type,value,inputLabel,previousLabel,nextLabel,onChange,onMove,onToday}:{
 type:'date'|'month';value:string;inputLabel:string;previousLabel:string;nextLabel:string;
 onChange:(value:string)=>void;onMove:(delta:number)=>void;onToday:()=>void;
}){
 const label=type==='month'
  ? `${Number(value.slice(0,4))}년 ${Number(value.slice(5,7))}월`
  : `${Number(value.slice(5,7))}월 ${Number(value.slice(8))}일 (${weekdays[new Date(value+'T12:00:00Z').getUTCDay()]})`;
 return <div className="workspace-date-navigation" role="group" aria-label="날짜 이동">
  <button type="button" className="workspace-date-arrow" aria-label={previousLabel} onClick={()=>onMove(-1)}><Icon name="chevron" className="flip"/></button>
  <label className="workspace-date-picker" title={value}>
   <span aria-hidden="true">{label}</span><Icon name="calendar"/>
   <input type={type} aria-label={inputLabel} value={value} onChange={e=>{
    const next=e.target.value;
    if((type==='month'?/^\d{4}-\d{2}$/:/^\d{4}-\d{2}-\d{2}$/).test(next))onChange(next);
   }}/>
  </label>
  <button type="button" className="workspace-date-arrow" aria-label={nextLabel} onClick={()=>onMove(1)}><Icon name="chevron"/></button>
  <button type="button" className="workspace-date-today" onClick={onToday}>오늘</button>
 </div>;
}

import type {ReactNode} from 'react';
import {Icon} from './Icon';

const weekdays=['일','월','화','수','목','금','토'];

export function WorkspaceToolbar({title,navigation,createLabel,onCreate,children}:{title:string;navigation:ReactNode;createLabel:string;onCreate:()=>void;children?:ReactNode}){
 return <><header className="workspace-toolbar" aria-label={title+' 날짜 및 등록'}>
  <h1 className="sr-only">{title}</h1>
  {navigation}
  {children&&<div className="workspace-toolbar-actions">{children}</div>}
 </header><button type="button" className="button primary workspace-add-action" aria-label={createLabel} title={createLabel} onClick={onCreate}><Icon name="plus"/><span>{createLabel}</span></button></>;
}

export function DateNavigator({type,value,inputLabel,onChange}:{
 type:'date'|'month';value:string;inputLabel:string;
 onChange:(value:string)=>void;
}){
 const label=type==='month'
  ? `${Number(value.slice(0,4))}년 ${Number(value.slice(5,7))}월`
  : `${Number(value.slice(5,7))}월 ${Number(value.slice(8))}일 (${weekdays[new Date(value+'T12:00:00Z').getUTCDay()]})`;
 return <div className="workspace-date-navigation" role="group" aria-label="날짜 선택">
  <label className="workspace-date-picker" title={value}>
   <span aria-hidden="true">{label}</span><Icon name="chevron"/>
   <input type={type} aria-label={inputLabel} value={value} onClick={e=>{try{e.currentTarget.showPicker?.();}catch{/* Native input remains available without picker support. */}}} onChange={e=>{
    const next=e.target.value;
    if((type==='month'?/^\d{4}-\d{2}$/:/^\d{4}-\d{2}-\d{2}$/).test(next))onChange(next);
   }}/>
  </label>
 </div>;
}

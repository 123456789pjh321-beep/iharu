import {useEffect,useRef} from 'react';
import {Icon,type IconName} from './Icon';

export function WorkspaceViewPicker<View extends string>({label,value,options,onSelect}:{
 label:string;
 value:View;
 options:readonly (readonly [View,string,IconName])[];
 onSelect:(view:View)=>void;
}){
 const picker=useRef<HTMLDetailsElement>(null),trigger=useRef<HTMLElement>(null);
 const [,currentName,currentIcon]=options.find(([key])=>key===value)!;
 function close(){
  if(picker.current)picker.current.open=false;
  trigger.current?.focus();
 }
 useEffect(()=>{
  function dismiss(event:PointerEvent){
   const menu=picker.current;
   if(menu?.open&&event.target instanceof Node&&!menu.contains(event.target))menu.open=false;
  }
  document.addEventListener('pointerdown',dismiss);
  return()=>document.removeEventListener('pointerdown',dismiss);
 },[]);
 return <details ref={picker} className="workspace-view-picker" onKeyDown={event=>{
  if(event.key!=='Escape'||!event.currentTarget.open)return;
  event.preventDefault();
  event.stopPropagation();
  close();
 }} onBlur={event=>{
  if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget))event.currentTarget.open=false;
 }}>
  <summary ref={trigger} aria-label={`${label} · ${currentName}`}>
   <Icon name={currentIcon}/><span>{currentName}</span><Icon className="workspace-view-chevron" name="chevron"/>
  </summary>
  <div className="workspace-view-options" role="group" aria-label={label}>
   {options.map(([key,name,icon])=><button type="button" key={key} aria-pressed={value===key} onClick={()=>{onSelect(key);close();}}>
    <Icon name={icon}/><span>{name}</span>
   </button>)}
  </div>
 </details>;
}

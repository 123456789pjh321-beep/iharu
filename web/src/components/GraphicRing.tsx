import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ringAngle,ringBands,ringCenter,ringHit,ringSize,type RingKind,type RingModel,type RingSlice} from './ring-model';
import {Icon,type IconName} from './Icon';

export type {RingSlice} from './ring-model';
export type RingAnnotation={id:string;turn:number;icon:IconName;caption?:{title:string;detail:string}};
type Engine=ReturnType<typeof import('./phaser-ring').startPhaserRing>;

function ringPosition(turn:number,radius:number){
 const angle=ringAngle(turn);
 return {left:(ringCenter+Math.cos(angle)*radius)/ringSize*100+'%',top:(ringCenter+Math.sin(angle)*radius)/ringSize*100+'%'};
}

function RingPreview({model}:{model:RingModel}){
 const track=model.kind==='infographic'&&model.slices.length?'transparent':model.dark?'#34423d':'#e7eeeb';
 return <div className="graphic-ring-preview" aria-hidden="true">
  {ringBands(model).map((band,lane)=>{
   const segments=model.slices.filter(slice=>slice.lane===lane&&slice.to>slice.from);
   const width=2*(band.radius+band.width/2),hole=(width-2*band.width)/width*100;
   const colors:string[]=[];
   let previous=0;
   for(const slice of segments){
    if(slice.from>previous)colors.push(`${track} ${previous}turn ${slice.from}turn`);
    colors.push(`${slice.color} ${slice.from}turn ${slice.to}turn`);
    previous=slice.to;
   }
   if(previous<1)colors.push(`${track} ${previous}turn 1turn`);
   return <div key={lane} style={{width:width/ringSize*100+'%',background:`conic-gradient(${colors.join(',')})`,
    maskImage:`radial-gradient(closest-side, transparent ${hole-.25}%, black ${hole}%, black 99.75%, transparent 100%)`}}/>;
  })}
 </div>;
}

export function GraphicRing({slices,kind,now,label,center,annotations,onSelect,engineEnabled=true}:{
 slices:RingSlice[];kind:RingKind;now?:number;label:string;center:ReactNode;annotations?:RingAnnotation[];
 onSelect:(id:string)=>void;engineEnabled?:boolean;
}){
 const host=useRef<HTMLDivElement>(null),engine=useRef<Engine|null>(null);
 const [ready,setReady]=useState(false);
 const [dark,setDark]=useState(()=>document.documentElement.dataset.theme==='dark');
 const model={slices,kind,now,dark};
 const current=useRef<RingModel>(model);

 useEffect(()=>{
  const updateTheme=()=>setDark(document.documentElement.dataset.theme==='dark');
  const observer=new MutationObserver(updateTheme);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  current.current=model;
  engine.current?.update(model);
 },[slices,kind,now,dark]);
 useEffect(()=>{
  setReady(false);
  if(!engineEnabled)return;
  let active=true;
  void import('./phaser-ring').then(module=>{
   if(active&&host.current)engine.current=module.startPhaserRing(host.current,current.current,()=>{if(active)setReady(true);});
  }).catch(()=>{/* The same data remains available in the CSS ring and list. */});
  return()=>{
   active=false;
   engine.current?.destroy();
   engine.current=null;
  };
 },[engineEnabled]);
 const engineReady=engineEnabled&&ready;
 const annotationRadius=annotations?.length?ringBands(model)[0].radius:0;
 return <div className={'graphic-ring graphic-'+kind} role="img" aria-label={label}
  data-renderer={engineReady?'phaser':'css'} data-selectable={slices.length>0||undefined}
  onClick={event=>{
   const box=event.currentTarget.getBoundingClientRect();
   const slice=ringHit(model,(event.clientX-box.left)/box.width*ringSize,(event.clientY-box.top)/box.height*ringSize);
   if(slice)onSelect(slice.id);
  }}>
  {!engineReady&&<RingPreview model={model}/>}
  <div className="graphic-ring-engine" aria-hidden="true" ref={host}/>
  {kind==='clock'&&Array.from({length:8},(_,index)=><span className="graphic-clock-hour" aria-hidden="true" key={index}
   style={ringPosition(index/8,224)}>{String(index*3).padStart(2,'0')}</span>)}
  {!!annotations?.length&&<div className="graphic-ring-annotations" aria-hidden="true">
   {annotations.map(({id,turn,icon,caption})=><div className="graphic-ring-label" key={id} style={ringPosition(turn,annotationRadius)}>
    <Icon name={icon}/>
    {caption&&<><strong>{caption.title}</strong><small>{caption.detail}</small></>}
   </div>)}
  </div>}
  <div className="graphic-ring-center" aria-hidden="true">{center}</div>
 </div>;
}

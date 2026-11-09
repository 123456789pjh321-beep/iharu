import {useEffect,useLayoutEffect,useRef,type HTMLAttributes,type RefObject} from 'react';
import {useExperience} from './Experience';
import {pageIntent,releaseVelocity,settleDuration,type PointerSample} from './paging-physics';

type Gesture={id:number;x:number;y:number;axis:'x'|'y'|null;width:number;samples:PointerSample[]};
type Departure={period:string;view:string;direction:number;offset:number;width:number;velocity:number;page:HTMLElement;scroll:number[]};
/** One transform owner for drag, release and cancellation. React is not rendered per pointer frame. */
export function useCalendarPager(target:RefObject<HTMLDivElement|null>,period:string,view:string,onMove:(delta:number)=>void,enabled=true):HTMLAttributes<HTMLDivElement>{
 const {preferences}=useExperience();
 const current=useRef({period,view,onMove,quiet:preferences.quiet});
 const gesture=useRef<Gesture|null>(null),departure=useRef<Departure|null>(null);
 const animations=useRef<Animation[]>([]),ghost=useRef<HTMLElement|null>(null),frame=useRef(0),offset=useRef(0),suppressClick=useRef(0),pendingTap=useRef<ReturnType<typeof setTimeout>|null>(null);
 const quiet=()=>current.current.quiet||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const cancelTap=()=>{if(pendingTap.current!==null){clearTimeout(pendingTap.current);pendingTap.current=null;}};
 const clearMotion=()=>{
  cancelAnimationFrame(frame.current);frame.current=0;offset.current=0;
  animations.current.forEach(animation=>animation.cancel());animations.current=[];
  ghost.current?.remove();ghost.current=null;
  const node=target.current;if(node){node.style.removeProperty('transform');node.style.removeProperty('will-change');delete node.dataset.paging;}
 };
 const animate=(node:HTMLElement,from:number,to:number,duration:number)=>node.animate([{transform:`translate3d(${from}px,0,0)`},{transform:`translate3d(${to}px,0,0)`}],{duration,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'});
 const watch=(running:Animation[])=>{animations.current=running;void Promise.all(running.map(animation=>animation.finished)).then(()=>{if(animations.current===running)clearMotion();}).catch(()=>{});};
 const returnHome=()=>{
  const node=target.current,start=offset.current;clearMotion();
  if(node&&start&&!quiet()){node.dataset.paging='settling';node.style.willChange='transform';watch([animate(node,start,0,300)]);}
 };
 const move=(direction:number,velocity=0)=>{
  const node=target.current;if(!node||departure.current)return;
  const start=offset.current,width=node.getBoundingClientRect().width;
  const snapshot=!quiet()?node.cloneNode(true) as HTMLElement:null;
  clearMotion();
  if(snapshot){
   snapshot.style.removeProperty('transform');snapshot.style.removeProperty('will-change');delete snapshot.dataset.paging;
   snapshot.removeAttribute('id');snapshot.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
   departure.current={period:current.current.period,view:current.current.view,direction,offset:start,width,velocity,page:snapshot,scroll:Array.from(node.querySelectorAll<HTMLElement>('[data-calendar-scroll]'),el=>el.scrollTop)};
   // Keep the release position until React commits the next period, without a one-frame jump.
   node.style.transform=`translate3d(${start}px,0,0)`;
  }
  current.current.onMove(direction);
 };
 useLayoutEffect(()=>{
  current.current={period,view,onMove,quiet:preferences.quiet};
  const outgoing=departure.current,node=target.current;
  if(!enabled||quiet()){departure.current=null;clearMotion();return;}
  if(!outgoing)return;
  if(outgoing.period===period&&outgoing.view===view)return;
  departure.current=null;clearMotion();
  if(!node?.parentElement||outgoing.view!==view||!node.animate)return;
  const page=outgoing.page;page.classList.add('calendar-motion-snapshot');page.setAttribute('aria-hidden','true');page.inert=true;
  node.parentElement.appendChild(page);ghost.current=page;
  page.querySelectorAll<HTMLElement>('[data-calendar-scroll]').forEach((el,index)=>{el.scrollTop=outgoing.scroll[index]||0;});
  node.style.willChange='transform';node.dataset.paging='settling';
  const incoming=outgoing.offset+outgoing.direction*outgoing.width;
  const duration=settleDuration(incoming,outgoing.velocity);
  watch([animate(node,incoming,0,duration),animate(page,outgoing.offset,-outgoing.direction*outgoing.width,duration)]);
 },[period,view,enabled,preferences.quiet,onMove]);
 useEffect(()=>{
  const node=target.current?.parentElement;if(!enabled||!node)return;
  let distance=0,last=0,changed=false;
  const wheel=(event:WheelEvent)=>{
   if(event.ctrlKey||event.metaKey||gesture.current)return;
   if(Math.abs(event.deltaX)<=Math.abs(event.deltaY)*1.4){distance=0;return;}
   event.preventDefault();cancelTap();const now=performance.now();
   if(now-last>260){distance=0;changed=false;}last=now;if(changed)return;
   const scale=event.deltaMode===1?16:event.deltaMode===2?node.clientWidth:1;distance+=event.deltaX*scale;
   if(Math.abs(distance)>=80){changed=true;move(distance>0?1:-1);}
  };
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const cancel=()=>{gesture.current=null;departure.current=null;cancelTap();clearMotion();};
  const visibility=()=>{if(document.hidden)cancel();};
  node.addEventListener('wheel',wheel,{passive:false});reduce.addEventListener('change',cancel);window.addEventListener('resize',cancel);document.addEventListener('visibilitychange',visibility);
  return()=>{node.removeEventListener('wheel',wheel);reduce.removeEventListener('change',cancel);window.removeEventListener('resize',cancel);document.removeEventListener('visibilitychange',visibility);cancel();};
 },[target,enabled,view]);
 if(!enabled)return {};
 return {
  onDragStart:event=>event.preventDefault(),
  onPointerDown:event=>{
   cancelTap();if(!event.isPrimary){gesture.current=null;returnHome();return;}if(event.button!==0)return;
   if((event.target as Element).closest('input,textarea,select,[contenteditable=true]'))return;
   clearMotion();suppressClick.current=0;
   gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,axis:null,width:event.currentTarget.clientWidth,samples:[{x:event.clientX,t:performance.now()}]};
  },
  onPointerMove:event=>{
   const active=gesture.current;if(!active||active.id!==event.pointerId)return;
   const x=event.clientX-active.x,y=event.clientY-active.y;
   if(!active.axis&&Math.max(Math.abs(x),Math.abs(y))>=10){
    if(Math.abs(x)>Math.abs(y)*1.35){active.axis='x';event.currentTarget.setPointerCapture(event.pointerId);}
    else if(Math.abs(y)>Math.abs(x)*1.15)active.axis='y';
   }
   if(active.axis!=='x')return;
   event.preventDefault();const now=performance.now();active.samples=active.samples.filter(sample=>now-sample.t<120);active.samples.push({x:event.clientX,t:now});
   if(quiet())return;
   offset.current=Math.max(-active.width*.96,Math.min(active.width*.96,x));
   if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;const node=target.current;if(node){node.style.transform=`translate3d(${offset.current}px,0,0)`;node.style.willChange='transform';node.dataset.paging='dragging';}});
  },
  onPointerUp:event=>{
   const active=gesture.current;if(!active||active.id!==event.pointerId)return;gesture.current=null;
   const x=event.clientX-active.x,y=event.clientY-active.y;
   if(active.axis!=='x'){
    // Native click gets first priority. Some Android/Chromium versions omit it after a captured swipe.
    if(!active.axis&&event.pointerType==='touch'&&Math.hypot(x,y)<10){
     const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button'):null;
     if(button)pendingTap.current=setTimeout(()=>{pendingTap.current=null;if(button.isConnected&&!button.disabled&&target.current?.contains(button))button.click();},400);
    }return;
   }
   suppressClick.current=Date.now()+400;
   const velocity=releaseVelocity(active.samples,performance.now()),direction=pageIntent(x,velocity,active.width);
   if(direction)move(direction,velocity);else returnHome();
  },
  onPointerCancel:()=>{gesture.current=null;cancelTap();returnHome();},
  onLostPointerCapture:event=>{if(event.target===event.currentTarget&&gesture.current){gesture.current=null;returnHome();}},
  onPointerLeave:event=>{if(!event.currentTarget.hasPointerCapture(event.pointerId)){gesture.current=null;returnHome();}},
  onClickCapture:event=>{cancelTap();if(event.detail>0&&Date.now()<suppressClick.current){event.preventDefault();event.stopPropagation();}}
 };
}

import {useEffect,useLayoutEffect,useRef,type HTMLAttributes,type RefObject} from 'react';
import {flushSync} from 'react-dom';
import {useExperience} from './Experience';
import {pageIntent,releaseVelocity,settleDuration,type PointerSample} from './paging-physics';
type Gesture={id:number;x:number;y:number;axis:'x'|'y'|null;width:number;samples:PointerSample[]};
/** Adjacent content moves with the finger. Commit only after settling, without an empty frame. */
export function useCalendarPager(target:RefObject<HTMLDivElement|null>,period:string,view:string,onMove:(delta:number)=>void,enabled=true):HTMLAttributes<HTMLDivElement>{
 const {preferences}=useExperience(),current=useRef({period,view,onMove,quiet:preferences.quiet});
 const gesture=useRef<Gesture|null>(null),animation=useRef<Animation|null>(null),pending=useRef(0),frame=useRef(0),offset=useRef(0),suppressClick=useRef(0),pendingTap=useRef<ReturnType<typeof setTimeout>|null>(null);
 const quiet=()=>current.current.quiet||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const cancelTap=()=>{if(pendingTap.current!==null){clearTimeout(pendingTap.current);pendingTap.current=null;}};
 const clearMotion=()=>{cancelAnimationFrame(frame.current);frame.current=0;offset.current=0;pending.current=0;animation.current?.cancel();animation.current=null;const node=target.current;if(node){node.style.removeProperty('transform');node.style.removeProperty('will-change');delete node.dataset.paging;}};
 const commit=()=>{const direction=pending.current;clearMotion();if(direction)flushSync(()=>current.current.onMove(direction));};
 const settle=(to:number,direction:number,velocity=0)=>{
  const node=target.current,start=offset.current;clearMotion();if(!node)return;
  pending.current=direction;
  if(quiet()||!node.animate){commit();return;}
  node.dataset.paging='settling';node.style.willChange='transform';
  const motion=node.animate([{transform:`translate3d(${start}px,0,0)`},{transform:`translate3d(${to}px,0,0)`}],{duration:direction?settleDuration(to-start,velocity):260,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'});animation.current=motion;
  void motion.finished.then(()=>{if(animation.current===motion)commit();}).catch(()=>{});
 };
 const returnHome=()=>settle(0,0);
 const move=(direction:number,velocity=0)=>{if(pending.current)commit();const node=target.current;if(node)settle(-direction*node.clientWidth,direction,velocity);};
 useLayoutEffect(()=>{const changed=current.current.period!==period||current.current.view!==view;current.current={period,view,onMove,quiet:preferences.quiet};if(changed||!enabled){gesture.current=null;clearMotion();}},[period,view,onMove,enabled,preferences.quiet]);
 useEffect(()=>{
  const node=target.current?.parentElement;if(!enabled||!node)return;
  let distance=0,last=0,changed=false;
  const wheel=(event:WheelEvent)=>{if(event.ctrlKey||event.metaKey||gesture.current)return;if(Math.abs(event.deltaX)<=Math.abs(event.deltaY)*1.4){distance=0;return;}event.preventDefault();cancelTap();const now=performance.now();if(now-last>260){distance=0;changed=false;}last=now;if(changed)return;const scale=event.deltaMode===1?16:event.deltaMode===2?node.clientWidth:1;distance+=event.deltaX*scale;if(Math.abs(distance)>=80){changed=true;move(distance>0?1:-1);}};
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const cancel=()=>{gesture.current=null;cancelTap();clearMotion();};
  const visibility=()=>{if(document.hidden)cancel();};
  const preference=()=>{if(quiet())cancel();};
  const observer=new MutationObserver(preference);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
  node.addEventListener('wheel',wheel,{passive:false});reduce.addEventListener('change',cancel);window.addEventListener('resize',cancel);document.addEventListener('visibilitychange',visibility);
  return()=>{observer.disconnect();node.removeEventListener('wheel',wheel);reduce.removeEventListener('change',cancel);window.removeEventListener('resize',cancel);document.removeEventListener('visibilitychange',visibility);cancel();};
 },[target,enabled,view]);
 if(!enabled)return {};
 return {
  onDragStart:event=>event.preventDefault(),
  onPointerDown:event=>{cancelTap();if(!event.isPrimary){gesture.current=null;returnHome();return;}if(event.button!==0||(event.target as Element).closest('input,textarea,select,[contenteditable=true]'))return;if(pending.current)commit();else clearMotion();suppressClick.current=0;gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,axis:null,width:event.currentTarget.clientWidth,samples:[{x:event.clientX,t:performance.now()}]};},
  onPointerMove:event=>{const active=gesture.current;if(!active||active.id!==event.pointerId)return;const x=event.clientX-active.x,y=event.clientY-active.y;if(!active.axis&&Math.max(Math.abs(x),Math.abs(y))>=10){if(Math.abs(x)>Math.abs(y)*1.35){active.axis='x';event.currentTarget.setPointerCapture(event.pointerId);}else if(Math.abs(y)>Math.abs(x)*1.15)active.axis='y';}if(active.axis!=='x')return;event.preventDefault();const now=performance.now();active.samples=active.samples.filter(sample=>now-sample.t<120);active.samples.push({x:event.clientX,t:now});if(quiet())return;offset.current=Math.max(-active.width,Math.min(active.width,x));if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;const node=target.current;if(node){node.style.transform=`translate3d(${offset.current}px,0,0)`;node.style.willChange='transform';node.dataset.paging='dragging';}});},
  onPointerUp:event=>{const active=gesture.current;if(!active||active.id!==event.pointerId)return;gesture.current=null;const x=event.clientX-active.x,y=event.clientY-active.y;if(active.axis!=='x'){
   // Native click takes priority. Only recover a genuinely missing Android compatibility click.
   if(!active.axis&&event.pointerType==='touch'&&Math.hypot(x,y)<10){const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button'):null;if(button)pendingTap.current=setTimeout(()=>{pendingTap.current=null;if(button.isConnected&&!button.disabled&&target.current?.contains(button)&&!button.closest('[inert]'))button.click();},400);}return;}
   suppressClick.current=Date.now()+400;const velocity=releaseVelocity(active.samples,performance.now()),direction=pageIntent(x,velocity,active.width);if(direction)move(direction,velocity);else returnHome();},
  onPointerCancel:()=>{gesture.current=null;cancelTap();returnHome();},
  onLostPointerCapture:event=>{if(event.target===event.currentTarget&&gesture.current){gesture.current=null;returnHome();}},
  onPointerLeave:event=>{if(gesture.current?.id===event.pointerId&&!event.currentTarget.hasPointerCapture(event.pointerId)){gesture.current=null;returnHome();}},
  onClickCapture:event=>{cancelTap();if(event.detail>0&&Date.now()<suppressClick.current){event.preventDefault();event.stopPropagation();}}
 };
}

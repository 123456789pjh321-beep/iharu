import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {PullRefreshGesture,pullRefreshThreshold} from './pull-refresh-physics';
type Phase='idle'|'pulling'|'armed'|'refreshing'|'settling';
/** One scroll owner, one request, and at most one transform write per animation frame. */
export function usePullToRefresh(onRefresh:()=>Promise<void>,enabled:boolean){
 const [node,setNode]=useState<HTMLDivElement|null>(null),[phase,setPhase]=useState<Phase>('idle');
 const latest=useRef({onRefresh,enabled});
 useLayoutEffect(()=>{latest.current={onRefresh,enabled};},[onRefresh,enabled]);
 const ref=useCallback((value:HTMLDivElement|null)=>setNode(value),[]);
 useEffect(()=>{
  if(!node)return;
  const main=node.closest<HTMLElement>('#auth-main');if(!main)return;
  const scroll=node.closest<HTMLElement>('[data-timetree] .auth-panel')||main;
  const gesture=new PullRefreshGesture();let currentPhase:Phase='idle',alive=true,busy=false,pointer:number|null=null,raf=0,timer:ReturnType<typeof setTimeout>|undefined,offset=0;
  const quiet=()=>document.documentElement.dataset.motion==='reduced'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage=(value:Phase)=>{if(!alive||value===currentPhase)return;currentPhase=value;node.dataset.pullPhase=value;setPhase(value);};
  const draw=(value:number)=>{offset=value;if(!raf)raf=requestAnimationFrame(()=>{raf=0;node.style.setProperty('--pull-offset',offset+'px');node.style.setProperty('--pull-progress',String(Math.min(1,offset/pullRefreshThreshold)));});};
  const reset=()=>{if(!alive)return;busy=false;stage('idle');draw(0);};
  const home=()=>{gesture.cancel();if(busy)return;stage('settling');draw(0);clearTimeout(timer);timer=setTimeout(reset,quiet()?0:260);};
  const run=async()=>{
   if(busy)return;if(!latest.current.enabled){home();return;}busy=true;stage('refreshing');draw(48);const began=performance.now();
   try{await latest.current.onRefresh();}catch{/* The page owns its accessible error notice. */}
   finally{if(alive){timer=setTimeout(()=>{stage('settling');draw(0);timer=setTimeout(reset,quiet()?0:260);},Math.max(0,(quiet()?0:320)-(performance.now()-began)));}}
  };
  const allowed=(target:EventTarget|null)=>{
   if(busy||!latest.current.enabled||document.querySelector('dialog[open]'))return false;
   const el=target instanceof Element?target:null;if(!el||el.closest('button,a,input,textarea,select,[contenteditable=true],[role=tablist]'))return false;
   for(let current=el;current&&current!==scroll;current=current.parentElement!){if(current!==node&&/(auto|scroll)/.test(getComputedStyle(current).overflowY)&&current.scrollHeight>current.clientHeight+1)return false;}
   return window.getSelection()?.isCollapsed!==false;
  };
  const begin=(x:number,y:number,target:EventTarget|null,contacts=1)=>{if(!busy){clearTimeout(timer);stage('idle');draw(0);}gesture.begin(x,y,scroll.scrollTop,allowed(target),contacts);};
  const move=(x:number,y:number,event:Event,contacts=1)=>{
   if(busy)return;if(gesture.move(x,y,scroll.scrollTop,contacts)){if(!event.cancelable){home();return;}event.preventDefault();stage(gesture.armed?'armed':'pulling');draw(gesture.offset);}else if(offset)home();
  };
  const end=()=>{if(busy)return;const refresh=gesture.release();if(refresh)void run();else home();};
  const touchStart=(e:TouchEvent)=>{const t=e.touches[0];if(t)begin(t.clientX,t.clientY,e.target,e.touches.length);};
  const touchMove=(e:TouchEvent)=>{const t=e.touches[0];if(t)move(t.clientX,t.clientY,e,e.touches.length);};
  const cancel=()=>{pointer=null;gesture.cancel();if(!busy)home();};
  const pointerDown=(e:PointerEvent)=>{if(e.pointerType==='touch'||e.button!==0||!e.isPrimary)return;pointer=e.pointerId;begin(e.clientX,e.clientY,e.target);};
  const pointerMove=(e:PointerEvent)=>{if(pointer===e.pointerId)move(e.clientX,e.clientY,e);};
  const pointerUp=(e:PointerEvent)=>{if(pointer===e.pointerId){pointer=null;end();}};
  const key=(e:KeyboardEvent)=>{if(e.altKey&&!e.ctrlKey&&!e.metaKey&&e.key.toLowerCase()==='r'&&latest.current.enabled&&!busy){e.preventDefault();void run();}};
  const visibility=()=>{if(document.hidden)cancel();};
  node.addEventListener('touchstart',touchStart,{passive:true});node.addEventListener('touchmove',touchMove,{passive:false});node.addEventListener('touchend',end);node.addEventListener('touchcancel',cancel);
  node.addEventListener('pointerdown',pointerDown);window.addEventListener('pointermove',pointerMove,{passive:false});window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',cancel);main.addEventListener('keydown',key);window.addEventListener('resize',cancel);document.addEventListener('visibilitychange',visibility);
  return()=>{alive=false;clearTimeout(timer);cancelAnimationFrame(raf);node.style.removeProperty('--pull-offset');node.style.removeProperty('--pull-progress');delete node.dataset.pullPhase;node.removeEventListener('touchstart',touchStart);node.removeEventListener('touchmove',touchMove);node.removeEventListener('touchend',end);node.removeEventListener('touchcancel',cancel);node.removeEventListener('pointerdown',pointerDown);window.removeEventListener('pointermove',pointerMove);window.removeEventListener('pointerup',pointerUp);window.removeEventListener('pointercancel',cancel);main.removeEventListener('keydown',key);window.removeEventListener('resize',cancel);document.removeEventListener('visibilitychange',visibility);};
 },[node]);
 return {ref,phase};
}

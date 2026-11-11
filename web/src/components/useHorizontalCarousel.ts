import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {carouselIndex,carouselStep,HorizontalCarouselDrag} from './horizontal-carousel-physics';
const reducedMotion=()=>document.documentElement.dataset.motion==='reduced'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Native scroll snap handles touch, trackpad inertia, vertical panning and pinch zoom. */
export function useHorizontalCarousel(count:number){
 const [node,setNode]=useState<HTMLDivElement|null>(null),[index,setIndex]=useState(0),current=useRef(0);
 const ref=useCallback((value:HTMLDivElement|null)=>setNode(value),[]);
 const goTo=useCallback((value:number)=>{if(!node)return;const next=carouselStep(0,value,count);node.scrollTo({left:next*node.clientWidth,behavior:reducedMotion()?'auto':'smooth'});},[node,count]);
 const move=useCallback((step:number)=>goTo(carouselStep(current.current,step,count,true)),[count,goTo]);
 useLayoutEffect(()=>{const next=carouselStep(0,current.current,count);current.current=next;setIndex(next);if(node)node.scrollTo({left:next*node.clientWidth,behavior:'auto'});},[node,count]);
 useEffect(()=>{
  if(!node)return;const drag=new HorizontalCarouselDrag();let pointer:number|null=null,raf=0;
  const read=()=>{raf=0;const next=carouselIndex(node.scrollLeft,node.clientWidth,count);if(next!==current.current){current.current=next;setIndex(next);}};
  const scroll=()=>{if(!raf)raf=requestAnimationFrame(read);};
  const clear=()=>{const id=pointer;pointer=null;delete node.dataset.dragging;if(id!==null&&node.hasPointerCapture(id))node.releasePointerCapture(id);};
  const down=(event:PointerEvent)=>{if(count<2||event.pointerType!=='mouse'||event.button!==0||!event.isPrimary||window.getSelection()?.isCollapsed===false)return;pointer=event.pointerId;drag.begin(event.clientX,event.clientY,node.scrollLeft,node.clientWidth,count);};
  const pointerMove=(event:PointerEvent)=>{
   if(pointer!==event.pointerId)return;const left=drag.move(event.clientX,event.clientY);if(left===null)return;
   if(!node.dataset.dragging){node.dataset.dragging='true';node.setPointerCapture(event.pointerId);}event.preventDefault();node.scrollLeft=left;
  };
  const up=(event:PointerEvent)=>{if(pointer!==event.pointerId)return;const next=drag.finish();clear();if(next!==null)goTo(next);};
  const cancel=()=>{const active=drag.active;drag.cancel();clear();if(active)node.scrollTo({left:carouselIndex(node.scrollLeft,node.clientWidth,count)*node.clientWidth,behavior:'auto'});};
  const resize=()=>{cancel();node.scrollTo({left:current.current*node.clientWidth,behavior:'auto'});};
  const visibility=()=>{if(document.hidden)cancel();};
  const observer=new ResizeObserver(resize);observer.observe(node);
  node.addEventListener('scroll',scroll,{passive:true});node.addEventListener('pointerdown',down);window.addEventListener('pointermove',pointerMove,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);document.addEventListener('visibilitychange',visibility);
  return()=>{observer.disconnect();cancelAnimationFrame(raf);drag.cancel();clear();node.removeEventListener('scroll',scroll);node.removeEventListener('pointerdown',down);window.removeEventListener('pointermove',pointerMove);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);document.removeEventListener('visibilitychange',visibility);};
 },[node,count,goTo]);
 return {ref,index,goTo,move};
}

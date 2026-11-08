import {useEffect,useLayoutEffect,useRef,type HTMLAttributes,type RefObject} from 'react';

type Gesture={id:number;x:number;y:number;axis:'x'|'y'|null};

/** Reserve horizontal gestures for day navigation; vertical scrolling stays native. */
export function useDaySwipe(target:RefObject<HTMLDivElement|null>,onMove:(delta:number)=>void,onTap?:(target:EventTarget)=>boolean,enabled=true):HTMLAttributes<HTMLDivElement>{
 const gesture=useRef<Gesture|null>(null),suppressClick=useRef(0),move=useRef(onMove),tap=useRef(onTap);
 useLayoutEffect(()=>{move.current=onMove;tap.current=onTap;},[onMove,onTap]);
 useEffect(()=>{
  const node=target.current;if(!enabled||!node)return;
  let distance=0,last=0,changed=false;
  const wheel=(event:WheelEvent)=>{
   if(event.ctrlKey||event.metaKey||gesture.current)return;
   if(Math.abs(event.deltaX)<=Math.abs(event.deltaY)*1.4){distance=0;return;}
   // A non-passive listener keeps the browser's horizontal history gesture out.
   event.preventDefault();
   const now=performance.now();
   if(now-last>260){distance=0;changed=false;}
   last=now;
   if(changed)return;
   const scale=event.deltaMode===1?16:event.deltaMode===2?node.clientWidth:1;
   distance+=event.deltaX*scale;
   if(Math.abs(distance)>=80){changed=true;move.current(distance>0?1:-1);}
  };
  node.addEventListener('wheel',wheel,{passive:false});
  return()=>node.removeEventListener('wheel',wheel);
 },[target,enabled]);
 if(!enabled)return {};
 return {
  onDragStart:event=>event.preventDefault(),
  onPointerDown:event=>{
   if(!event.isPrimary){gesture.current=null;return;}
   if(event.button!==0)return;
   suppressClick.current=0;
   gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,axis:null};
  },
  onPointerMove:event=>{
   const current=gesture.current;if(!current||current.id!==event.pointerId)return;
   const x=Math.abs(event.clientX-current.x),y=Math.abs(event.clientY-current.y);
   if(!current.axis&&Math.max(x,y)>=12){
    if(x>y*1.4){current.axis='x';event.currentTarget.setPointerCapture(event.pointerId);}
    else if(y>x*1.2)current.axis='y';
   }
   if(current.axis==='x')event.preventDefault();
  },
  onPointerUp:event=>{
   const current=gesture.current;if(!current||current.id!==event.pointerId)return;
   gesture.current=null;
   const x=event.clientX-current.x,y=event.clientY-current.y;
   if(current.axis!=='x'){
    // Some touch browsers omit the compatibility click immediately after a swipe.
    if(!current.axis&&event.pointerType==='touch'&&Math.hypot(x,y)<12&&tap.current?.(event.target))suppressClick.current=Date.now()+400;
    return;
   }
   suppressClick.current=Date.now()+400;
   if(Math.abs(x)>=56&&Math.abs(x)>Math.abs(y)*1.25)move.current(x<0?1:-1);
  },
  onPointerCancel:()=>{gesture.current=null;},
  onLostPointerCapture:event=>{if(event.target===event.currentTarget)gesture.current=null;},
  onPointerLeave:event=>{if(!event.currentTarget.hasPointerCapture(event.pointerId))gesture.current=null;},
  onClickCapture:event=>{
   // Keyboard activation is unaffected; a new intentional pointer-down resets this.
   if(event.detail>0&&Date.now()<suppressClick.current){event.preventDefault();event.stopPropagation();}
  }
 };
}

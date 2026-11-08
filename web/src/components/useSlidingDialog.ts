import {useCallback,useEffect,useRef,useState} from 'react';

const quiet=()=>document.documentElement.dataset.motion==='reduced'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Keep the native modal/focus boundary alive until the outgoing surface is off screen. */
export function useSlidingDialog(){
 const ref=useRef<HTMLDialogElement>(null),motion=useRef<Animation|null>(null),mounted=useRef(false),leaving=useRef(false);
 const [closing,setClosing]=useState(false);
 useEffect(()=>{
  const node=ref.current,previous=document.activeElement as HTMLElement|null;
  if(!node)return;
  mounted.current=true;leaving.current=false;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  node.showModal();
  if(!quiet()&&!document.hidden&&node.animate){
   const animation=node.animate([{transform:`translateY(${window.innerHeight}px)`},{transform:'translateY(0)'}],{duration:280,easing:'cubic-bezier(.22,1,.36,1)'});
   motion.current=animation;
   void animation.finished.catch(()=>{}).finally(()=>{if(motion.current===animation)motion.current=null;});
  }
  const settle=()=>{if(quiet()||document.hidden)motion.current?.finish();};
  const observer=new MutationObserver(settle);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
  reduced.addEventListener('change',settle);document.addEventListener('visibilitychange',settle);
  return()=>{mounted.current=false;observer.disconnect();motion.current?.cancel();motion.current=null;reduced.removeEventListener('change',settle);document.removeEventListener('visibilitychange',settle);node.close();if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[]);
 const closeWithAnimation=useCallback(async(afterClose:()=>void|Promise<void>)=>{
  const node=ref.current;if(!node||!mounted.current||leaving.current)return;
  leaving.current=true;setClosing(true);
  const from=getComputedStyle(node).transform;
  motion.current?.cancel();motion.current=null;
  if(!quiet()&&!document.hidden&&node.animate){
   const animation=node.animate([{transform:from==='none'?'translateY(0)':from},{transform:`translateY(${window.innerHeight}px)`}],{duration:220,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
   motion.current=animation;
   await animation.finished.catch(()=>{});
  }
  if(mounted.current)await afterClose();
 },[]);
 return {ref,closing,closeWithAnimation};
}

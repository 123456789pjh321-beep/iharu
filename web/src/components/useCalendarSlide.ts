import {useEffect,useLayoutEffect,useRef,type RefObject} from 'react';
import {useExperience} from './Experience';

/** Keep the live calendar mounted; the outgoing page is visual-only and inert. */
export function useCalendarSlide(grid:RefObject<HTMLDivElement|null>,period:string,view:string){
 const {preferences}=useExperience();
 const previous=useRef<{period:string;view:string;page:HTMLElement}|null>(null);
 const active=useRef<{animations:Animation[];page:HTMLElement}|null>(null);
 const stop=()=>{const current=active.current;active.current=null;if(current){current.animations.forEach(a=>a.cancel());current.page.remove();}};
 useEffect(()=>{
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const changed=()=>{if(preference.matches)stop();};
  preference.addEventListener('change',changed);
  return()=>{preference.removeEventListener('change',changed);stop();previous.current=null;};
 },[]);
 useLayoutEffect(()=>{
  const node=grid.current,viewport=node?.parentElement;if(!node||!viewport)return;
  const before=previous.current;
  previous.current={period,view,page:node.cloneNode(true) as HTMLElement};
  if(preferences.quiet){stop();return;}
  if(!before||before.period===period&&before.view===view)return;
  stop();
  if(before.view!==view||window.matchMedia('(prefers-reduced-motion: reduce)').matches||!node.animate)return;
  const direction=period>before.period?1:-1,outgoing=before.page;
  outgoing.className='calendar-motion-snapshot';
  outgoing.setAttribute('aria-hidden','true');outgoing.inert=true;
  viewport.appendChild(outgoing);
  const scrollSources=node.querySelectorAll<HTMLElement>('[data-calendar-scroll]');
  outgoing.querySelectorAll<HTMLElement>('[data-calendar-scroll]').forEach((target,index)=>{const source=scrollSources[index];if(source){target.scrollTop=source.scrollTop;target.scrollLeft=source.scrollLeft;}});
  const timing={duration:280,easing:'cubic-bezier(.22,.61,.36,1)'};
  const animations=[
   node.animate([{transform:`translateX(${direction*100}%)`},{transform:'translateX(0)'}],timing),
   outgoing.animate([{transform:'translateX(0)'},{transform:`translateX(${-direction*100}%)`}],{...timing,fill:'forwards'})
  ];
  const transition={animations,page:outgoing};active.current=transition;
  void Promise.all(animations.map(a=>a.finished)).then(()=>{if(active.current===transition)stop();}).catch(()=>{});
 });
}

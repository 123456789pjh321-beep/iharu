import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {useExperience} from './Experience';

/** Animate the first ready content, including lazy/API routes, without delaying navigation. */
export function RouteEffects(){
 const {pathname}=useLocation(),{preferences}=useExperience();
 useEffect(()=>{
  const root=document.documentElement;
  let animation:Animation|undefined,frame=0,finished=false;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const measure=()=>{
   const header=document.querySelector<HTMLElement>('.topbar,.auth-header');
   const banner=document.querySelector<HTMLElement>('.test-environment-banner,.test-entry-banner,.demo-bar');
   const bottom=Math.max(header?.getBoundingClientRect().bottom||76,banner?.getBoundingClientRect().bottom||0);
   root.style.setProperty('--workspace-top',`${Math.ceil(bottom+16)}px`);
  };
  const resize=new ResizeObserver(measure);
  const observed=new Set<Element>();
  const inspect=()=>{
   for(const el of document.querySelectorAll('.topbar,.auth-header,.test-environment-banner,.test-entry-banner,.demo-bar')){
    if(!observed.has(el)){observed.add(el);resize.observe(el);}
   }
   measure();
   if(finished)return;
   const main=document.querySelector<HTMLElement>('main');
   if(!main||main.querySelector('.loading-state')||!main.querySelector('h1,h2,form'))return;
   finished=true;
   if(!preferences.quiet&&!reduced.matches){
    // Animate content only: fixed headers, popovers and navigation keep their geometry.
    const content=main.querySelector<HTMLElement>(':scope > .auth-panel,:scope > div')||main;
    animation=content.animate([{opacity:.4,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'cubic-bezier(.22,1,.36,1)'});
   }
   document.querySelectorAll<HTMLElement>('.subnav,.test-subnav').forEach(nav=>{
    const active=nav.querySelector<HTMLElement>('[aria-current="page"],.active');
    if(active)nav.scrollTo({left:Math.max(0,active.offsetLeft-nav.offsetLeft-16),behavior:'instant'});
   });
  };
  const queue=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(inspect);};
  const observer=new MutationObserver(queue);
  observer.observe(document.getElementById('root')!,{childList:true,subtree:true});
  const cancel=()=>{if(reduced.matches)animation?.cancel();};
  reduced.addEventListener('change',cancel);
  window.addEventListener('resize',queue,{passive:true});queue();
  return()=>{observer.disconnect();resize.disconnect();cancelAnimationFrame(frame);animation?.cancel();reduced.removeEventListener('change',cancel);window.removeEventListener('resize',queue);root.style.removeProperty('--workspace-top');};
 },[pathname,preferences.quiet]);
 return null;
}

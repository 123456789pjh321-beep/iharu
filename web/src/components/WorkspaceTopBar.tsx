import {createContext,Fragment,useCallback,useContext,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useLocation} from 'react-router-dom';
import './workspace-topbar.css';
import {WorkspaceGroupFilter} from './WorkspaceGroupFilter';

type Slot='toolbar'|'members';
type Entry={owner:symbol;content:ReactNode;active:boolean};
type Bar={identity:string;route:string;toolbar?:Entry;members?:Entry};
const routes=new Set(['/timetable','/calendar','/today/calendar','/tuition','/timeline']);
const routeKey=(path:string)=>path==='/calendar'?'/today/calendar':path;
const Commands=createContext<{
 publish:(route:string,slot:Slot,owner:symbol,content:ReactNode)=>void;
 retire:(route:string,slot:Slot,owner:symbol)=>void;
 targetRef:(node:HTMLDivElement|null)=>void;
}|null>(null);
const State=createContext<{bar:Bar|null;target:HTMLDivElement|null}>({bar:null,target:null});

// Only the chrome is retained. Data requests, filters and actions stay owned by
// the active page; changing menus never mounts hidden pages or background queries.
export function WorkspaceTopBarProvider({identity,children}:{identity:string;children:ReactNode}){
 const [bar,setBar]=useState<Bar|null>(null),[target,targetRef]=useState<HTMLDivElement|null>(null);
 const publish=useCallback((route:string,slot:Slot,owner:symbol,content:ReactNode)=>{
  setBar(old=>({...((old?.identity===identity&&old.route===route)?old:{identity,route}),[slot]:{owner,content,active:true}}));
 },[identity]);
 const retire=useCallback((route:string,slot:Slot,owner:symbol)=>{
  setBar(old=>old?.route===route&&old[slot]?.owner===owner?{...old,[slot]:{...old[slot],active:false}}:old);
 },[]);
 const commands=useMemo(()=>({publish,retire,targetRef}),[publish,retire]);
 return <Commands.Provider value={commands}><State.Provider value={{bar:bar?.identity===identity?bar:null,target}}>{children}</State.Provider></Commands.Provider>;
}

// The destination is a sibling of the scrolling/animated content panel.
export function WorkspaceTopBarMount(){
 const {pathname}=useLocation(),commands=useContext(Commands);
 return commands&&routes.has(pathname)?<div ref={commands.targetRef} className="workspace-topbar" data-workspace-topbar/>:null;
}

// Render from inside the page providers, preserving invitation/login contexts.
export function WorkspaceTopBarHost(){
 const {pathname}=useLocation(),{bar,target}=useContext(State),route=routeKey(pathname);
 const active=routes.has(pathname),pending=!bar||bar.route!==route||!bar.toolbar?.active;
 useLayoutEffect(()=>{
  if(!target)return;
  target.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog=>dialog.close());
  target.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(details=>{details.open=false;});
 },[pathname,target]);
 if(!active||!target)return null;
 return createPortal(<div className="workspace-topbar-content" data-topbar-route={bar?.route} aria-busy={pending} inert={pending}>
  {bar?.toolbar?.content}
  <WorkspaceGroupFilter/>
  <Fragment key={bar?.route}>{bar?.members?.content}</Fragment>
 </div>,target);
}

export function WorkspaceTopBarSlot({slot,children}:{slot:Slot;children:ReactNode}){
 const commands=useContext(Commands),{pathname}=useLocation(),owner=useRef(Symbol(slot));
 const route=routeKey(pathname),enabled=!!commands&&routes.has(pathname);
 useLayoutEffect(()=>{if(enabled)commands.publish(route,slot,owner.current,children);},[enabled,commands,route,slot,children]);
 useLayoutEffect(()=>{
  const token=owner.current;
  return()=>{if(enabled)commands.retire(route,slot,token);};
 },[enabled,commands,route,slot]);
 return enabled?null:<>{children}</>;
}

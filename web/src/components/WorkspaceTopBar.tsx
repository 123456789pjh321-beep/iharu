import {Children,createContext,useCallback,useContext,useId,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useLocation} from 'react-router-dom';
import {sampleGroup} from '../../../shared/guest-samples';
import './workspace-topbar.css';
import {WorkspaceGroupFilter} from './WorkspaceGroupFilter';
import {WorkspaceMembersDialog} from './WorkspaceMembersDialog';
import {useOptionalWorkspaceGate,useWorkspaceGate} from './WorkspaceGate';
import {useEntryAccess} from './EntryAccess';

type Slot='toolbar'|'members'|'groupTrailing'|'actions';
type Entry={owner:symbol;content:ReactNode;active:boolean;groupId:string|null};
type Bar={identity:string;route:string}&Partial<Record<Slot,Entry>>;
type MembersRequest={route:string;ownerId:string|null;groupId:string|null;trigger:HTMLButtonElement};
const toolbarRoutes=new Set(['/timetable','/calendar','/today/calendar','/today/repeats','/tuition','/timeline']);
const routes=new Set([...toolbarRoutes,'/chat','/child/chat']);
const routeKey=(path:string)=>path==='/calendar'?'/today/calendar':path;
const actionSlots=7;
const Commands=createContext<{
 publish:(route:string,slot:Slot,owner:symbol,groupId:string|null,content:ReactNode)=>void;
 retire:(route:string,slot:Slot,owner:symbol)=>void;
 targetRef:(node:HTMLDivElement|null)=>void;
}|null>(null);
const State=createContext<{bar:Bar|null;target:HTMLDivElement|null}>({bar:null,target:null});

// Only the chrome is retained. Data requests, filters and actions stay owned by
// the active page; changing menus never mounts hidden pages or background queries.
export function WorkspaceTopBarProvider({identity,children}:{identity:string;children:ReactNode}){
 const [bar,setBar]=useState<Bar|null>(null),[target,targetRef]=useState<HTMLDivElement|null>(null);
 const publish=useCallback((route:string,slot:Slot,owner:symbol,groupId:string|null,content:ReactNode)=>{
  setBar(old=>({...((old?.identity===identity&&old.route===route)?old:{identity,route}),[slot]:{owner,content,active:true,groupId}}));
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
 return commands&&routes.has(pathname)?<div ref={commands.targetRef} className="workspace-topbar" data-workspace-topbar data-group-only={!toolbarRoutes.has(pathname)||undefined}/>:null;
}

// Render from inside the page providers, preserving invitation/login contexts.
export function WorkspaceTopBarHost(){
 const {pathname}=useLocation(),{bar,target}=useContext(State),{access,groupBusy,sampleGroupSelected}=useWorkspaceGate(),route=routeKey(pathname);
 const {requestLogin}=useEntryAccess();
 const [request,setRequest]=useState<MembersRequest|null>(null),dialogId=useId();
 const withToolbar=toolbarRoutes.has(pathname),ownerId=access.identity?.id??null,group=access.identity?.family;
 const groupId=group?.id??null;
 const pending=groupBusy||access.status==='checking'||(withToolbar&&(!bar||bar.route!==route||!bar.toolbar?.active));
 const memberSlot=bar?.route===route&&bar.members?.active&&bar.members.groupId===groupId?bar.members.content:null;
 const groupTrailing=bar?.route===route&&bar.groupTrailing?.active?bar.groupTrailing.content:null;
 const preview=access.status==='guest';
 const canOpen=preview?sampleGroupSelected&&(!!memberSlot||!withToolbar)
  :!!group&&(!!memberSlot||!withToolbar||route==='/today/repeats');
 const opened=!pending&&canOpen&&request?.route===route&&request.ownerId===ownerId&&request.groupId===groupId?request:null;
 useLayoutEffect(()=>{
  setRequest(null);
  if(!target)return;
  target.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog=>dialog.close());
  target.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(details=>{details.open=false;});
 },[pathname,ownerId,target]);
 if(!routes.has(pathname)||!target)return null;
 return createPortal(<div className="workspace-topbar-content" data-topbar-route={withToolbar?bar?.route:route} aria-busy={pending} inert={pending}>
  {withToolbar&&bar?.toolbar?.content}
  <WorkspaceGroupFilter key={'groups:'+route} preview={preview} dialogId={dialogId} trailing={groupTrailing} onMembers={(selectedId,trigger)=>{
   setRequest({route,ownerId,groupId:selectedId,trigger});
  }}/>
  {opened&&<WorkspaceMembersDialog id={dialogId} groupName={preview?sampleGroup.name:group?.name||''}
   members={preview?sampleGroup.members:group?.members} trigger={opened.trigger} onDismiss={()=>setRequest(null)}
   previewInvite={preview?()=>requestLogin({title:'구성원을 초대하려면 로그인해 주세요'}):undefined}>{memberSlot}</WorkspaceMembersDialog>}
  {route==='/timeline'&&(bar?.route===route&&bar.actions?.active?bar.actions.content:<WorkspaceActionRow/>)}
 </div>,target);
}

function WorkspaceActionRow({label,children}:{label?:string;children?:ReactNode}){
 const actions=Children.toArray(children);
 return <div className="workspace-action-toolbar" data-workspace-actions>
  <div className="workspace-action-grid" role={label?'group':undefined} aria-label={label}>
   {actions}
   {Array.from({length:Math.max(0,actionSlots-actions.length)},(_,index)=>
    <span className="workspace-action-empty" key={'empty-'+index} aria-hidden="true"/>)}
  </div>
 </div>;
}

export function WorkspaceTopBarActions({label,children}:{label:string;children:ReactNode}){
 return <WorkspaceTopBarSlot slot="actions"><WorkspaceActionRow label={label}>{children}</WorkspaceActionRow></WorkspaceTopBarSlot>;
}

export function WorkspaceTopBarSlot({slot,children}:{slot:Slot;children:ReactNode}){
 const commands=useContext(Commands),{pathname}=useLocation(),owner=useRef(Symbol(slot));
 const gate=useOptionalWorkspaceGate(),groupId=gate?.access.identity?.family?.id??null;
 const route=routeKey(pathname),enabled=!!commands&&toolbarRoutes.has(pathname);
 useLayoutEffect(()=>{if(enabled)commands.publish(route,slot,owner.current,groupId,children);},[enabled,commands,route,slot,groupId,children]);
 useLayoutEffect(()=>{
  const token=owner.current;
  return()=>{if(enabled)commands.retire(route,slot,token);};
 },[enabled,commands,route,slot]);
 return enabled||slot==='members'?null:<>{children}</>;
}

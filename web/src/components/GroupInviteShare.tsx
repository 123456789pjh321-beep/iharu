import {createContext,useCallback,useContext,useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {GroupInviteManager} from './GroupInviteManager';
import {Icon} from './Icon';
import {useWorkspaceGate} from './WorkspaceGate';

const shareLabel='그룹 초대 공유';
const memberFilterRoutes=new Set(['/timetable','/today/calendar','/tuition']);
const GroupInviteShareContext=createContext<{dialogId:string;open:()=>void}|null>(null);

export function GroupInviteShareProvider({children}:{children:ReactNode}){
 const {pathname}=useLocation();
 const {access,refreshAccess}=useWorkspaceGate();
 const parent=access.identity?.role==='PARENT'?access.identity:null;
 const dialog=useRef<HTMLDialogElement>(null);
 const dialogId=useId();
 const [lastOpen,setLastOpen]=useState<{profileId:string;count:number}>();
 const route=pathname.toLowerCase().replace(/\/+$/,'');
 const profileId=parent?.id;

 useEffect(()=>{dialog.current?.close();},[pathname,profileId]);

 const refresh=useCallback(async()=>{await refreshAccess();},[refreshAccess]);
 const action=useMemo(()=>profileId?{dialogId,open:()=>{
  setLastOpen(previous=>({profileId,count:(previous?.count??0)+1}));
  dialog.current?.showModal();
  void refresh();
 }}:null,[dialogId,profileId,refresh]);
 return <GroupInviteShareContext.Provider value={action}>
  {parent&&!memberFilterRoutes.has(route)&&<div className="workspace-invite-toolbar"><GroupInviteShareButton showLabel/></div>}
  {children}
  {parent&&<dialog key={parent.id} ref={dialog} id={dialogId} className="group-invite-dialog" aria-labelledby={dialogId+'-title'} onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}}>
   <div className="group-invite-dialog-content">
    <header>
     <h2 id={dialogId+'-title'}>{shareLabel}</h2>
     <button type="button" className="icon-button" aria-label="그룹 초대 닫기" onClick={()=>dialog.current?.close()}><Icon name="close"/></button>
    </header>
    {lastOpen?.profileId===parent.id&&<GroupInviteManager groupOnly canInvite={!parent.family||parent.family.isHost} refresh={refresh} openCount={lastOpen.count}/>}
   </div>
  </dialog>}
 </GroupInviteShareContext.Provider>;
}

export function GroupInviteShareButton({showLabel=false}:{showLabel?:boolean}){
 const action=useContext(GroupInviteShareContext);
 if(!action)return null;
 return <button type="button" className="group-invite-shortcut" aria-label={shareLabel} title={shareLabel} aria-haspopup="dialog" aria-controls={action.dialogId} onClick={action.open}>
  <Icon name="plus"/>{showLabel&&<span>{shareLabel}</span>}
 </button>;
}

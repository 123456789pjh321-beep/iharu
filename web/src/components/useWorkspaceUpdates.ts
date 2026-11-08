import {useCallback,useEffect,useRef,useState} from 'react';
import {workspaceRequest} from '../workspace-api';
import {mergeMenuUpdates,type MenuReceipt,type MenuUpdateState} from '../../../shared/workspace-updates';
export function useWorkspaceUpdates(enabled:boolean,identity:string){
 const [updates,setUpdates]=useState<MenuUpdateState|null>(null),generation=useRef(0),state=useRef<MenuUpdateState|null>(null),pending=useRef(new Set<string>());
 useEffect(()=>{
  const version=++generation.current;state.current=null;setUpdates(null);pending.current.clear();
  if(!enabled)return;
  let active=true,loading=false;
  const refresh=async()=>{
   if(!active||loading||document.hidden||!navigator.onLine)return;loading=true;
   try{const next=await workspaceRequest<MenuUpdateState>('updates.status');if(active){state.current=mergeMenuUpdates(state.current,next);setUpdates(state.current);}}
   catch(error){if(active&&(error as {code?:string}).code==='AUTH_REQUIRED'){state.current=null;setUpdates(null);}}
   finally{loading=false;}
  };
  void refresh();const timer=setInterval(refresh,5000);
  window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{active=false;if(generation.current===version)generation.current++;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[enabled,identity]);
 const markUpdatesRead=useCallback(async(receipt:MenuReceipt|undefined)=>{
  if(!receipt||document.hidden||!navigator.onLine||receipt.revision===0)return;
  if(state.current&&state.current.profileId!==receipt.profileId)return;
  if((state.current?.updates[receipt.menu]?.seen||0)>=receipt.revision)return;
  const key=receipt.profileId+':'+receipt.menu+':'+receipt.revision,version=generation.current;
  if(pending.current.has(key))return;pending.current.add(key);
  try{const next=await workspaceRequest<MenuUpdateState>('updates.read',{profileId:receipt.profileId,menu:receipt.menu,revision:receipt.revision});if(version===generation.current&&next.profileId===receipt.profileId&&(!state.current||state.current.profileId===next.profileId)){state.current=mergeMenuUpdates(state.current,next);setUpdates(state.current);}}
  catch{/* Keep the dot and retry when the content is loaded again. */}
  finally{if(version===generation.current)pending.current.delete(key);}
 },[]);
 return {updates,markUpdatesRead};
}

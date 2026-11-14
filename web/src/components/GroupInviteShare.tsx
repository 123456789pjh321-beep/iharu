import {createContext,useCallback,useContext,useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {workspaceRequest} from '../workspace-api';
import {FormNotice} from './Common';
import {Icon} from './Icon';
import {InviteLinkActions,type IssuedInvite} from './InviteLinkActions';
import {useWorkspaceGate} from './WorkspaceGate';

const shareLabel='그룹 초대 공유';
const issueDescription='새 링크를 만들면 이전 링크는 즉시 폐기됩니다. 유효한 최신 링크로 여러 명을 초대할 수 있어요. 개인 공간의 자료는 공유되지 않으며, 해당 그룹에 등록한 자료만 함께 봅니다.';
const inlineShortcutRoutes=new Set([
 '/timetable','/today/calendar','/tuition','/chat','/child/chat','/timeline','/briefing',
 '/more','/settings','/help','/family','/notification-settings','/admin','/account','/privacy','/account-deletion',
]);
const GroupInviteShareContext=createContext<{dialogId:string;canInvite:boolean;open:()=>void}|null>(null);
type InviteState=
 |{ownerId:string;groupId:string;status:'loading'}
 |{ownerId:string;groupId:string;status:'ready';invite:IssuedInvite}
 |{ownerId:string;groupId:string;status:'error';message:string;code?:string};

export function GroupInviteShareProvider({children}:{children:ReactNode}){
 const {pathname}=useLocation(),navigate=useNavigate();
 const {access,refreshAccess}=useWorkspaceGate();
 const parent=access.identity?.role==='PARENT'?access.identity:null;
 const dialog=useRef<HTMLDialogElement>(null);
 const dialogId=useId();
 const [invite,setInvite]=useState<InviteState>();
 const issuing=useRef<string|null>(null);
 const route=pathname.toLowerCase().replace(/\/+$/,'');
 const profileId=parent?.id;
 const canInvite=!!parent,needsGroup=!parent?.family;
 const groupId=parent?.family?.id,previousGroup=useRef(groupId);
 const current=profileId&&invite?.ownerId===profileId&&invite.groupId===groupId?invite:undefined;

 useEffect(()=>{dialog.current?.close();},[pathname,profileId]);
 useEffect(()=>{if(previousGroup.current&&previousGroup.current!==groupId)dialog.current?.close();previousGroup.current=groupId;},[groupId]);

 const issue=useCallback(async(ownerId:string)=>{
  const targetGroupId=parent?.family?.id;if(!targetGroupId)return;
  const scope=ownerId+':'+targetGroupId;
  if(issuing.current===scope)return;
  issuing.current=scope;
  setInvite({ownerId,groupId:targetGroupId,status:'loading'});
  try{
   // A deliberate click on the labeled shortcut authorizes creating the invitation.
   const link=await workspaceRequest<IssuedInvite>('invite.link.issue',{consent:true,groupId:targetGroupId});
   if(issuing.current!==scope)return;
   setInvite({ownerId,groupId:targetGroupId,status:'ready',invite:link});
   void refreshAccess();
  }catch(e){
   if(issuing.current===scope){
    const error=e as Error&{code?:string};
    setInvite({ownerId,groupId:targetGroupId,status:'error',message:error.message,code:error.code});
   }
  }finally{if(issuing.current===scope)issuing.current=null;}
 },[refreshAccess,parent?.family?.id]);

 const action=useMemo(()=>profileId?{dialogId,open:()=>{
  if(needsGroup){navigate(parent?.groups?.length?'/family':'/family?create=1');return;}
  const node=dialog.current;
  if(!node||node.open)return;
  node.showModal();
  if(canInvite)void issue(profileId);
 },canInvite}:null,[dialogId,profileId,canInvite,issue,navigate,needsGroup,parent?.groups?.length]);
 return <GroupInviteShareContext.Provider value={action}>
  {parent&&!inlineShortcutRoutes.has(route)&&!route.startsWith('/more/')&&!route.startsWith('/legal/')&&<div className="workspace-invite-toolbar"><GroupInviteShareButton/></div>}
  {children}
  {parent&&<dialog key={parent.id} ref={dialog} id={dialogId} className="group-invite-dialog" aria-labelledby={dialogId+'-title'} onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}}>
   <div className="group-invite-dialog-content">
    <header>
     <h2 id={dialogId+'-title'}>{shareLabel}</h2>
     <button type="button" className="icon-button" aria-label="그룹 초대 닫기" onClick={()=>dialog.current?.close()}><Icon name="close"/></button>
    </header>
    {parent.family&&<p className="group-invite-target">{parent.family.name} · 구성원 초대</p>}
    {!canInvite?<p>그룹 초대 링크는 호스트에게 요청해 주세요.</p>:
     current?.status==='ready'?<InviteLinkActions key={current.invite.id} url={current.invite.url} invite={current.invite} shareFallback/>:
     current?.status==='error'?<>
      <FormNotice error={current.code==='INVITE_LIMIT'?'사용 가능한 초대 링크가 20개 있어요. 기존 링크가 사용되거나 만료된 뒤 다시 발급해 주세요.':current.message}/>
      {current.code==='LEGAL_ACCEPTANCE_REQUIRED'?<Link className="button" to="/privacy" onClick={()=>dialog.current?.close()}>개인정보 관리 열기</Link>:
       !['INVITE_LIMIT','HOST_ONLY'].includes(current.code||'')&&<button type="button" className="button" onClick={()=>void issue(profileId!)}>다시 시도</button>}
     </>:<p role="status">그룹 초대 링크를 만들고 있어요.</p>}
   </div>
  </dialog>}
 </GroupInviteShareContext.Provider>;
}

export function GroupInviteShareButton({label}:{label?:string}={}){
 const action=useContext(GroupInviteShareContext);
 const descriptionId=useId();
 if(!action)return null;
 return <>
  <button type="button" className={label?'button primary':'group-invite-shortcut'} aria-label={label||shareLabel} title={action.canInvite?issueDescription:label||shareLabel} aria-haspopup="dialog" aria-controls={action.dialogId} aria-describedby={action.canInvite?descriptionId:undefined} onClick={action.open}>
   {label||<Icon name="plus"/>}
  </button>
  {action.canInvite&&<span className="sr-only" id={descriptionId}>{issueDescription}</span>}
 </>;
}

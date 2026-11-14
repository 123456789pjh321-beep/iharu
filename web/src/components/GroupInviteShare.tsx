import {createContext,useCallback,useContext,useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {workspaceRequest} from '../workspace-api';
import {FormNotice} from './Common';
import {Icon} from './Icon';
import {InviteLinkActions,type IssuedInvite} from './InviteLinkActions';
import {useWorkspaceGate} from './WorkspaceGate';

const shareLabel='그룹 초대 공유';
const issueDescription='이 버튼을 누르면 초대용 링크가 만들어집니다. 초대받은 사람이 수락하면 같은 그룹에서 일정 등 자료를 공유합니다.';
const memberFilterRoutes=new Set(['/timetable','/today/calendar','/tuition']);
const GroupInviteShareContext=createContext<{dialogId:string;canInvite:boolean;open:()=>void;revision:number}|null>(null);
type InviteState=
 |{ownerId:string;status:'loading'}
 |{ownerId:string;status:'ready';invite:IssuedInvite}
 |{ownerId:string;status:'error';message:string;code?:string};

export function GroupInviteShareProvider({children}:{children:ReactNode}){
 const {pathname}=useLocation();
 const {access,refreshAccess}=useWorkspaceGate();
 const parent=access.identity?.role==='PARENT'?access.identity:null;
 const dialog=useRef<HTMLDialogElement>(null);
 const dialogId=useId();
 const [invite,setInvite]=useState<InviteState>();
 const [revision,setRevision]=useState(0);
 const issuing=useRef<string|null>(null);
 const route=pathname.toLowerCase().replace(/\/+$/,'');
 const profileId=parent?.id;
 const canInvite=!!parent&&(!parent.family||parent.family.isHost);
 const current=invite?.ownerId===profileId?invite:undefined;

 useEffect(()=>{dialog.current?.close();},[pathname,profileId]);

 const issue=useCallback(async(ownerId:string)=>{
  if(issuing.current===ownerId)return;
  issuing.current=ownerId;
  setInvite({ownerId,status:'loading'});
  try{
   // A deliberate click on the labeled shortcut authorizes creating the invitation.
   const link=await workspaceRequest<IssuedInvite>('invite.link.issue',{consent:true});
   if(issuing.current!==ownerId)return;
   setInvite({ownerId,status:'ready',invite:link});
   setRevision(value=>value+1);
   void refreshAccess();
  }catch(e){
   if(issuing.current===ownerId){
    const error=e as Error&{code?:string};
    setInvite({ownerId,status:'error',message:error.message,code:error.code});
   }
  }finally{if(issuing.current===ownerId)issuing.current=null;}
 },[refreshAccess]);

 const action=useMemo(()=>profileId?{dialogId,open:()=>{
  const node=dialog.current;
  if(!node||node.open)return;
  node.showModal();
  if(canInvite)void issue(profileId);
 },canInvite,revision}:null,[dialogId,profileId,canInvite,issue,revision]);
 return <GroupInviteShareContext.Provider value={action}>
  {parent&&!memberFilterRoutes.has(route)&&<div className="workspace-invite-toolbar"><GroupInviteShareButton showLabel/></div>}
  {children}
  {parent&&<dialog key={parent.id} ref={dialog} id={dialogId} className="group-invite-dialog" aria-labelledby={dialogId+'-title'} onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}}>
   <div className="group-invite-dialog-content">
    <header>
     <h2 id={dialogId+'-title'}>{shareLabel}</h2>
     <button type="button" className="icon-button" aria-label="그룹 초대 닫기" onClick={()=>dialog.current?.close()}><Icon name="close"/></button>
    </header>
    {!canInvite?<p>그룹 초대 링크는 호스트에게 요청해 주세요.</p>:
     current?.status==='ready'?<InviteLinkActions key={current.invite.id} url={current.invite.url} invite={current.invite} shareFallback/>:
     current?.status==='error'?<>
      <FormNotice error={current.message}/>
      {current.code==='INVITE_LIMIT'?<Link className="button" to="/family">그룹 관리 열기</Link>:
       current.code==='LEGAL_ACCEPTANCE_REQUIRED'?<Link className="button" to="/privacy">개인정보 관리 열기</Link>:
       current.code!=='HOST_ONLY'&&<button type="button" className="button" onClick={()=>void issue(parent.id)}>다시 시도</button>}
     </>:<p role="status">그룹 초대 링크를 만들고 있어요.</p>}
   </div>
  </dialog>}
 </GroupInviteShareContext.Provider>;
}

export function GroupInviteShareButton({showLabel=false}:{showLabel?:boolean}){
 const action=useContext(GroupInviteShareContext);
 const descriptionId=useId();
 if(!action)return null;
 return <>
  <button type="button" className="group-invite-shortcut" aria-label={shareLabel} title={action.canInvite?issueDescription:shareLabel} aria-haspopup="dialog" aria-controls={action.dialogId} aria-describedby={action.canInvite?descriptionId:undefined} onClick={action.open}>
   <Icon name="plus"/>{showLabel&&<span>{shareLabel}</span>}
  </button>
  {action.canInvite&&<span className="sr-only" id={descriptionId}>{issueDescription}</span>}
 </>;
}

export function useGroupInviteRevision(){return useContext(GroupInviteShareContext)?.revision??0;}

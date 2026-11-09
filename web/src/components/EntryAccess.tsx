import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {entryReturnPath,type EntryIntent} from '../../../shared/entry-intent';
import {rememberEntry,forgetEntry} from '../entry-session';
import {sessionSchema} from '../auth';
import {InlineLogin} from '../pages/Login';
import {useWorkspaceGate} from './WorkspaceGate';
import {Icon} from './Icon';

type LoginRequest={intent:EntryIntent;title:string;description:string};
const EntryContext=createContext<{requestLogin:(request?:Partial<LoginRequest>)=>void}|null>(null);
export function useEntryAccess(){const value=useContext(EntryContext);if(!value)throw new Error('ENTRY_ACCESS_REQUIRED');return value;}

export function EntryAccessProvider({children}:{children:ReactNode}){
 const location=useLocation(),navigate=useNavigate(),gate=useWorkspaceGate();
 const [request,setRequest]=useState<LoginRequest|null>(null),[busy,setBusy]=useState(false),dialog=useRef<HTMLDialogElement>(null),completed=useRef(false),historyOpen=useRef(false);
 const open=!!request,signInParam=new URLSearchParams(location.search).get('signin')==='1';
 const requestLogin=useCallback((value:Partial<LoginRequest>={})=>{
  const intent=value.intent||{type:'page',path:entryReturnPath(location.pathname)};
  rememberEntry(intent);completed.current=false;historyOpen.current=false;setBusy(false);
  setRequest({intent,title:value.title||'우리 가족의 하루를 이어보세요',description:value.description||'로그인하면 내 계정에 맞는 기능과 가족 자료를 사용할 수 있어요.'});
  const params=new URLSearchParams(location.search);params.set('signin','1');
  navigate({pathname:location.pathname,search:'?'+params.toString(),hash:location.hash},{state:{...location.state,iharuSignIn:true}});
 },[location,navigate]);
 const dismiss=useCallback(()=>{
  if(busy)return;forgetEntry();setRequest(null);
  if(location.state?.iharuSignIn)navigate(-1);
  else{const params=new URLSearchParams(location.search);params.delete('signin');navigate({pathname:location.pathname,search:params.toString(),hash:location.hash},{replace:true});}
 },[busy,location,navigate]);
 useEffect(()=>{if(!request)return;if(signInParam){historyOpen.current=true;return;}if(historyOpen.current){setRequest(null);if(!completed.current)forgetEntry();}},[signInParam,request]);
 useEffect(()=>{
  const node=dialog.current;if(!node)return;
  const show=()=>{if(open&&!node.open&&!document.getElementById('app-launch'))node.showModal();};
  show();const observer=new MutationObserver(show);if(open)observer.observe(document.body,{childList:true});
  if(!open&&node.open)node.close();return()=>{observer.disconnect();if(node.open)node.close();};
 },[open]);
 const complete=async()=>{
  const response=await fetch('/api/account/session',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.');
  const session=sessionSchema.parse(await response.json());
  const setup=session.authenticated&&(session.assurance==='LOW'||session.emailVerified!==true);
  if(setup){completed.current=true;window.location.assign(session.assurance==='LOW'?'/account':'/account/email');return;}
  if(!setup&&!await gate.refreshAccess())throw new Error('로그인은 완료됐지만 자료 연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  completed.current=true;gate.session.refresh();setBusy(false);setRequest(null);
  const target=entryReturnPath(request?.intent.path);
  if(request?.intent.type!=='create')forgetEntry();
  navigate(target,{replace:true});
 };
 return <EntryContext.Provider value={{requestLogin}}>{children}
  <dialog ref={dialog} className="entry-login-sheet" aria-labelledby="entry-login-title" aria-describedby="entry-login-description" onCancel={event=>{event.preventDefault();dismiss();}} onClick={event=>{if(event.target!==event.currentTarget)return;const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dismiss();}}>
   {request&&<><div className="entry-sheet-grip" aria-hidden="true"/><header className="entry-login-heading"><div><span className="entry-login-eyebrow">iHaru · 로그인</span><h2 id="entry-login-title">{request.title}</h2><p id="entry-login-description">{request.description}</p></div><button type="button" className="icon-button" aria-label="로그인 창 닫기" disabled={busy} onClick={dismiss}><Icon name="close"/></button></header><div className="entry-login-body"><InlineLogin returnTo={request.intent.path} onAuthenticated={complete} onBusy={setBusy}/><p className="entry-login-note">로그인 후 선택한 화면에서 이어서 이용할 수 있어요.</p></div></>}
  </dialog>
 </EntryContext.Provider>;
}

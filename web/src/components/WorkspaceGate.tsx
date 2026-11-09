import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useWorkspaceUpdates} from './useWorkspaceUpdates';
import {adminRequest} from '../admin-api';
import {envelope,healthSchema} from '../../../shared/contracts';
import {sessionSchema} from '../auth';
import {useApi} from '../api';
import {workspaceRequest} from '../workspace-api';
import type {WorkspaceMe} from '../../../shared/workspace';
const healthResponse=envelope(healthSchema);
type WorkspaceAccess={status:'checking'|'guest'|'member'|'restricted'|'error';identity:WorkspaceMe|null;error?:string};
function useGateState(){
 const [workspaceRole,setWorkspaceRole]=useState<'PARENT'|'CHILD'|null>(null);
 const [adminAllowed,setAdminAllowed]=useState(false),[adminLoading,setAdminLoading]=useState(true),[adminError,setAdminError]=useState(''),[adminRevision,setAdminRevision]=useState(0),adminIdentity=useRef('');
 const health=useApi('/api/health',healthResponse),session=useApi('/api/account/session',sessionSchema);
 const [access,setAccess]=useState<WorkspaceAccess>({status:'checking',identity:null}),accessRequest=useRef(0);
 const refreshAccess=useCallback(async()=>{
  const request=++accessRequest.current;
  try{const identity=await workspaceRequest<WorkspaceMe>('me');if(request===accessRequest.current){setAccess({status:'member',identity});setWorkspaceRole(identity.role);}return identity;}
  catch(error){if(request===accessRequest.current){setWorkspaceRole(null);setAccess((error as {code?:string}).code==='AUTH_REQUIRED'?{status:'guest',identity:null}:{status:'error',identity:null,error:(error as Error).message});}return null;}
 },[]);
 useEffect(()=>{
  if(health.loading||session.loading||health.error||session.error||health.data?.data.demoEnabled)return;
  if(session.data?.authenticated&&(session.data.assurance!=='HIGH'||!session.data.emailVerified)){++accessRequest.current;setWorkspaceRole(null);setAccess({status:'restricted',identity:null});return;}
  void refreshAccess();return()=>{++accessRequest.current;};
 },[health.loading,health.error,health.data?.data.demoEnabled,session.loading,session.error,session.data,refreshAccess]);
 const menuUpdates=useWorkspaceUpdates(!health.loading&&!health.error&&!health.data?.data.demoEnabled&&!session.loading&&!session.error&&access.status==='member',access.identity?.id||'guest');
 useEffect(()=>{const focus=()=>session.refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[session.refresh]);
 useEffect(()=>{let active=true;if(session.loading)return;const s=session.data;if(!s?.authenticated||s.assurance!=='HIGH'||!s.emailVerified){adminIdentity.current='';setAdminAllowed(false);setAdminError('');setAdminLoading(false);return;}
  const identity=s.email||'';if(adminIdentity.current!==identity){adminIdentity.current=identity;setAdminAllowed(false);setAdminLoading(true);}setAdminError('');
  adminRequest<{allowed:boolean}>('access').then(r=>{if(active)setAdminAllowed(r.allowed);}).catch(e=>{if(active){setAdminAllowed(false);setAdminError((e as Error).message);}}).finally(()=>{if(active)setAdminLoading(false);});return()=>{active=false;};
 },[session.data,session.loading,adminRevision]);
 return {...menuUpdates,health,session,access,refreshAccess,workspaceRole,setWorkspaceRole,adminAllowed,adminLoading,adminError,refreshAdmin:()=>setAdminRevision(n=>n+1)};
}
const GateContext=createContext<ReturnType<typeof useGateState>|null>(null);
export function WorkspaceGateProvider({children}:{children:ReactNode}){return <GateContext.Provider value={useGateState()}>{children}</GateContext.Provider>;}
export function useWorkspaceGate(){const gate=useContext(GateContext);if(!gate)throw new Error('WORKSPACE_GATE_REQUIRED');return gate;}
export function useOptionalWorkspaceGate(){return useContext(GateContext);}
export function useSharedSession(){const shared=useContext(GateContext),local=useApi('/api/account/session',sessionSchema,undefined,!shared);return shared?.session||local;}

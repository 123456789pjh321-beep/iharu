import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {adminRequest} from '../admin-api';
import {envelope,healthSchema} from '../../../shared/contracts';
import {sessionSchema} from '../auth';
import {useApi} from '../api';
const healthResponse=envelope(healthSchema);
function useGateState(){
 const [workspaceRole,setWorkspaceRole]=useState<'PARENT'|'CHILD'|null>(null);
 const [adminAllowed,setAdminAllowed]=useState(false),[adminLoading,setAdminLoading]=useState(true),[adminError,setAdminError]=useState(''),[adminRevision,setAdminRevision]=useState(0),adminIdentity=useRef('');
 const health=useApi('/api/health',healthResponse),session=useApi('/api/account/session',sessionSchema);
 useEffect(()=>{const focus=()=>session.refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[session.refresh]);
 useEffect(()=>{let active=true;if(session.loading)return;const s=session.data;if(!s?.authenticated||s.assurance!=='HIGH'||!s.emailVerified){adminIdentity.current='';setAdminAllowed(false);setAdminError('');setAdminLoading(false);return;}
  const identity=s.email||'';if(adminIdentity.current!==identity){adminIdentity.current=identity;setAdminAllowed(false);setAdminLoading(true);}setAdminError('');
  adminRequest<{allowed:boolean}>('access').then(r=>{if(active)setAdminAllowed(r.allowed);}).catch(e=>{if(active){setAdminAllowed(false);setAdminError((e as Error).message);}}).finally(()=>{if(active)setAdminLoading(false);});return()=>{active=false;};
 },[session.data,session.loading,adminRevision]);
 return {health,session,workspaceRole,setWorkspaceRole,adminAllowed,adminLoading,adminError,refreshAdmin:()=>setAdminRevision(n=>n+1)};
}
const GateContext=createContext<ReturnType<typeof useGateState>|null>(null);
export function WorkspaceGateProvider({children}:{children:ReactNode}){return <GateContext.Provider value={useGateState()}>{children}</GateContext.Provider>;}
export function useWorkspaceGate(){const gate=useContext(GateContext);if(!gate)throw new Error('WORKSPACE_GATE_REQUIRED');return gate;}
export function useOptionalWorkspaceGate(){return useContext(GateContext);}
export function useSharedSession(){const shared=useContext(GateContext),local=useApi('/api/account/session',sessionSchema,undefined,!shared);return shared?.session||local;}

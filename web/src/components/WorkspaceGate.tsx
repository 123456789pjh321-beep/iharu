import {createContext,useContext,useEffect,type ReactNode} from 'react';
import {envelope,healthSchema} from '../../../shared/contracts';
import {sessionSchema} from '../auth';
import {useApi} from '../api';
const healthResponse=envelope(healthSchema);
function useGateState(){
 const health=useApi('/api/health',healthResponse),session=useApi('/api/account/session',sessionSchema);
 useEffect(()=>{const focus=()=>session.refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[session.refresh]);
 return {health,session};
}
const GateContext=createContext<ReturnType<typeof useGateState>|null>(null);
export function WorkspaceGateProvider({children}:{children:ReactNode}){return <GateContext.Provider value={useGateState()}>{children}</GateContext.Provider>;}
export function useWorkspaceGate(){const gate=useContext(GateContext);if(!gate)throw new Error('WORKSPACE_GATE_REQUIRED');return gate;}
export function useSharedSession(){const shared=useContext(GateContext),local=useApi('/api/account/session',sessionSchema,undefined,!shared);return shared?.session||local;}

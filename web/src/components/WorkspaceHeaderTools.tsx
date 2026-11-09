import {createContext,useContext,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

// Page-owned controls retain their state and callbacks in the persistent app header.
export const WorkspaceHeaderToolsContext=createContext<HTMLElement|null>(null);
export function WorkspaceHeaderTool({children}:{children:ReactNode}){
 const target=useContext(WorkspaceHeaderToolsContext);
 return target?createPortal(children,target):children;
}

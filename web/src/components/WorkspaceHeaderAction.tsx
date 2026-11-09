import {createContext,useContext,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

export const WorkspaceHeaderActionsContext=createContext<HTMLDivElement|null>(null);
export function WorkspaceHeaderAction({children}:{children:ReactNode}){
 const target=useContext(WorkspaceHeaderActionsContext);
 return target?createPortal(children,target):null;
}

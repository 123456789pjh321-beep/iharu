import {createContext,useContext,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

export const WorkspaceHeaderActionsContext=createContext<{primary:HTMLDivElement|null;trailing:HTMLDivElement|null}>({primary:null,trailing:null});
export function WorkspaceHeaderAction({children,slot='primary'}:{children:ReactNode;slot?:'primary'|'trailing'}){
 const target=useContext(WorkspaceHeaderActionsContext)[slot];
 return target?createPortal(children,target):null;
}

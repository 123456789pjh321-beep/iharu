import {familyRequest} from './family';
export function workspaceRequest<T=Record<string,unknown>>(op:string,data:object={}):Promise<T>{return familyRequest<T>('/api/v1/workspace/'+op,data);}

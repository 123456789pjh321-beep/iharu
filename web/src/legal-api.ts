import {familyRequest} from './family';
export function legalRequest<T=Record<string,unknown>>(op:string,data:object={}):Promise<T>{return familyRequest<T>('/api/v1/legal/'+op,data);}

import {familyRequest} from './family';
export const adminRequest=<T,>(op:string,data:object={}):Promise<T>=>familyRequest<T>('/api/v1/admin/'+op,data);

import {familyRequest} from './family';
export const briefingRequest=<T,>(op:string,data:object={}):Promise<T>=>familyRequest<T>('/api/v1/briefing/'+op,data);

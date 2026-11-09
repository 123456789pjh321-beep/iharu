import {bindPushProfile,clearDevicePush} from './push-device';
import {familyRequest} from './family';
export async function workspaceRequest<T=Record<string,unknown>>(op:string,data:object={}):Promise<T>{const result=await familyRequest<T>('/api/v1/workspace/'+op,data);if(op==='logout')await clearDevicePush();if(op==='me'&&typeof(result as {id?:unknown}).id==='string')bindPushProfile((result as {id:string}).id);return result;}

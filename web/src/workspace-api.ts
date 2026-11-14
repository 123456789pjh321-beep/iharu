import {bindPushProfile,clearDevicePush} from './push-device';
import {familyRequest} from './family';
// Pin requests to this tab's selected space, including in-flight editor saves.
let groupScope:string|undefined,scopeRevision=0;
function setWorkspaceGroup(scope?:string){
 if(groupScope===scope)return;
 groupScope=scope;
 scopeRevision++;
}
function resetWorkspaceGroup(){setWorkspaceGroup();}
export async function workspaceRequest<T=Record<string,unknown>>(op:string,data:object={},space?:string|null):Promise<T>{
 if(['group.select','group.create','invite.link.accept'].includes(op))scopeRevision++;
 const requested=space===undefined?groupScope:space||'personal',revision=scopeRevision;
 let result:T;
 try{result=await familyRequest<T>('/api/v1/workspace/'+op,data,'POST',requested?{'X-Iharu-Group':requested}:{});}
 catch(error){if((error as {code?:string}).code==='GROUP_NOT_FOUND'&&requested===groupScope&&revision===scopeRevision){resetWorkspaceGroup();window.dispatchEvent(new Event('iharu:group-unavailable'));}
  if(op==='me'&&(error as {code?:string}).code==='AUTH_REQUIRED'&&revision===scopeRevision)resetWorkspaceGroup();
  throw error;
 }
 const value=result as {id?:string;selectedGroupId?:string|null;family?:{id:string}|null;group?:{id:string};groupId?:string};
 if(op==='logout'){resetWorkspaceGroup();await clearDevicePush();}
 if(revision!==scopeRevision)return result;
 if(op==='me'&&space===undefined&&typeof value.id==='string'){bindPushProfile(value.id);setWorkspaceGroup(value.selectedGroupId??value.family?.id??'personal');}
 if(op==='group.select')setWorkspaceGroup((data as {groupId:string|null}).groupId||'personal');
 if(op==='group.create'&&value.group)setWorkspaceGroup(value.group.id);
 if(op==='invite.link.accept'&&value.groupId)setWorkspaceGroup(value.groupId);
 if(op==='invite.link.issue'&&value.groupId&&!(data as {groupId?:string}).groupId&&(!requested||requested==='personal'))setWorkspaceGroup(value.groupId);
 const affected=data as {groupId?:string;familyId?:string};
 if((op==='family.leave'||op==='group.archive')&&requested!==undefined&&requested===(affected.groupId||affected.familyId))resetWorkspaceGroup();
 return result;
}

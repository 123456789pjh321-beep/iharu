export const workspaceMenus=['timetable','calendar','chat','briefing','fees','records','family'] as const;
export type WorkspaceMenu=typeof workspaceMenus[number];
export type MenuRevision={revision:number;seen:number};
export type MenuUpdateState={profileId:string;updates:Partial<Record<WorkspaceMenu,MenuRevision>>};
export type MenuReceipt={profileId:string;menu:WorkspaceMenu;revision:number};
export function menuForPath(path:string):WorkspaceMenu|undefined{
 if(path==='/timetable'||path==='/today/timetable'||path==='/today/repeats')return 'timetable';
 if(path==='/today/calendar'||path==='/calendar')return 'calendar';
 if(path==='/chat'||path==='/child/chat')return 'chat';
 if(path==='/briefing')return 'briefing';
 if(path==='/tuition')return 'fees';
 if(path==='/records')return 'records';
 if(path==='/family')return 'family';
}
export function hasMenuUpdate(state:MenuUpdateState|null,menu:WorkspaceMenu|undefined){const row=menu&&state?.updates[menu];return !!row&&row.revision>row.seen;}
/** Polls and read acknowledgements can complete out of order. Neither watermark may regress. */
export function mergeMenuUpdates(previous:MenuUpdateState|null,next:MenuUpdateState):MenuUpdateState{
 if(!previous||previous.profileId!==next.profileId)return next;
 const updates={...next.updates};
 for(const menu of workspaceMenus){const before=previous.updates[menu],after=next.updates[menu];if(after&&before)updates[menu]={revision:Math.max(before.revision,after.revision),seen:Math.max(before.seen,after.seen)};}
 return {...next,updates};
}

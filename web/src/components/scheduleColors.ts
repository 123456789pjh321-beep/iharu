import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';

export const calendarColors=['#247e69','#4273b9','#b25c88','#a36b24','#7864b5','#b35c4c'];
export function eventColor(item:WorkspaceItem,members:WorkspaceMember[]){return calendarColors[item.data.color??Math.max(0,members.findIndex(m=>m.id===(item.data.assigneeId||item.ownerId)))%calendarColors.length];}

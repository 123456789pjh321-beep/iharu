import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';

export const calendarColors=['#247e69','#587ca5','#ac6085','#a47232','#8170ac','#b26856'];
export function eventColor(item:WorkspaceItem,members:WorkspaceMember[]){return calendarColors[item.data.color??Math.max(0,members.findIndex(m=>m.id===(item.data.assigneeId||item.ownerId)))%calendarColors.length];}

import type {MenuReceipt} from './workspace-updates.js';
import {z} from 'zod';
export const workspaceKind=z.enum(['EVENT','REPEAT','FEE','NOTE','CHAT']);
export const calendarFrequency=z.enum(['ONCE','DAILY','WEEKLY','MONTHLY','YEARLY']);
export const workspaceData=z.object({title:z.string().trim().min(1).max(80),date:z.iso.date(),assigneeId:z.uuid().optional(),allMembers:z.boolean().optional(),allDay:z.boolean().optional(),color:z.number().int().min(0).max(5).optional(),endDate:z.iso.date().optional(),untilDate:z.iso.date().optional(),calendarFrequency:calendarFrequency.optional(),weekdays:z.array(z.number().int().min(0).max(6)).max(7).default([]),startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),place:z.string().trim().max(120).default(''),note:z.string().trim().max(5000).default(''),feeFrequency:z.enum(['ONCE','MONTHLY']).optional(),feePayerId:z.uuid().optional(),amount:z.number().int().min(0).max(1000000000).optional(),paid:z.boolean().default(false)}).strict();
export const workspaceItemInput=z.object({kind:workspaceKind,data:workspaceData}).strict().superRefine((v,c)=>{
 if(v.data.allMembers!==undefined&&(!['EVENT','REPEAT'].includes(v.kind)||(v.data.allMembers&&v.data.assigneeId)))c.addIssue({code:'custom',message:'일정의 전체 또는 한 구성원을 선택해 주세요.'});
 if(['EVENT','REPEAT'].includes(v.kind)&&!v.data.allDay&&(!v.data.startTime||!v.data.endTime||((v.kind!=='EVENT'||(v.data.endDate||v.data.date)===v.data.date)&&v.data.endTime<=v.data.startTime)))c.addIssue({code:'custom',message:'종료 시간을 확인해 주세요.'});
 if(v.data.endDate!==undefined&&(v.kind!=='EVENT'||v.data.endDate<v.data.date))c.addIssue({code:'custom',message:'종료일은 시작일과 같거나 이후 날짜로 선택해 주세요.'});
 if(v.kind==='REPEAT'&&(!v.data.weekdays.length||new Set(v.data.weekdays).size!==v.data.weekdays.length))c.addIssue({code:'custom',message:'반복 요일을 선택해 주세요.'});
 if(v.data.calendarFrequency&&v.kind!=='EVENT')c.addIssue({code:'custom',message:'달력에서만 달력 반복을 지정할 수 있어요.'});
 if(v.kind==='EVENT'&&v.data.calendarFrequency&&v.data.calendarFrequency!=='ONCE'){
  if(v.data.untilDate&&v.data.untilDate<v.data.date)c.addIssue({code:'custom',message:'반복 종료일을 확인해 주세요.'});
  if(v.data.calendarFrequency==='WEEKLY'&&(!v.data.weekdays.length||new Set(v.data.weekdays).size!==v.data.weekdays.length))c.addIssue({code:'custom',message:'반복 요일을 선택해 주세요.'});
 }
 if(v.kind==='FEE'&&v.data.amount===undefined)c.addIssue({code:'custom',message:'금액을 입력해 주세요.'});
 if(v.kind==='FEE'&&v.data.untilDate&&v.data.untilDate<v.data.date)c.addIssue({code:'custom',message:'반복 종료일을 확인해 주세요.'});
 if(v.kind!=='FEE'&&(v.data.feeFrequency||v.data.feePayerId))c.addIssue({code:'custom',message:'학원비에서만 결제 정보를 지정할 수 있어요.'});
});
export type WorkspaceData=z.infer<typeof workspaceData>;
export type WorkspaceKind=z.infer<typeof workspaceKind>;
export type WorkspaceItem={id:string;kind:WorkspaceKind;data:WorkspaceData;ownerId:string;ownerName:string;mine:boolean;version:number;createdAt?:string;updatedAt?:string;fee?:{month:string;dueDate:string;paid:boolean;payerId:string;payerName:string;canMarkPaid:boolean}};
export type WorkspaceMember={id:string;name:string;kind:'PARENT'|'CHILD';host:boolean;version:number};
export type WorkspaceMe={timetableMemberIds?:string[];timetableMemberId?:string;updateReceipt?:MenuReceipt;id:string;name:string;role:'PARENT'|'CHILD';loginId:string|null;family:null|{id:string;name:string;hostId:string;isHost:boolean;members:WorkspaceMember[]}};

export type ChatCursor={createdAt:string;id:string};
export type ChatPage={updateReceipt?:MenuReceipt;items:WorkspaceItem[];hasMore:boolean;nextCursor:ChatCursor|null};

/** Validation messages name the field without echoing user input or internal schema details. */
export function workspaceValidationMessage(issues:z.ZodError['issues']){
 const custom=issues.find(issue=>issue.code==='custom');if(custom)return custom.message;
 const labels:Record<string,string>={title:'제목',date:'시작일',endDate:'종료일',untilDate:'반복 종료일',assigneeId:'가족 구성원',weekdays:'반복 요일',startTime:'시작 시간',endTime:'종료 시간',amount:'금액',note:'메모',place:'장소'};
 const field=issues[0]?.path[1],label=typeof field==='string'?labels[field]:undefined;
 return label?`${label} 항목을 확인해 주세요.`:'입력한 항목을 확인해 주세요.';
}

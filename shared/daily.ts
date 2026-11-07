import {z} from 'zod';
import {id,version} from './family.js';
import {localDate,occurrenceSchema} from './schedules.js';
const instant=z.iso.datetime({offset:true});
const optionalId=id.nullable().default(null);
const text=(max:number)=>z.string().trim().max(max);
export const checkinInput=z.object({kind:z.enum(['ARRIVED','DEPARTED']),occurrenceId:optionalId,happenedAt:instant,clientEventId:id,confirmRepeat:z.boolean().default(false)}).strict();
export const correctionInput=z.object({expectedVersion:version,reason:text(300).min(1),replacement:checkinInput.nullable().default(null)}).strict();
const taskFields={title:text(100).min(1),detail:text(1000).default(''),dueAt:instant.nullable().default(null),assigneeMemberId:optionalId,sourceName:text(80).default(''),sourceUrl:z.url({protocol:/^https$/}).max(2000).nullable().default(null)};
export const taskInput=z.object(taskFields).strict();
export const taskEditInput=taskInput.extend({expectedVersion:version});
export const taskActionInput=z.object({action:z.enum(['COMPLETE','REOPEN','CANCEL']),expectedVersion:version}).strict();
export const learningInput=z.object({learningDate:localDate,subject:text(30).default(''),content:text(1000).min(1),taskId:optionalId}).strict();
export const learningEditInput=learningInput.extend({expectedVersion:version});
export const pickupInput=z.object({occurrenceId:optionalId,assigneeMemberId:optionalId,scheduledAt:instant,place:text(100).default(''),memo:text(500).default('')}).strict();
export const pickupActionInput=z.object({action:z.enum(['ACCEPT','HANDOVER','REASSIGN','CANCEL','ANNOTATE']),expectedVersion:version,assigneeMemberId:optionalId,reason:text(300).default('')}).strict().refine(p=>!['CANCEL','ANNOTATE'].includes(p.action)||p.reason.length>0);
export const recordRange=z.object({kind:z.enum(['ALL','CHECKIN','TASK','LEARNING','PICKUP']).default('ALL'),from:localDate,to:localDate,cursor:id.optional(),limit:z.coerce.number().int().min(1).max(50).default(30)}).strict().refine(p=>p.to>=p.from&&Date.parse(p.to)-Date.parse(p.from)<90*86400000);
export const dailyItemSchema=z.object({
 id,type:z.enum(['CHECKIN','TASK','LEARNING','PICKUP']),childId:id,childName:z.string(),version,recordAt:z.string(),createdAt:z.string(),updatedAt:z.string(),
 authorName:z.string(),editorName:z.string(),actions:z.array(z.string()),
 kind:z.enum(['ARRIVED','DEPARTED']).optional(),happenedAt:z.string().optional(),receivedAt:z.string().optional(),actorType:z.string().optional(),occurrenceId:id.nullable().optional(),occurrenceTitle:z.string().nullable().optional(),supersedesId:id.nullable().optional(),voidedAt:z.string().nullable().optional(),reason:z.string().nullable().optional(),
 title:z.string().optional(),detail:z.string().optional(),state:z.string().optional(),dueAt:z.string().nullable().optional(),assigneeMemberId:id.nullable().optional(),assigneeName:z.string().nullable().optional(),sourceName:z.string().optional(),sourceUrl:z.string().nullable().optional(),closedAt:z.string().nullable().optional(),
 learningDate:z.string().optional(),subject:z.string().optional(),content:z.string().optional(),taskId:id.nullable().optional(),taskTitle:z.string().nullable().optional(),
 scheduledAt:z.string().optional(),place:z.string().optional(),memo:z.string().optional(),history:z.array(z.object({action:z.string(),at:z.string(),actorName:z.string(),reason:z.string()})).optional(),
});
export const dailyMeta=z.object({requestId:z.string(),serverNow:z.string(),nextCursor:id.nullable().optional()});
export const dailyListSchema=z.object({data:z.object({items:z.array(dailyItemSchema)}),meta:dailyMeta});
export const dailyTodaySchema=z.object({data:z.object({date:localDate,serverToday:localDate,occurrences:z.array(occurrenceSchema),checkins:z.array(dailyItemSchema),tasks:z.array(dailyItemSchema),pickups:z.array(dailyItemSchema),recent:z.array(dailyItemSchema),truncated:z.boolean()}),meta:dailyMeta});
export const dailyMembersSchema=z.object({data:z.object({members:z.array(z.object({id,name:z.string()}))}),meta:dailyMeta});
export type DailyItem=z.infer<typeof dailyItemSchema>;
export type DailyToday=z.infer<typeof dailyTodaySchema>;


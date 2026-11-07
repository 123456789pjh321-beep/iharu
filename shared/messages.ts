import {z} from 'zod';
import {id} from './family.js';
const seq=z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const sendMessage=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('TEXT'),body:z.string().trim().min(1).max(2000),clientMessageId:id}).strict(),
 z.object({kind:z.literal('STICKER'),catalogId:z.string().min(1).max(40),catalogVersion:z.number().int().positive(),clientMessageId:id}).strict(),
]);
export const listMessages=z.object({afterSeq:seq.optional(),beforeSeq:seq.optional(),limit:z.coerce.number().int().min(1).max(50).default(30)}).strict().refine(v=>v.afterSeq===undefined||v.beforeSeq===undefined);
export const messageSchema=z.object({id,seq:z.number(),kind:z.enum(['TEXT','STICKER']),body:z.string().nullable(),displayText:z.string().nullable(),emoji:z.string().nullable(),catalogId:z.string().nullable(),catalogVersion:z.number().nullable(),createdAt:z.string(),deletedAt:z.string().nullable(),version:z.number(),mine:z.boolean(),senderName:z.string(),readByOther:z.boolean()});
export const messageListSchema=z.object({data:z.object({childId:id,childName:z.string(),items:z.array(messageSchema),hasMore:z.boolean(),snapshotCursor:id,receipt:id}),meta:z.object({requestId:z.string(),serverNow:z.string()})});
export const roomListSchema=z.object({data:z.array(z.object({childId:id,childName:z.string(),familyName:z.string(),familyId:id})),meta:z.object({requestId:z.string(),serverNow:z.string()})});
export const readMessage=z.object({lastReadSeq:seq,receipt:id}).strict();
export type Message=z.infer<typeof messageSchema>;
export type MessageInput=z.infer<typeof sendMessage>;

export const messageChangesSchema=z.object({data:z.object({items:z.array(messageSchema),cursor:id,hasMore:z.boolean(),readsChanged:z.boolean().default(false)})});


import {z} from 'zod';
export const memoCategories={DAILY:'일상',FAMILY:'가족',LEARNING:'배움',OUTING:'나들이',HEALTH:'건강',IDEA:'아이디어',OTHER:'기타'} as const;
export type MemoCategory=keyof typeof memoCategories;
export const memoLocation=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),accuracy:z.number().min(0).max(10000000),capturedAt:z.iso.datetime()}).strict();
export const memoFields=z.object({title:z.string().trim().min(1).max(100),body:z.string().trim().max(10000),date:z.iso.date().refine(v=>v>='1900-01-01'&&v<='2099-12-31'),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),category:z.enum(['DAILY','FAMILY','LEARNING','OUTING','HEALTH','IDEA','OTHER']),tags:z.array(z.string().trim().min(1).max(24)).max(5),place:z.string().trim().max(120),location:memoLocation.nullable(),visibility:z.enum(['PRIVATE','GROUP'])}).strict();
export type MemoFields=z.infer<typeof memoFields>;
export type MemoPhoto={id:string;width:number;height:number};
export type Memo=MemoFields&{id:string;version:number;ownerId:string;ownerName:string;mine:boolean;favorite:boolean;createdAt:string;updatedAt:string;photos:MemoPhoto[]};
export type MemoList={items:Memo[];total:number;hasAny:boolean};
export type MemoPhotoInput={id:string}|{data:string;width:number;height:number};
export type MemoDraft=MemoFields&{id:string;version:number;photos:MemoPhotoInput[]};
export function emptyMemo(date:string):MemoDraft{return {id:crypto.randomUUID(),version:0,title:'',body:'',date,time:new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}),category:'DAILY',tags:[],place:'',location:null,visibility:'PRIVATE',photos:[]};}

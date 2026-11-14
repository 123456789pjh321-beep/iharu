import {z} from 'zod';
import {memoFields} from '../../shared/memos.js';
const jpeg=z.string().max(480000).regex(/^[A-Za-z0-9+/]+={0,2}$/).refine(value=>{const bytes=Buffer.from(value,'base64');return bytes.length<=350000&&bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217;});
export const memoSpecs:Record<string,z.ZodType>={
 'memos.list':z.object({from:z.iso.date().optional(),to:z.iso.date().optional(),query:z.string().trim().max(100).default(''),category:z.enum(['ALL','DAILY','FAMILY','LEARNING','OUTING','HEALTH','IDEA','OTHER']).default('ALL'),ownerIds:z.array(z.uuid()).max(100).default([]),hasPhotos:z.boolean().default(false),hasLocation:z.boolean().default(false),favorite:z.boolean().default(false),visibility:z.enum(['ALL','PRIVATE','GROUP']).default('ALL'),sort:z.enum(['newest','oldest']).default('newest'),offset:z.number().int().min(0).max(100000).default(0),limit:z.number().int().min(1).max(100).default(40)}).strict().refine(v=>!v.from||!v.to||v.from<=v.to),
 'memos.save':memoFields.extend({id:z.uuid(),version:z.number().int().min(0),photos:z.array(z.union([z.object({id:z.uuid()}).strict(),z.object({data:jpeg,width:z.number().int().min(1).max(1600),height:z.number().int().min(1).max(1600)}).strict()])).max(3)}).strict(),
 'memos.delete':z.object({id:z.uuid(),version:z.number().int().positive()}).strict(),
 'memos.favorite':z.object({id:z.uuid(),favorite:z.boolean()}).strict(),
 'memos.photo':z.object({id:z.uuid()}).strict(),
};

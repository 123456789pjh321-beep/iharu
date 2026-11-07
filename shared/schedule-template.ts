import {z} from 'zod';
import {id} from './family.js';
import {localDate,localTime} from './schedules.js';

export const templateInput=z.object({
 from:localDate,to:localDate,
 rowIds:z.array(z.string().regex(/^[a-z-]+$/)).min(1).max(10).refine(v=>new Set(v).size===v.length),
}).strict().refine(v=>v.to>=v.from&&Date.parse(v.to)-Date.parse(v.from)<=365*86400000,'적용 기간을 확인해 주세요.');
export const templateImportInput=templateInput.safeExtend({previewToken:id});
const row=z.object({id:z.string(),title:z.string(),place:z.string(),weekdays:z.array(z.number()),startTime:localTime,endTime:localTime});
export const templateCatalog=z.object({name:z.string(),rows:z.array(row),serverToday:localDate});
export const templatePreview=z.object({previewToken:id,expiresAt:z.string(),childName:z.string(),from:localDate,to:localDate,
 rows:z.array(row.extend({state:z.enum(['NEW','EXISTING','OVERLAP']),count:z.number(),seriesId:id.nullable()})),canImport:z.boolean()});
export const templateResult=z.object({created:z.number(),existing:z.number(),seriesIds:z.array(id)});
export type TemplateInput=z.infer<typeof templateInput>;
export type TemplatePreview=z.infer<typeof templatePreview>;


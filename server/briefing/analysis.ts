import {createHash} from 'node:crypto';
import {z} from 'zod';
import {visibleOn} from '../../shared/workspace-schedules.js';
import {addDays} from '../../shared/schedules.js';
import type {WorkspaceItem} from '../../shared/workspace.js';
import {briefingCategories,type BriefingItem} from '../../shared/briefing.js';
import {officialSourceUrl,type BriefingEvidence} from './sources.js';
export type RawContext={region:string;day:string;items:(Pick<WorkspaceItem,'id'|'ownerId'|'kind'|'data'|'version'>&{changed:boolean})[];names:string[];owners:string[];scope:string};
export type AnalysisContext={region:string;day:string;topics:{key:string;dates:string[];changed:boolean}[]};
const forbidden=/[\w.+-]+@[\w.-]+|https?:|\d{6}|(?:010|011|016|017|018|019)[ -]?\d|(?:로|길)\s*\d|병원|진료|검사|상담|약물|비밀번호|주민번호/;
export function prepareBriefingContext(raw:RawContext):AnalysisContext{
 const clean=(value:string)=>{let s=value.normalize('NFC');for(const name of [...raw.names].filter(Boolean).sort((a,b)=>b.length-a.length))s=s.split(name).join('');s=s.replace(/[<>\[\]{}"`\\]/g,' ').replace(/\s+/g,' ').trim();return forbidden.test(s)?'':s.slice(0,60);};
 const topics=new Map<string,AnalysisContext['topics'][number]>();
 for(const row of raw.items){const item={...row,ownerName:'',mine:true} as WorkspaceItem;const dates=Array.from({length:7},(_,i)=>addDays(raw.day,i)).filter(d=>visibleOn(item,d));if(!dates.length)continue;
  // Place first; titles are only a fallback when they identify an institution or public activity.
  const place=clean(row.data.place||''),title=clean(row.data.title||'');const key=place||(/도서관|학교|박물관|미술관|센터|공원|체육관|수영장|문화관|행사|축제/.test(title)?title:'');if(key.length<3)continue;
  const old=topics.get(key);topics.set(key,{key,dates:[...new Set([...(old?.dates||[]),...dates])].sort(),changed:row.changed||!!old?.changed});
 }
 return {region:clean(raw.region),day:raw.day,topics:[...topics.values()].sort((a,b)=>Number(b.changed)-Number(a.changed)||a.dates[0].localeCompare(b.dates[0])).slice(0,12)};
}
const candidate=z.object({sourceId:z.string().max(20),category:z.enum(briefingCategories),title:z.string().min(5).max(100),summary:z.string().min(12).max(400),reason:z.string().min(5).max(160),action:z.string().min(6).max(160),matchKey:z.string().min(3).max(60),evidenceQuote:z.string().min(12).max(350),validFrom:z.iso.date(),validUntil:z.iso.date(),score:z.number().int().min(0).max(100),urgent:z.boolean()}).strict();
export const briefingResultSchema=z.object({items:z.array(candidate).max(8)}).strict();
export const publicBriefingResultSchema = z.object({
 items: z.array(candidate.omit({sourceId: true}).extend({sourceUrl: z.string().max(2048)})).max(8)
}).strict();
export const briefingResultJsonSchema = z.toJSONSchema(publicBriefingResultSchema, {
 target: 'draft-7',
 override: ({jsonSchema}) => {
  // Apply string length limits locally. The provider accepts a subset of JSON Schema.
  delete jsonSchema.minLength;
  delete jsonSchema.maxLength;
 }
});
const norm=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function mentionsDate(text:string,value:string){const [y,m,d]=value.split('-').map(Number);return new RegExp(`${y}\\s*[.년/\\-]\\s*0?${m}\\s*[.월/\\-]\\s*0?${d}(?:\\D|$)`).test(text)||new RegExp(`(?:^|\\D)0?${m}\\s*월\\s*0?${d}\\s*일`).test(text);}
const areaAliases:Record<string,string>={suwon:'수원',seoul:'서울',gg:'경기',gunpo:'군포',anyang:'안양',yongin:'용인',hscity:'화성',goe:'경기'};
export function selectBriefingItems(value:unknown,context:AnalysisContext,sources:BriefingEvidence[]):BriefingItem[]{
 const parsed=briefingResultSchema.safeParse(value);if(!parsed.success)throw Error('INVALID_RESULT');const chosen=new Map<string,BriefingItem>();
 for(const c of parsed.data.items){const source=sources.find(s=>s.id===c.sourceId),topic=context.topics.find(t=>norm(t.key)===norm(c.matchKey)),url=source&&officialSourceUrl(source.url);if(!source||!url||!topic||c.validUntil<c.validFrom||c.validUntil<context.day||c.validFrom>addDays(context.day,6)||c.validUntil>addDays(context.day,31))continue;
  const quote=norm(c.evidenceQuote),body=norm(source.text),areaTokens=context.region.split(/\s+/).map(x=>x.replace(/특별자치도|특별자치시|특별시|광역시|도$|시$|군$|구$/g,'')).filter(x=>x.length>=2).slice(-1),hostArea=Object.entries(areaAliases).filter(([key])=>url.hostname.split('.').includes(key)).map(([,v])=>v);
  if(!body.includes(quote)||!body.includes(norm(topic.key))||!areaTokens.some(t=>body.includes(norm(t))||hostArea.includes(t)))continue;
  const recurring=c.category==='FACILITY'&&/매주|정기\s*휴관/.test(c.evidenceQuote)&&/[월화수목금토일]요일/.test(c.evidenceQuote);
  if(!recurring&&(!mentionsDate(c.evidenceQuote,c.validFrom)||!mentionsDate(c.evidenceQuote,c.validUntil)))continue;
  if(!topic.dates.some(d=>d>=c.validFrom&&d<=c.validUntil))continue;
  const safety=/^(?:www\.)?(?:safekorea|weather|kma)\.go\.kr$/.test(url.hostname)&&c.category==='SAFETY'&&/대피|통제|경보|특보/.test(c.evidenceQuote)&&c.validFrom<=context.day;
  const score=Math.min(c.score,30+20+(safety?20:/휴관|변경|마감|모집|공지/.test(c.evidenceQuote)?15:5)+20+10);if(score<80)continue;
  const fingerprint=hash([c.category,norm(c.matchKey),c.validFrom,c.validUntil].join('|')),contentHash=hash([quote,c.validFrom,c.validUntil].join('|'));
  const item:BriefingItem={...c,fingerprint,contentHash,score,urgent:safety&&c.urgent&&score>=95,sourceUrl:url.href,sourceName:source.title.slice(0,90)};
  if(!chosen.has(fingerprint)||chosen.get(fingerprint)!.score<score)chosen.set(fingerprint,item);
 }
 const rows=[...chosen.values()].sort((a,b)=>b.score-a.score);return [...rows.filter(x=>!x.urgent).slice(0,3),...rows.filter(x=>x.urgent).slice(0,3)];
}
export function responseText(response:unknown){const r=response as {status?:string;output?:{type?:string;content?:{type?:string;text?:string}[]}[]};if(r.status!=='completed')throw Error('AI_UNAVAILABLE');return (r.output||[]).flatMap(o=>o.type==='message'?(o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text||''):[]).join('\n');}
export function responseSourceUrls(response:unknown){const r=response as {output?:{type?:string;action?:{sources?:{url?:string}[]};content?:{annotations?:{type?:string;url?:string}[]}[]}[]};return [...new Set((r.output||[]).flatMap(o=>[...(o.action?.sources||[]).map(s=>s.url||''),...(o.content||[]).flatMap(c=>(c.annotations||[]).filter(a=>a.type==='url_citation').map(a=>a.url||''))]).map(s=>officialSourceUrl(s)?.href).filter((s):s is string=>!!s))].slice(0,6);}

import {createHash} from 'node:crypto';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {z} from 'zod';
import {localDate} from '../../shared/schedules.js';

const itemSchema=z.object({locdate:z.coerce.string().regex(/^\d{8}$/),dateName:z.string().trim().min(1).max(100),isHoliday:z.enum(['Y','N'])});
const responseSchema=z.object({response:z.object({header:z.object({resultCode:z.coerce.string()}),body:z.object({totalCount:z.coerce.number().int().min(0).max(1000),items:z.unknown().optional()}).optional()})});
export type HolidayItem={date:string;name:string;isHoliday:boolean};
class HolidayFailure extends Error{}
const apiReason=(code:string)=>/^\d{1,4}$/.test(code)?`API_${code}`:'API_ERROR';
export function normalizeHolidayKey(key:string):string{
 if(!key)throw new HolidayFailure('KEY_MISSING');
 let decoded:string;
 try{decoded=decodeURIComponent(key);}catch{throw new HolidayFailure('KEY_INVALID_ENCODING');}
 if(/\s/.test(decoded))throw new HolidayFailure('KEY_WHITESPACE');
 if(decoded.includes('%'))throw new HolidayFailure('KEY_INVALID_ENCODING');
 return decoded;
}
// Only controlled codes reach logs: never URLs, response messages, keys or stacks.
export function holidayFailureReason(error:unknown):string{
 if(error instanceof HolidayFailure)return error.message;
 if(error instanceof Error){
  if(['AbortError','TimeoutError'].includes(error.name))return 'TIMEOUT';
  if(error.name==='ZodError'||error instanceof SyntaxError)return 'INVALID_RESPONSE';
  if(['INVALID_HOLIDAYS','INCOMPLETE_HOLIDAYS'].includes(error.message))return error.message;
 }
 return 'FETCH_OR_STORAGE_FAILED';
}
export function parseHolidays(raw:string,year:number):HolidayItem[]{
 if(Buffer.byteLength(raw)>512000||/<!DOCTYPE|<!ENTITY/i.test(raw))throw new Error('INVALID_HOLIDAYS');
 let value:unknown;
 if(raw.trim().startsWith('{'))value=JSON.parse(raw);
 else{if(XMLValidator.validate(raw)!==true)throw new Error('INVALID_HOLIDAYS');value=new XMLParser({parseTagValue:false,processEntities:true}).parse(raw);}
 const gateway=z.object({OpenAPI_ServiceResponse:z.object({cmmMsgHeader:z.object({returnReasonCode:z.coerce.string()})})}).safeParse(value);
 if(gateway.success)throw new HolidayFailure(apiReason(gateway.data.OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode));
 const r=responseSchema.parse(value).response;
 if(!['00','0','0000'].includes(r.header.resultCode))throw new HolidayFailure(apiReason(r.header.resultCode));
 if(!r.body)throw new Error('INVALID_HOLIDAYS');
 const items=(r.body.items as {item?:unknown}|null)?.item;
 const rows=items===undefined?[]:Array.isArray(items)?items:[items];
 if(!r.body.totalCount||rows.length!==r.body.totalCount)throw new Error('INCOMPLETE_HOLIDAYS');
 const seen=new Set<string>();return rows.map(row=>{
  const i=itemSchema.parse(row);const date=localDate.parse(`${i.locdate.slice(0,4)}-${i.locdate.slice(4,6)}-${i.locdate.slice(6)}`);
  if(Number(date.slice(0,4))!==year)throw new Error('INVALID_HOLIDAYS');
  return {date,name:i.dateName,isHoliday:i.isHoliday==='Y'};
 }).filter(i=>{const k=i.date+'|'+i.name;if(seen.has(k))return false;seen.add(k);return true;});
}
export async function fetchHolidayYear(year:number,key:string,transport:typeof fetch=fetch){
 const url=new URL('https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo');
 // The portal displays either key format. Normalize once, preserving literal +.
 url.search=new URLSearchParams({ServiceKey:normalizeHolidayKey(key),solYear:String(year),pageNo:'1',numOfRows:'1000'}).toString();
 const response=await transport(url,{signal:AbortSignal.timeout(4500),redirect:'error',headers:{Accept:'application/xml'}});
 if(!response.ok)throw new HolidayFailure(`HTTP_${response.status}`);
 if(Number(response.headers.get('Content-Length')||0)>512000)throw new Error('INVALID_HOLIDAYS');
 const reader=response.body?.getReader();if(!reader)throw new Error('HOLIDAY_FETCH_FAILED');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>512000)throw new Error('INVALID_HOLIDAYS');chunks.push(r.value);}}finally{await reader.cancel().catch(()=>{});}
 const raw=Buffer.concat(chunks).toString('utf8');
 return {items:parseHolidays(raw,year),hash:createHash('sha256').update(raw).digest('hex')};
}


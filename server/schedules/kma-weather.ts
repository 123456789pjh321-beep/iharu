import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {z} from 'zod';
import type {WeatherDay,WeatherRegion} from '../../shared/calendar-weather.js';
import {addDays,koreaToday} from '../../shared/schedules.js';

type KmaRow=Record<string,unknown>;
type Operation='getMidLandFcst'|'getMidTa'|'getVilageFcst';
type Period=NonNullable<WeatherDay['morning']>;
const pageSize=1000;
const envelope=z.object({response:z.object({
 header:z.object({resultCode:z.coerce.string()}),
 body:z.object({totalCount:z.coerce.number().int().min(0).max(5000),items:z.unknown().optional()}).optional(),
})});
const rowsSchema=z.array(z.record(z.string(),z.unknown())).max(pageSize);
class KmaAccessError extends Error{}
const formatIssue=(date:Date)=>date.toISOString().replace(/\D/g,'').slice(0,12);
const issueDate=(issue:string)=>`${issue.slice(0,4)}-${issue.slice(4,6)}-${issue.slice(6,8)}`;

// Shift only this working clock to KST before choosing a published issue.
export function kmaIssueTimes(now:Date,shortTerm=false):string[]{
 const local=new Date(now.getTime()+9*3600000-20*60000);
 const hour=local.getUTCHours();
 if(shortTerm){
  const latestHour=2+Math.floor((hour-2)/3)*3;
  local.setUTCHours(latestHour,0,0,0);
 }else if(hour<6){
  local.setUTCDate(local.getUTCDate()-1);
  local.setUTCHours(18,0,0,0);
 }else local.setUTCHours(hour>=18?18:6,0,0,0);
 const interval=shortTerm?3:12;
 return [local,new Date(local.getTime()-interval*3600000)]
  .filter(issue=>now.getTime()+9*3600000-issue.getTime()<=24*3600000).map(formatIssue);
}

// KMA's 5 km Lambert conformal grid, using the existing representative city point.
export function kmaGridPoint(region:Pick<WeatherRegion,'lat'|'lng'>){
 const radians=Math.PI/180;
 const radius=6371.00877/5;
 const parallel1=30*radians,parallel2=60*radians;
 const exponent=Math.log(Math.cos(parallel1)/Math.cos(parallel2))
  /Math.log(Math.tan(Math.PI/4+parallel2/2)/Math.tan(Math.PI/4+parallel1/2));
 const scale=Math.pow(Math.tan(Math.PI/4+parallel1/2),exponent)*Math.cos(parallel1)/exponent;
 const originRadius=radius*scale/Math.pow(Math.tan(Math.PI/4+38*radians/2),exponent);
 const pointRadius=radius*scale/Math.pow(Math.tan(Math.PI/4+region.lat*radians/2),exponent);
 const angle=(region.lng-126)*radians*exponent;
 return {nx:Math.round(pointRadius*Math.sin(angle)+43),ny:Math.round(originRadius-pointRadius*Math.cos(angle)+136)};
}

async function fetchItems(operation:Operation,parameters:Record<string,string>,key:string,request:typeof fetch):Promise<KmaRow[]>{
 const service=operation==='getVilageFcst'?'VilageFcstInfoService_2.0':'MidFcstInfoService';
 async function page(number:number){
  const url=new URL(`https://apihub.kma.go.kr/api/typ02/openApi/${service}/${operation}`);
  url.search=new URLSearchParams({...parameters,pageNo:String(number),numOfRows:String(pageSize),dataType:'JSON',authKey:key}).toString();
  const response=await request(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000),redirect:'error'});
  if(response.status===401||response.status===403)throw new KmaAccessError('KMA_ACCESS_REQUIRED');
  if(!response.ok)throw new Error('KMA_HTTP_ERROR');
  const raw=await response.text();
  if(raw.length>1_000_000||/<!DOCTYPE|<!ENTITY/i.test(raw))throw new Error('KMA_INVALID_RESPONSE');
  let value:unknown;
  if(raw.trim().startsWith('{'))value=JSON.parse(raw);
  else{
   if(XMLValidator.validate(raw)!==true)throw new Error('KMA_INVALID_RESPONSE');
   value=new XMLParser({parseTagValue:false,processEntities:false}).parse(raw);
  }
  const parsed=envelope.parse(value).response;
  if(!/^0+$/.test(parsed.header.resultCode))throw new Error('KMA_SERVICE_ERROR');
  if(!parsed.body)throw new Error('KMA_INVALID_RESPONSE');
  const item=(parsed.body.items as {item?:unknown}|null)?.item;
  const rows=rowsSchema.parse(item===undefined?[]:Array.isArray(item)?item:[item]);
  return {rows,total:parsed.body.totalCount};
 }
 const first=await page(1);
 const additional=Array.from({length:Math.max(0,Math.ceil(first.total/pageSize)-1)},(_,index)=>page(index+2));
 const pages=await Promise.all(additional);
 const rows=[...first.rows,...pages.flatMap(result=>result.rows)];
 if(rows.length!==first.total)throw new Error('KMA_INCOMPLETE_RESPONSE');
 return rows;
}

async function fetchIssued(operation:Operation,region:WeatherRegion,key:string,now:Date,request:typeof fetch){
 const issues=kmaIssueTimes(now,operation==='getVilageFcst');
 for(const issuedAt of issues){
  const grid=kmaGridPoint(region);
  const parameters:Record<string,string>=operation==='getVilageFcst'
   ?{base_date:issuedAt.slice(0,8),base_time:issuedAt.slice(8),nx:String(grid.nx),ny:String(grid.ny)}
   :{regId:operation==='getMidLandFcst'?region.kmaLandRegId:region.kmaTemperatureRegId,tmFc:issuedAt};
  try{
   const rows=await fetchItems(operation,parameters,key,request);
   if(rows.length)return {rows,issuedAt};
  }catch(error){
   // A different issue cannot fix missing API access. Never log the upstream error URL.
   if(error instanceof KmaAccessError)break;
  }
 }
 console.warn(JSON.stringify({code:'KMA_WEATHER_UNAVAILABLE',operation}));
 return {rows:[] as KmaRow[],issuedAt:issues[0]};
}

function number(value:unknown,minimum=-80,maximum=60):number|undefined{
 if(value===undefined||value===null||value==='')return undefined;
 const result=Number(value);
 return Number.isFinite(result)&&result>=minimum&&result<=maximum?result:undefined;
}

function condition(description:string):string{
 if(/비.*눈|눈.*비/.test(description))return 'RAIN_AND_SNOW';
 if(description.includes('눈'))return 'SNOW';
 if(description.includes('소나기'))return 'SHOWERS';
 if(description.includes('비'))return 'RAIN';
 if(description.includes('흐림')||description.includes('흐리'))return 'OVERCAST';
 if(description.includes('구름많'))return 'MOSTLY_CLOUDY';
 if(description.includes('구름조금'))return 'PARTLY_CLOUDY';
 return description.includes('맑')?'CLEAR':'';
}

function period(description:unknown,probability:unknown):Period|undefined{
 if(typeof description!=='string'||!description.trim())return undefined;
 return {description:description.trim(),condition:condition(description),precipitationChance:number(probability,0,100)};
}

function daily(date:string,issuedAt:string,morning:Period|undefined,afternoon:Period|undefined,allDay?:Period):WeatherDay|undefined{
 const parts=[morning,afternoon,allDay].filter((part):part is Period=>!!part);
 if(!parts.length)return undefined;
 const wet=parts.find(part=>/RAIN|SNOW|SHOWER/.test(part.condition));
 const representative=wet??afternoon??parts[0];
 const chances=parts.flatMap(part=>part.precipitationChance===undefined?[]:[part.precipitationChance]);
 const description=morning&&afternoon&&morning.description!==afternoon.description
  ?`오전 ${morning.description} · 오후 ${afternoon.description}`:representative.description;
 return {date,condition:representative.condition,description,source:'kma',issuedAt,
  precipitationChance:chances.length?Math.max(...chances):undefined,morning,afternoon};
}

function midTermDays(rows:KmaRow[],issuedAt:string,temperatures:KmaRow[],temperatureIssue:string):WeatherDay[]{
 const land=rows[0];
 if(!land)return [];
 const temperatureByDate=new Map<string,{high?:number;low?:number}>();
 for(let offset=4;offset<=10;offset++){
  temperatureByDate.set(addDays(issueDate(temperatureIssue),offset),{
   high:number(temperatures[0]?.[`taMax${offset}`]),low:number(temperatures[0]?.[`taMin${offset}`]),
  });
 }
 const days:WeatherDay[]=[];
 for(let offset=4;offset<=10;offset++){
  const date=addDays(issueDate(issuedAt),offset);
  const morning=offset<8?period(land[`wf${offset}Am`],land[`rnSt${offset}Am`]):undefined;
  const afternoon=offset<8?period(land[`wf${offset}Pm`],land[`rnSt${offset}Pm`]):undefined;
  const allDay=offset>=8?period(land[`wf${offset}`],land[`rnSt${offset}`]):undefined;
  const day=daily(date,issuedAt,morning,afternoon,allDay);
  if(day)days.push({...day,...temperatureByDate.get(date)});
 }
 return days;
}

function shortTermDays(rows:KmaRow[],issuedAt:string):WeatherDay[]{
 const dates=new Map<string,Map<string,Map<string,unknown>>>();
 for(const row of rows){
  const date=String(row.fcstDate??''),time=String(row.fcstTime??'');
  if(!/^\d{8}$/.test(date)||!/^\d{4}$/.test(time)||typeof row.category!=='string')continue;
  const hours=dates.get(date)??new Map<string,Map<string,unknown>>();
  const values=hours.get(time)??new Map<string,unknown>();
  values.set(row.category,row.fcstValue);hours.set(time,values);dates.set(date,hours);
 }
 const days:WeatherDay[]=[];
 for(const [compactDate,hours] of dates){
  const date=issueDate(compactDate);
  if(!z.iso.date().safeParse(date).success)continue;
  function summarize(afternoon:boolean):Period|undefined{
   const parts=[...hours].filter(([time])=>(Number(time)>=1200)===afternoon).flatMap(([,values])=>{
    const precipitation=String(values.get('PTY')??'0');
    const sky=String(values.get('SKY')??'');
    const description=({'1':'비','2':'비/눈','3':'눈','4':'소나기'} as Record<string,string>)[precipitation]
     ??({'1':'맑음','3':'구름많음','4':'흐림'} as Record<string,string>)[sky];
    const result=period(description,values.get('POP'));
    return result?[result]:[];
   });
   if(!parts.length)return undefined;
   const selected=parts.find(part=>/RAIN|SNOW|SHOWER/.test(part.condition))
    ??parts.find(part=>part.condition==='OVERCAST')??parts.find(part=>part.condition==='MOSTLY_CLOUDY')??parts[0];
   const chances=parts.flatMap(part=>part.precipitationChance===undefined?[]:[part.precipitationChance]);
   return {...selected,precipitationChance:chances.length?Math.max(...chances):undefined};
  }
  const day=daily(date,issuedAt,summarize(false),summarize(true));
  if(!day)continue;
  const high=[...hours.values()].flatMap(values=>{const value=number(values.get('TMX'));return value===undefined?[]:[value];});
  const low=[...hours.values()].flatMap(values=>{const value=number(values.get('TMN'));return value===undefined?[]:[value];});
  days.push({...day,high:high.length?Math.max(...high):undefined,low:low.length?Math.min(...low):undefined});
 }
 return days;
}

export async function fetchKmaForecast(region:WeatherRegion,key:string,request:typeof fetch=fetch,now=new Date()):Promise<WeatherDay[]>{
 const [land,temperatures,short]=await Promise.all([
  fetchIssued('getMidLandFcst',region,key,now,request),
  fetchIssued('getMidTa',region,key,now,request),
  fetchIssued('getVilageFcst',region,key,now,request),
 ]);
 const days=new Map<string,WeatherDay>();
 for(const day of midTermDays(land.rows,land.issuedAt,temperatures.rows,temperatures.issuedAt))days.set(day.date,day);
 // The more detailed short-term forecast wins where both services cover the same date.
 for(const day of shortTermDays(short.rows,short.issuedAt))days.set(day.date,day);
 const today=koreaToday(now),lastDate=addDays(today,10);
 return [...days.values()].filter(day=>day.date>=today&&day.date<=lastDate).sort((a,b)=>a.date.localeCompare(b.date));
}

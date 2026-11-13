import {createHash} from 'node:crypto';
import {z} from 'zod';
import {briefingRegionKeyword,instagramPostLink,type BriefingItem} from '../../shared/briefing.js';
import {addDays} from '../../shared/schedules.js';

export const instagramCandidateSchema=z.object({
 sourceUrl:z.string().max(2048),
 topic:z.enum(['LOCAL','FOOD','DATE','PLACE','NEWS']),
 title:z.string().trim().min(5).max(100),
 summary:z.string().trim().min(12).max(400),
 locationEvidence:z.string().trim().min(2).max(180),
 publishedAt:z.iso.date(),
 eventEndsOn:z.iso.date().nullable()
}).strict();

type InstagramCandidate=z.infer<typeof instagramCandidateSchema>;
type InstagramLink=NonNullable<ReturnType<typeof instagramPostLink>>;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');

async function confirmPublicPost(fetcher:typeof fetch,link:InstagramLink,locationEvidence:string){
 const response=await fetcher(link.url,{redirect:'manual',signal:AbortSignal.timeout(6000)});
 if(response.status===429||response.status>=500){
  await response.body?.cancel().catch(()=>{});
  throw Error('INSTAGRAM_UNAVAILABLE');
 }
 if(!response.ok||!response.headers.get('Content-Type')?.includes('text/html')||!response.body){
  await response.body?.cancel().catch(()=>{});
  return false;
 }
 const decoder=new TextDecoder(),reader=response.body.getReader();
 let html='';
 try{
  while(html.length<128000){
   const {done,value}=await reader.read();
   if(done)break;
   html+=decoder.decode(value,{stream:true});
   const canonical=/<meta\b[^>]*\bproperty="og:url"\s+content="([^"]+)"/i.exec(html)?.[1];
   const caption=/<meta\b[^>]*\bproperty="og:description"\s+content="([^"]+)"/i.exec(html)?.[1];
   if(canonical&&caption){
    const normalize=(text:string)=>text.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
    return instagramPostLink(canonical)?.id===link.id&&normalize(caption).includes(normalize(locationEvidence));
   }
  }
  return false;
 }finally{await reader.cancel().catch(()=>{});}
}

async function confirmInstagramPost(fetcher:typeof fetch,link:InstagramLink){
 const url=new URL('https://graph.facebook.com/v27.0/instagram_oembed');
 url.searchParams.set('url',link.url);
 url.searchParams.set('omitscript','true');
 const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(6500)});
 if(response.status===404){await response.body?.cancel().catch(()=>{});return false;}
 if(!response.ok){
  const data=await response.json().catch(()=>null) as {error?:{code?:number}}|null;
  if(response.status===400&&data?.error?.code===24)return false;
  throw Error('INSTAGRAM_UNAVAILABLE');
 }
 const data=await response.json() as {provider_name?:string;type?:string;html?:string};
 const permalink=typeof data.html==='string'&&/\bdata-instgrm-permalink="([^"]+)"/.exec(data.html)?.[1];
 if(data.provider_name!=='Instagram'||data.type!=='rich'||!permalink)throw Error('INSTAGRAM_UNAVAILABLE');
 return instagramPostLink(permalink)?.id===link.id;
}

export async function selectInstagramItems(
 fetcher:typeof fetch,candidates:InstagramCandidate[],sources:string[],region:string,day:string
){
 const cited=new Set(sources.flatMap(url=>instagramPostLink(url)?.id??[]));
 const keyword=briefingRegionKeyword(region);
 const localityNames=region==='경기도 화성시'?[keyword,'동탄']:[keyword];
 const earliest=addDays(day,-21),latest=addDays(day,21);
 const eligible=new Map<string,{candidate:InstagramCandidate;link:InstagramLink}>();
 for(const candidate of [...candidates].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))){
  const link=instagramPostLink(candidate.sourceUrl);
  if(!link||!cited.has(link.id)||eligible.has(link.id)||!localityNames.some(name=>name&&candidate.locationEvidence.includes(name)))continue;
  if(candidate.publishedAt<earliest||candidate.publishedAt>day||candidate.eventEndsOn&&candidate.eventEndsOn<day)continue;
  eligible.set(link.id,{candidate,link});
 }
 const results=await Promise.allSettled([...eligible.values()].slice(0,6).map(async({candidate,link})=>{
  const instagramEmbeddable=await confirmInstagramPost(fetcher,link);
  if(!instagramEmbeddable&&!await confirmPublicPost(fetcher,link,candidate.locationEvidence))return null;
  return {
   fingerprint:hash('instagram:'+link.id),
   contentHash:hash(JSON.stringify([link.id,candidate.publishedAt,candidate.eventEndsOn,instagramEmbeddable])),
   category:'EVENT',collectionType:candidate.topic,editorialType:'INSTAGRAM',instagramEmbeddable,
   title:candidate.title,summary:candidate.summary,
   reason:`${keyword} 지역 공개 게시물이에요.`,action:'일정과 방문 조건은 인스타그램 원문에서 확인해 주세요.',
   sourceUrl:link.url,sourceName:'Instagram',evidenceQuote:candidate.locationEvidence,
   publishedAt:candidate.publishedAt,validFrom:candidate.publishedAt,
   validUntil:candidate.eventEndsOn?(candidate.eventEndsOn<latest?candidate.eventEndsOn:latest):addDays(candidate.publishedAt,21),
   matchKey:keyword,score:90,urgent:false
  } satisfies BriefingItem&{collectionType:InstagramCandidate['topic']};
 }));
 return {
  items:results.flatMap(result=>result.status==='fulfilled'&&result.value?[result.value]:[]).slice(0,3),
  unavailable:results.some(result=>result.status==='rejected')
 };
}

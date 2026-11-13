import type {MenuReceipt} from './workspace-updates.js';
import {z} from 'zod';
export const briefingConsentVersion='briefing-2026-11-12-v2';
export const briefingCategories=['FACILITY','NOTICE','EVENT','SAFETY'] as const;
export const briefingCategoryNames={FACILITY:'시설 이용',NOTICE:'중요 공지',EVENT:'이벤트',SAFETY:'안전 소식'};
export const briefingItemSchema=z.object({fingerprint:z.string(),contentHash:z.string(),category:z.enum(briefingCategories),title:z.string(),summary:z.string(),reason:z.string(),action:z.string(),sourceUrl:z.url(),sourceName:z.string(),evidenceQuote:z.string(),validFrom:z.iso.date(),validUntil:z.iso.date(),matchKey:z.string(),score:z.number(),urgent:z.boolean(),editorialType:z.enum(['REGIONAL_GUIDE','NEWS','INSTAGRAM']).optional(),publishedAt:z.iso.date().optional(),instagramEmbeddable:z.boolean().optional()});
export type BriefingItem=z.infer<typeof briefingItemSchema>;
export type BriefingPreferences={enabled:boolean;region:string;version:number;lastCheckedAt:string|null;lastState:string|null;newContentCount:number};
export type BriefingPost={id:string;day:string;kind:'REGULAR'|'URGENT';region:string;items:BriefingItem[];createdAt:string;updatedAt:string;saved:boolean;helpful:boolean};
export type BriefingFeed={updateReceipt?:MenuReceipt;preferences:BriefingPreferences;available:boolean;posts:BriefingPost[];hasMore:boolean;nextCursor:{updatedAt:string;id:string}|null;serverDay:string};
export type BriefingSystem={enabled:boolean;model:string;dailyCallLimit:number;version:number;callsToday:number;queued:number;failed:number};
export const briefingSystemInput=z.object({enabled:z.boolean(),dailyCallLimit:z.number().int().min(2).max(1000),version:z.number().int().min(0)}).strict();
// Coarse suggestions only, evaluated on this device; coordinates never leave the browser.
const cities:[string,number,number][]=[['서울특별시',37.57,126.98],['경기도 수원시',37.26,127.03],['경기도 용인시',37.24,127.18],['경기도 화성시',37.20,126.83],['경기도 성남시',37.42,127.13],['경기도 군포시',37.36,126.94],['경기도 안양시',37.39,126.96],['경기도 안산시',37.32,126.83],['경기도 시흥시',37.38,126.80],['인천광역시',37.46,126.71],['경기도 부천시',37.50,126.77],['경기도 광명시',37.48,126.86],['경기도 고양시',37.66,126.83],['경기도 김포시',37.62,126.72],['경기도 의정부시',37.74,127.03],['경기도 양주시',37.79,127.05],['경기도 남양주시',37.64,127.22],['경기도 오산시',37.15,127.07],['경기도 평택시',36.99,127.11],['경기도 광주시',37.43,127.26],['경기도 이천시',37.28,127.44],['전북특별자치도 전주시',35.82,127.15],['대전광역시',36.35,127.38],['세종특별자치시',36.48,127.29],['충청북도 청주시',36.64,127.49],['충청남도 천안시',36.82,127.15],['강원특별자치도 춘천시',37.88,127.73],['부산광역시',35.18,129.08],['대구광역시',35.87,128.60],['울산광역시',35.54,129.31],['광주광역시',35.16,126.85],['제주특별자치도 제주시',33.50,126.53]];
const dongtanRegion='경기도 화성시 동탄구';
export const briefingRegions = cities.map(([name]) => name);
briefingRegions.splice(briefingRegions.indexOf('경기도 화성시')+1,0,dongtanRegion);

export function briefingRegionKeyword(region:string){
 return (region.split(' ').at(-1)??'').replace(/(?:특별자치시|특별시|광역시|시|군|구)$/u,'');
}

export function briefingSearchCity(region:string){
 return region===dongtanRegion?'경기도 화성시':region;
}

export function instagramPostLink(value:string){
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!['instagram.com','www.instagram.com'].includes(url.hostname))return null;
  const match=/^\/(?:([\w.]{1,30})\/)?(p|reels?|tv)\/([A-Za-z0-9_-]{5,30})\/?$/.exec(url.pathname);
  if(!match)return null;
  const [,account,path,id]=match;
  if(account&&['share','explore','accounts','stories'].includes(account))return null;
  const kind=path==='reels'?'reel':path;
  return {id,kind,url:`https://www.instagram.com/${kind}/${id}/`};
 }catch{return null;}
}

export const briefingPreferenceInput = z.object({
 enabled: z.boolean(),
 region: z.string().trim().max(60),
 consent: z.boolean(),
 consentVersion: z.literal(briefingConsentVersion).optional(),
 version: z.number().int().min(0)
}).strict().refine(
 p => !p.enabled || (p.consent && p.consentVersion === briefingConsentVersion && briefingRegions.includes(p.region)),
 '브리핑에 사용할 지역과 최신 AI 처리 안내를 확인해 주세요.'
);

export function suggestBriefingRegion(latitude:number,longitude:number){if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return null;const sorted=cities.map(([name,lat,lon])=>({name,distance:Math.hypot((lat-latitude)*111,(lon-longitude)*88)})).sort((a,b)=>a.distance-b.distance);return sorted[0].distance<=30?sorted[0].name:null;}

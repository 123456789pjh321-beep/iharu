import {afterEach,expect,it,vi} from 'vitest';
import {fetchKmaForecast,kmaGridPoint,kmaIssueTimes} from '../server/schedules/kma-weather';
import {calendarWeatherSchema,weatherRegions} from '../shared/calendar-weather';

const now=new Date('2026-11-18T09:00:00+09:00');
const seoul=weatherRegions.find(region=>region.id==='seoul')!;
const reply=(rows:Record<string,unknown>[],total=rows.length)=>Response.json({response:{
 header:{resultCode:'00',resultMsg:'NORMAL_SERVICE'},body:{totalCount:total,items:{item:rows}},
}});
afterEach(()=>vi.restoreAllMocks());

it('uses KST publication dates and only requests issues within the documented 24-hour window',()=>{
 expect(kmaIssueTimes(now)).toEqual(['202611180600','202611171800']);
 expect(kmaIssueTimes(new Date('2026-11-18T06:10:00+09:00'))).toEqual(['202611171800']);
 expect(kmaIssueTimes(new Date('2026-11-18T18:30:00+09:00'))).toEqual(['202611181800','202611180600']);
 expect(kmaIssueTimes(new Date('2026-01-01T00:10:00+09:00'))).toEqual(['202512311800','202512310600']);
 expect(kmaIssueTimes(new Date('2026-11-18T01:00:00+09:00'),true)).toEqual(['202611172300','202611172000']);
 expect(kmaIssueTimes(new Date('2026-11-18T02:30:00+09:00'),true)).toEqual(['202611180200','202611172300']);
});

it('uses separate land and city codes from the supplied workbook, including the selected Yeoncheon row',()=>{
 const suwon=weatherRegions.find(region=>region.id==='suwon')!;
 const yeoncheon=weatherRegions.find(region=>region.id==='yeoncheon')!;
 expect(suwon).toMatchObject({kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20601'});
 expect(yeoncheon).toMatchObject({kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20402'});
 expect(kmaGridPoint(seoul)).toEqual({nx:60,ny:127});
 expect(kmaGridPoint(yeoncheon)).toEqual({nx:61,ny:138});
});

it('combines today’s short-term forecast with morning/afternoon mid-term data and preserves zero temperatures',async()=>{
 const request=vi.fn(async(url:URL)=>{
  if(url.pathname.endsWith('getMidLandFcst'))return reply([{
   regId:'11B00000',wf4Am:'맑음',wf4Pm:'흐리고 비',rnSt4Am:10,rnSt4Pm:60,wf8:'맑음',rnSt8:0,
  }]);
  if(url.pathname.endsWith('getMidTa'))return reply([{regId:'11B10101',taMin4:0,taMax4:12,taMin8:-2,taMax8:8}]);
  return reply([
   {fcstDate:'20261118',fcstTime:'0900',category:'SKY',fcstValue:'1'},
   {fcstDate:'20261118',fcstTime:'0900',category:'POP',fcstValue:'0'},
   {fcstDate:'20261118',fcstTime:'0900',category:'TMN',fcstValue:'0'},
   {fcstDate:'20261118',fcstTime:'1500',category:'SKY',fcstValue:'1'},
   {fcstDate:'20261118',fcstTime:'1500',category:'TMX',fcstValue:'10'},
  ]);
 });
 const days=await fetchKmaForecast(seoul,'fixture-private-key',request as typeof fetch,now);
 expect(days.map(day=>day.date)).toEqual(['2026-11-18','2026-11-22','2026-11-26']);
 expect(days[0]).toMatchObject({condition:'CLEAR',high:10,low:0,precipitationChance:0,source:'kma'});
 expect(days[1]).toMatchObject({condition:'RAIN',description:'오전 맑음 · 오후 흐리고 비',high:12,low:0,
  precipitationChance:60,morning:{description:'맑음',precipitationChance:10},afternoon:{description:'흐리고 비',precipitationChance:60}});
 expect(days[2]).toMatchObject({condition:'CLEAR',high:8,low:-2,precipitationChance:0});
 expect(days[2].morning).toBeUndefined();expect(days[2].afternoon).toBeUndefined();
 expect(calendarWeatherSchema.safeParse({status:'ok',days}).success).toBe(true);
 expect(JSON.stringify(days)).not.toContain('fixture-private-key');
 expect(request.mock.calls).toHaveLength(3);
 for(const [url] of request.mock.calls){
  expect(url.origin).toBe('https://apihub.kma.go.kr');
  expect(url.searchParams.get('authKey')).toBe('fixture-private-key');
  expect(url.searchParams.has('serviceKey')).toBe(false);
 }
 expect(request.mock.calls.find(([url])=>url.pathname.endsWith('getMidLandFcst'))![0].searchParams.get('regId')).toBe('11B00000');
 expect(request.mock.calls.find(([url])=>url.pathname.endsWith('getMidTa'))![0].searchParams.get('regId')).toBe('11B10101');
});

it('keeps authorized land forecasts and does not retry API access denials with another issue',async()=>{
 vi.spyOn(console,'warn').mockImplementation(()=>{});
 const request=vi.fn(async(url:URL)=>url.pathname.endsWith('getMidLandFcst')
  ?reply([{wf4Am:'맑음',wf4Pm:'구름많음',rnSt4Am:0,rnSt4Pm:20}])
  :Response.json({result:{status:403,message:'활용신청이 필요한 API 입니다.'}},{status:403}));
 const days=await fetchKmaForecast(seoul,'fixture-key',request as typeof fetch,now);
 expect(days).toHaveLength(1);
 expect(days[0]).toMatchObject({source:'kma',date:'2026-11-22',precipitationChance:20});
 expect(days[0].high).toBeUndefined();expect(days[0].low).toBeUndefined();
 expect(request.mock.calls).toHaveLength(3);
});

it('anchors a previous evening issue to its publication date and keeps optional upstream failures isolated',async()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 const request=vi.fn(async(url:URL)=>{
  if(url.pathname.endsWith('getMidLandFcst')){
   return url.searchParams.get('tmFc')==='202611180600'?reply([]):reply([{wf5Am:'맑음',wf5Pm:'구름많음',rnSt5Am:0,rnSt5Pm:20}]);
  }
  throw new Error('upstream URL authKey=fixture-private-key');
 });
 const days=await fetchKmaForecast(seoul,'fixture-private-key',request as typeof fetch,now);
 expect(days).toHaveLength(1);
 expect(days[0]).toMatchObject({date:'2026-11-22',issuedAt:'202611171800',source:'kma'});
 expect(days[0].high).toBeUndefined();
 expect(days[0].low).toBeUndefined();
 expect(JSON.stringify(warn.mock.calls)).not.toContain('fixture-private-key');
});

it('accepts the documented XML response and rejects missing-value temperature sentinels',async()=>{
 vi.spyOn(console,'warn').mockImplementation(()=>{});
 const request=vi.fn(async(url:URL)=>{
  if(url.pathname.endsWith('getMidLandFcst'))return new Response('<response><header><resultCode>00</resultCode></header><body><totalCount>1</totalCount><items><item><wf4Am>비/눈</wf4Am><rnSt4Am>80</rnSt4Am></item></items></body></response>');
  if(url.pathname.endsWith('getMidTa'))return reply([{taMin4:'',taMax4:-999}]);
  return reply([]);
 });
 const days=await fetchKmaForecast(seoul,'fixture-key',request as typeof fetch,now);
 expect(days[0]).toMatchObject({date:'2026-11-22',condition:'RAIN_AND_SNOW',precipitationChance:80});
 expect(days[0].low).toBeUndefined();expect(days[0].high).toBeUndefined();
});

it('reads every short-term page and uses detailed forecasts ahead of overlapping mid-term values',async()=>{
 vi.spyOn(console,'warn').mockImplementation(()=>{});
 const request=vi.fn(async(url:URL)=>{
  if(url.pathname.endsWith('getMidLandFcst'))return reply([{wf4Am:'맑음',wf4Pm:'맑음'}]);
  if(url.pathname.endsWith('getMidTa'))return reply([{taMax4:12,taMin4:3}]);
  const item={fcstDate:'20261122',fcstTime:'1500',category:'SKY',fcstValue:'4'};
  return url.searchParams.get('pageNo')==='1'?reply(Array.from({length:1000},()=>item),1001)
   :reply([{...item,category:'TMX',fcstValue:'9'}],1001);
 });
 const days=await fetchKmaForecast(seoul,'fixture-key',request as typeof fetch,now);
 expect(days).toHaveLength(1);
 expect(days[0]).toMatchObject({date:'2026-11-22',condition:'OVERCAST',high:9});
 expect(request.mock.calls.some(([url])=>url.searchParams.get('pageNo')==='2')).toBe(true);
});

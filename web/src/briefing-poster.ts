import {briefingCategoryNames as baseCategoryNames,type BriefingFeed as BaseFeed,type BriefingItem as BaseItem,type BriefingPost as BasePost} from '../../shared/briefing';

export const briefingCategoryNames={...baseCategoryNames,LOCAL:'지역 소식',WEATHER:'날씨',FOOD:'지역 맛집',DATE:'데이트·나들이',PLACE:'유용한 시설',NEWS:'지역 주요 뉴스'};
type RegionalTopic='FOOD'|'DATE'|'PLACE'|'NEWS';
export type BriefingItem=BaseItem&{
 collectionType?:'LOCAL'|'WEATHER'|RegionalTopic;
 topic?:RegionalTopic;
 posterSummary?:string;
 highlights?:string[];
 sourceCheckedAt?:string;
 publishedAt?:string;
};
export type BriefingPost=Omit<BasePost,'items'>&{items:BriefingItem[]};
export type BriefingFeed=Omit<BaseFeed,'posts'>&{posts:BriefingPost[]};

const clean=(value:string,max:number)=>value.replace(/\s+/g,' ').trim().slice(0,max);
export function briefingPosterContent(item:BriefingItem){
 if(item.collectionType==='WEATHER'){
  const today=/\d{4}-\d{2}-\d{2}\s+([^,]+),\s*최저\s*([-\d.]+)°C\s*·\s*최고\s*([-\d.]+)°C,\s*강수확률\s*(\d+)%/.exec(item.summary);
  if(today)return {summary:clean(item.posterSummary||'외출 전 기온과 비 소식을 한눈에 확인해요.',100),points:[today[1],'최저 '+today[2]+'° · 최고 '+today[3]+'°','강수확률 '+today[4]+'%']};
 }
 return {summary:clean(item.posterSummary||item.summary.split(/(?<=[.!?。])\s/)[0]||item.summary,100),points:(item.highlights||[]).slice(0,3).map(s=>clean(s,55))};
}

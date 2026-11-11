import type {BriefingPreferences} from '../../shared/briefing';
import type {BriefingItem,BriefingPost} from './briefing-poster';

export type BriefingCollectionStatus={tone:'neutral'|'warning';title:string;description:string};
/** A failed collection must never be presented as a successful empty result. */
export function briefingCollectionStatus(preferences:BriefingPreferences,available:boolean):BriefingCollectionStatus{
 if(!available)return {tone:'warning',title:'자동 브리핑 연결을 확인하고 있어요',description:'운영 연결이 준비되면 소식 수집을 다시 확인해요.'};
 switch(preferences.lastState){
  case 'ERROR':return {tone:'warning',title:'최근 소식 수집에 실패했어요',description:'자동 수집을 다시 시도해요. 새로고침하면 현재 저장된 소식을 다시 불러와요.'};
  case 'LIMIT':return {tone:'warning',title:'오늘의 자동 수집 한도에 도달했어요',description:'다음 자동 확인 때 다시 시도해요.'};
  case 'MISSING_KEY':return {tone:'warning',title:'자동 브리핑 연결을 확인하고 있어요',description:'운영 연결을 마치면 실제 소식을 수집할 수 있어요.'};
  case 'NO_CONTEXT':return {tone:'warning',title:'기준 지역을 확인해 주세요',description:'더보기 → 설정 → AI 브리핑에서 기준 지역을 저장해 주세요.'};
  case 'EMPTY':return {tone:'neutral',title:'최근 수집에서 새로운 소식이 없었어요',description:'설정한 지역과 일정에 맞는 새 소식을 확인해요.'};
  case 'DONE':return {tone:'neutral',title:'지금 표시할 소식이 없어요',description:'새 소식이 준비되면 이곳에 보여드려요.'};
  default:return {tone:'neutral',title:'첫 브리핑을 준비하고 있어요',description:'실제 소식이 준비되면 샘플 대신 보여드려요.'};
 }
}

/** Browser-only preview. Its non-UUID id cannot be submitted as persisted feedback. */
export function createBriefingSample(day:string,region:string):BriefingPost{
 const common={sourceUrl:'https://myiharu.com/briefing',sourceName:'화면 설명용 샘플',evidenceQuote:'서비스 화면을 설명하기 위한 가상 예시입니다. 실제 공지나 날씨 예보가 아닙니다.',validFrom:day,validUntil:day,score:0,urgent:false};
 const items:BriefingItem[]=[
  {...common,fingerprint:'sample-facility',contentHash:'sample-facility',category:'NOTICE',collectionType:'FOOD',title:'우리 동네에서 찾는 새로운 한 끼',posterSummary:'메뉴와 장소의 특징을 사진 위에서 바로 확인하는 맛집 소개 예시예요.',highlights:['지역 맛집 예시','대표 메뉴·특징 한눈에','세부 정보는 더 보기'],summary:'설정한 지역의 음식점과 대표 메뉴·특징을 이렇게 소개해요. 실제 음식점 추천이 아닌 가상 샘플이에요.',reason:'설정한 지역에서 가볼 만한 음식점을 이런 방식으로 소개해요.',action:'실제 소식에서는 출발 전 확인할 내용과 공식 공지 링크를 안내해요.',matchKey:'예시 지역'},
  {...common,fingerprint:'sample-local',contentHash:'sample-local',category:'NOTICE',collectionType:'DATE',title:'가볍게 떠나는 우리 동네 데이트',posterSummary:'산책과 쉬어갈 장소를 함께 살펴보는 나들이 코스 예시예요.',highlights:['산책·나들이 예시','장소별 매력 한눈에','방문 정보는 더 보기'],summary:'지역의 산책 장소와 쉬어갈 공간을 묶어 나들이 아이디어를 보여드려요. 실제 방문 코스가 아닌 가상 예시예요.',reason:'설정한 지역에서 함께 가볼 만한 장소를 쉽게 살펴볼 수 있어요.',action:'실제 소식에서는 장소의 이용 안내와 방문 조건을 원문에서 확인할 수 있어요.',matchKey:'예시 지역'},
  {...common,fingerprint:'sample-weather',contentHash:'sample-weather',category:'NOTICE',collectionType:'PLACE',title:'알아두면 유용한 지역 문화 공간',posterSummary:'가까운 생활 시설의 특징과 이용 정보를 모아 보는 화면 예시예요.',highlights:['유용한 시설 예시','이용 특징 한눈에','운영 정보는 더 보기'],summary:'우리 지역의 문화·생활 시설을 살펴보는 화면 예시예요. 실제 이용 안내가 아닌 가상 샘플이에요.',reason:'가까운 문화·생활 시설을 찾아 일상에 활용할 수 있어요.',action:'실제 방문 전에는 원문에서 운영 시간과 이용 조건을 확인해 주세요.',matchKey:'예시 지역'}
 ];
 return {id:'sample-briefing',day,kind:'REGULAR',region:region?region+' · 예시':'예시 지역',items,createdAt:day+'T00:00:00+09:00',updatedAt:day+'T00:00:00+09:00',saved:false,helpful:false};
}

import {briefingSearchCity} from '../../shared/briefing';

// A dated selection from the city's public Instagram feed.
const hwaseongPosts=[
 {
  id:'DfrM8x0Dz0l',kind:'p',dongtan:false,topic:'지역 생활',
  publishedAt:'2026-11-13',displayUntil:'2026-12-04',
  title:'화성 착한가격업소 지역화폐 결제 혜택',
  summary:'대상 업소에서 연말까지 지역화폐로 결제하면 5%를 추가 환급해요. 예산이 소진되면 일찍 끝날 수 있어요.'
 },
 {
  id:'Dfq1Iwagp-n',kind:'p',dongtan:true,topic:'유용한 시설',
  publishedAt:'2026-11-13',displayUntil:'2026-12-04',
  title:'화성시가 소개한 동탄청소년문화의집',
  summary:'화성시가 10월 인기 콘텐츠에서 청소년이 쉬고 배울 수 있는 동탄청소년문화의집을 소개했어요.'
 },
 {
  id:'Dfo5kwoBabR',kind:'reel',dongtan:true,topic:'나들이',
  publishedAt:'2026-11-12',displayUntil:'2026-12-03',
  title:'무봉산 자락의 동탄 만의사 산책',
  summary:'화성특례시 서포터즈가 동탄구 만의사의 가을 풍경과 방문 정보를 릴스로 소개했어요.'
 }
];

export function briefingInstagramHighlights(region:string,day:string){
 const city=briefingSearchCity(region);
 if(city!=='경기도 화성시')return [];
 return hwaseongPosts.filter(post=>(city===region||post.dongtan)&&post.publishedAt<=day&&day<=post.displayUntil);
}

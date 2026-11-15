import {z} from 'zod';

// A city-level forecast only needs a representative point, independent of account or device location.
export const weatherRegions=[
 {id:'seoul',label:'서울',lat:37.5665,lng:126.9780},
 {id:'incheon',label:'인천',lat:37.4563,lng:126.7052},
 {id:'suwon',label:'경기 수원',lat:37.2636,lng:127.0286},
 {id:'dongtan',label:'경기 화성 동탄',lat:37.2001,lng:127.0721},
 {id:'hwaseong',label:'경기 화성 남양',lat:37.1995,lng:126.8312},
 {id:'seongnam',label:'경기 성남·판교',lat:37.3948,lng:127.1112},
 {id:'yongin',label:'경기 용인',lat:37.2411,lng:127.1776},
 {id:'goyang',label:'경기 고양',lat:37.6584,lng:126.8320},
 {id:'bucheon',label:'경기 부천',lat:37.5034,lng:126.7660},
 {id:'ansan',label:'경기 안산',lat:37.3219,lng:126.8309},
 {id:'pyeongtaek',label:'경기 평택',lat:36.9921,lng:127.1129},
 {id:'namyangju',label:'경기 남양주',lat:37.6360,lng:127.2165},
 {id:'uijeongbu',label:'경기 의정부',lat:37.7380,lng:127.0337},
 {id:'chuncheon',label:'강원 춘천',lat:37.8813,lng:127.7298},
 {id:'wonju',label:'강원 원주',lat:37.3422,lng:127.9202},
 {id:'gangneung',label:'강원 강릉',lat:37.7519,lng:128.8761},
 {id:'daejeon',label:'대전',lat:36.3504,lng:127.3845},
 {id:'sejong',label:'세종',lat:36.4800,lng:127.2890},
 {id:'cheongju',label:'충북 청주',lat:36.6424,lng:127.4890},
 {id:'cheonan',label:'충남 천안',lat:36.8151,lng:127.1139},
 {id:'jeonju',label:'전북 전주',lat:35.8242,lng:127.1480},
 {id:'gunsan',label:'전북 군산',lat:35.9677,lng:126.7368},
 {id:'gwangju',label:'광주',lat:35.1595,lng:126.8526},
 {id:'mokpo',label:'전남 목포',lat:34.8118,lng:126.3922},
 {id:'yeosu',label:'전남 여수',lat:34.7604,lng:127.6622},
 {id:'daegu',label:'대구',lat:35.8714,lng:128.6014},
 {id:'pohang',label:'경북 포항',lat:36.0190,lng:129.3435},
 {id:'andong',label:'경북 안동',lat:36.5684,lng:128.7294},
 {id:'busan',label:'부산',lat:35.1796,lng:129.0756},
 {id:'ulsan',label:'울산',lat:35.5384,lng:129.3114},
 {id:'changwon',label:'경남 창원',lat:35.2280,lng:128.6819},
 {id:'jinju',label:'경남 진주',lat:35.1796,lng:128.1076},
 {id:'jeju',label:'제주',lat:33.4996,lng:126.5312},
 {id:'seogwipo',label:'제주 서귀포',lat:33.2541,lng:126.5601},
] as const;
export type WeatherRegion=typeof weatherRegions[number];

const forecastDay=z.object({
 date:z.iso.date(),condition:z.string(),description:z.string(),
 high:z.number().optional(),low:z.number().optional(),precipitationChance:z.number().optional(),
 humidity:z.number().optional(),windKmh:z.number().optional(),uvIndex:z.number().optional(),
 rainMm:z.number().optional(),snowCm:z.number().optional(),
});
export type WeatherDay=z.infer<typeof forecastDay>;
export const calendarWeatherSchema=z.discriminatedUnion('status',[
 z.object({status:z.literal('ok'),days:z.array(forecastDay).max(10)}),
 z.object({status:z.enum(['disabled','unavailable'])}),
]);
export type CalendarWeather=z.infer<typeof calendarWeatherSchema>;

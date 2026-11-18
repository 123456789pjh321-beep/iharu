import {z} from 'zod';

// Representative city points and KMA codes are independent of account or device location.
// Mid-term region codes follow the supplied KMA 2025.12 workbook.
export const weatherRegions=[
 {id:'seoul',label:'서울',lat:37.5665,lng:126.9780,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B10101'},
 {id:'incheon',label:'인천',lat:37.4563,lng:126.7052,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20201'},
 {id:'suwon',label:'경기 수원',lat:37.2636,lng:127.0286,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20601'},
 {id:'dongtan',label:'경기 화성 동탄',lat:37.2001,lng:127.0721,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20604'},
 {id:'hwaseong',label:'경기 화성 남양',lat:37.1995,lng:126.8312,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20604'},
 {id:'seongnam',label:'경기 성남·판교',lat:37.3948,lng:127.1112,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20605'},
 {id:'yongin',label:'경기 용인',lat:37.2411,lng:127.1776,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20612'},
 {id:'goyang',label:'경기 고양',lat:37.6584,lng:126.8320,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20302'},
 {id:'bucheon',label:'경기 부천',lat:37.5034,lng:126.7660,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20204'},
 {id:'ansan',label:'경기 안산',lat:37.3219,lng:126.8309,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20203'},
 {id:'pyeongtaek',label:'경기 평택',lat:36.9921,lng:127.1129,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20606'},
 {id:'namyangju',label:'경기 남양주',lat:37.6360,lng:127.2165,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20502'},
 {id:'uijeongbu',label:'경기 의정부',lat:37.7380,lng:127.0337,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20301'},
 {id:'yeoncheon',label:'경기 연천',lat:38.0933638888888,lng:127.077066666666,kmaLandRegId:'11B00000',kmaTemperatureRegId:'11B20402'},
 {id:'chuncheon',label:'강원 춘천',lat:37.8813,lng:127.7298,kmaLandRegId:'11D10000',kmaTemperatureRegId:'11D10301'},
 {id:'wonju',label:'강원 원주',lat:37.3422,lng:127.9202,kmaLandRegId:'11D10000',kmaTemperatureRegId:'11D10401'},
 {id:'gangneung',label:'강원 강릉',lat:37.7519,lng:128.8761,kmaLandRegId:'11D20000',kmaTemperatureRegId:'11D20501'},
 {id:'daejeon',label:'대전',lat:36.3504,lng:127.3845,kmaLandRegId:'11C20000',kmaTemperatureRegId:'11C20401'},
 {id:'sejong',label:'세종',lat:36.4800,lng:127.2890,kmaLandRegId:'11C20000',kmaTemperatureRegId:'11C20404'},
 {id:'cheongju',label:'충북 청주',lat:36.6424,lng:127.4890,kmaLandRegId:'11C10000',kmaTemperatureRegId:'11C10301'},
 {id:'cheonan',label:'충남 천안',lat:36.8151,lng:127.1139,kmaLandRegId:'11C20000',kmaTemperatureRegId:'11C20301'},
 {id:'jeonju',label:'전북 전주',lat:35.8242,lng:127.1480,kmaLandRegId:'11F10000',kmaTemperatureRegId:'11F10201'},
 {id:'gunsan',label:'전북 군산',lat:35.9677,lng:126.7368,kmaLandRegId:'11F10000',kmaTemperatureRegId:'21F10501'},
 {id:'gwangju',label:'광주',lat:35.1595,lng:126.8526,kmaLandRegId:'11F20000',kmaTemperatureRegId:'11F20501'},
 {id:'mokpo',label:'전남 목포',lat:34.8118,lng:126.3922,kmaLandRegId:'11F20000',kmaTemperatureRegId:'21F20801'},
 {id:'yeosu',label:'전남 여수',lat:34.7604,lng:127.6622,kmaLandRegId:'11F20000',kmaTemperatureRegId:'11F20401'},
 {id:'daegu',label:'대구',lat:35.8714,lng:128.6014,kmaLandRegId:'11H10000',kmaTemperatureRegId:'11H10701'},
 {id:'pohang',label:'경북 포항',lat:36.0190,lng:129.3435,kmaLandRegId:'11H10000',kmaTemperatureRegId:'11H10201'},
 {id:'andong',label:'경북 안동',lat:36.5684,lng:128.7294,kmaLandRegId:'11H10000',kmaTemperatureRegId:'11H10501'},
 {id:'busan',label:'부산',lat:35.1796,lng:129.0756,kmaLandRegId:'11H20000',kmaTemperatureRegId:'11H20201'},
 {id:'ulsan',label:'울산',lat:35.5384,lng:129.3114,kmaLandRegId:'11H20000',kmaTemperatureRegId:'11H20101'},
 {id:'changwon',label:'경남 창원',lat:35.2280,lng:128.6819,kmaLandRegId:'11H20000',kmaTemperatureRegId:'11H20301'},
 {id:'jinju',label:'경남 진주',lat:35.1796,lng:128.1076,kmaLandRegId:'11H20000',kmaTemperatureRegId:'11H20701'},
 {id:'jeju',label:'제주',lat:33.4996,lng:126.5312,kmaLandRegId:'11G00000',kmaTemperatureRegId:'11G00201'},
 {id:'seogwipo',label:'제주 서귀포',lat:33.2541,lng:126.5601,kmaLandRegId:'11G00000',kmaTemperatureRegId:'11G00401'},
] as const;
export type WeatherRegion=typeof weatherRegions[number];

const forecastPeriod=z.object({
 condition:z.string(),description:z.string(),precipitationChance:z.number().min(0).max(100).optional(),
});
const forecastDay=z.object({
 date:z.iso.date(),condition:z.string(),description:z.string(),
 high:z.number().optional(),low:z.number().optional(),precipitationChance:z.number().optional(),
 humidity:z.number().optional(),windKmh:z.number().optional(),uvIndex:z.number().optional(),
 rainMm:z.number().optional(),snowCm:z.number().optional(),
 source:z.literal('kma').optional(),issuedAt:z.string().regex(/^\d{12}$/).optional(),
 morning:forecastPeriod.optional(),afternoon:forecastPeriod.optional(),
});
export type WeatherDay=z.infer<typeof forecastDay>;
export const calendarWeatherSchema=z.discriminatedUnion('status',[
 z.object({status:z.literal('ok'),days:z.array(forecastDay).max(11)}),
 z.object({status:z.enum(['disabled','unavailable'])}),
]);
export type CalendarWeather=z.infer<typeof calendarWeatherSchema>;

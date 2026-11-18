import {expect,it,vi} from 'vitest';
import {calendarWeatherRoutes,fetchCalendarForecast} from '../server/schedules/weather';
import {weatherRegions,type WeatherDay} from '../shared/calendar-weather';

it('reads Korea’s full-day forecast and keeps the credential in the Google request header',async()=>{
 const request=vi.fn(async(_url:URL,_init:RequestInit)=>Response.json({forecastDays:[{
  displayDate:{year:2026,month:11,day:17},
  fullDayForecast:{
   weatherCondition:{type:'LIGHT_RAIN',description:{text:'약한 비'}},
   precipitation:{probability:{percent:65},qpf:{quantity:3.2,unit:'MILLIMETERS'}},
   wind:{speed:{value:13,unit:'KILOMETERS_PER_HOUR'}},relativeHumidity:75,uvIndex:1,
  },
  maxTemperature:{degrees:12},minTemperature:{degrees:4},
 }]}));
 const result=await fetchCalendarForecast(weatherRegions[0],'fixture-key',request as typeof fetch);
 expect(result).toEqual([{
  date:'2026-11-17',condition:'LIGHT_RAIN',description:'약한 비',high:12,low:4,
  precipitationChance:65,humidity:75,windKmh:13,uvIndex:1,rainMm:3.2,snowCm:undefined,
 }]);
 const [url,init]=request.mock.calls[0];
 expect(url.origin+url.pathname).toBe('https://weather.googleapis.com/v1/forecast/days:lookup');
 expect(url.searchParams.get('languageCode')).toBe('ko');
 expect(url.searchParams.get('days')).toBe('10');
 expect(url.searchParams.has('key')).toBe(false);
 expect(new Headers(init.headers).get('X-Goog-Api-Key')).toBe('fixture-key');
});

it('blocks demo credentials on production and validates region IDs before any upstream request',async()=>{
 const load=vi.fn(async()=>[]);
 const production=calendarWeatherRoutes('production',{GOOGLE_WEATHER_DEMO_KEY:'fixture-demo'},load);
 expect(await (await production.request('/api/calendar/weather/seoul')).json()).toEqual({status:'disabled'});
 expect((await production.request('/api/calendar/weather/not-a-region')).status).toBe(400);
 expect(load).not.toHaveBeenCalled();
});

it('shares a short forecast cache by region and returns a generic response when Google is unavailable',async()=>{
 let now=0;
 const load=vi.fn(async()=>[{date:'2026-11-17',condition:'CLEAR',description:'맑음'}]);
 const app=calendarWeatherRoutes('preview',{GOOGLE_WEATHER_DEMO_KEY:'fixture-demo'},load,()=>now);
 const [first,second]=await Promise.all([
  app.request('/api/calendar/weather/seoul'),app.request('/api/calendar/weather/seoul'),
 ]);
 expect(await first.json()).toEqual(await second.json());
 expect(first.headers.get('cache-control')).toContain('s-maxage=600');
 expect(load).toHaveBeenCalledTimes(1);
 expect(load).toHaveBeenCalledWith(weatherRegions[0],'fixture-demo');
 now+=600_001;
 load.mockRejectedValueOnce(new Error('fixture-secret'));
 const unavailable=await app.request('/api/calendar/weather/seoul');
 expect(await unavailable.json()).toEqual({status:'unavailable'});
 expect(load).toHaveBeenCalledTimes(2);
});

it('enables KMA in production, shares in-flight requests, and gives its dates priority over Google fallback',async()=>{
 const now=()=>Date.parse('2026-11-18T09:00:00+09:00');
 const google=vi.fn(async()=>[
  {date:'2026-11-18',condition:'CLEAR',description:'맑음'},
  {date:'2026-11-22',condition:'CLEAR',description:'다른 제공자 예보'},
 ]);
 const kma=vi.fn(async():Promise<WeatherDay[]>=>[
  {date:'2026-11-22',condition:'RAIN',description:'비',source:'kma',high:10,low:0},
 ]);
 const app=calendarWeatherRoutes('production',{KMA_API_KEY:'fixture-kma',GOOGLE_WEATHER_API_KEY:'fixture-google'},google,now,kma);
 const [first,second]=await Promise.all([app.request('/api/calendar/weather/seoul'),app.request('/api/calendar/weather/seoul')]);
 expect(await first.json()).toEqual({status:'ok',days:[
  {date:'2026-11-18',condition:'CLEAR',description:'맑음'},
  {date:'2026-11-22',condition:'RAIN',description:'비',source:'kma',high:10,low:0},
 ]});
 expect(await second.json()).not.toHaveProperty('authKey');
 expect(kma).toHaveBeenCalledTimes(1);expect(google).toHaveBeenCalledTimes(1);
 expect(first.headers.get('cache-control')).toContain('s-maxage=600');
});

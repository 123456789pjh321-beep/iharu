import {Hono} from 'hono';
import {z} from 'zod';
import {weatherRegions,type CalendarWeather,type WeatherDay,type WeatherRegion} from '../../shared/calendar-weather.js';
import type {Environment} from '../env.js';

const dayPart=z.object({
 weatherCondition:z.object({
  type:z.string().optional(),
  description:z.object({text:z.string().optional()}).optional(),
 }).optional(),
 precipitation:z.object({
  probability:z.object({percent:z.number().optional()}).optional(),
  qpf:z.object({quantity:z.number().optional(),unit:z.string().optional()}).optional(),
  snowQpf:z.object({quantity:z.number().optional(),unit:z.string().optional()}).optional(),
 }).optional(),
 relativeHumidity:z.number().optional(),
 wind:z.object({speed:z.object({value:z.number().optional(),unit:z.string().optional()}).optional()}).optional(),
 uvIndex:z.number().optional(),
});
const temperature=z.object({degrees:z.number().optional()}).optional();
const googleForecast=z.object({forecastDays:z.array(z.object({
 displayDate:z.object({year:z.number().int(),month:z.number().int(),day:z.number().int()}),
 fullDayForecast:dayPart.optional(),
 daytimeForecast:dayPart.optional(),
 maxTemperature:temperature,
 minTemperature:temperature,
})).max(10)});
const dateSchema=z.iso.date();

export async function fetchCalendarForecast(region:WeatherRegion,key:string,request=fetch):Promise<WeatherDay[]>{
 const url=new URL('https://weather.googleapis.com/v1/forecast/days:lookup');
 url.search=new URLSearchParams({
  'location.latitude':String(region.lat),'location.longitude':String(region.lng),
  days:'10',pageSize:'10',unitsSystem:'METRIC',languageCode:'ko',
 }).toString();
 const response=await request(url,{headers:{'X-Goog-Api-Key':key},signal:AbortSignal.timeout(7000),redirect:'error'});
 if(!response.ok){
  console.warn(JSON.stringify({code:'WEATHER_API_UNAVAILABLE',status:response.status}));
  throw new Error('WEATHER_API_UNAVAILABLE');
 }
 const parsed=googleForecast.safeParse(await response.json());
 if(!parsed.success){
  console.warn(JSON.stringify({code:'WEATHER_API_RESPONSE_INVALID'}));
  throw new Error('WEATHER_API_RESPONSE_INVALID');
 }
 const {forecastDays}=parsed.data;
 return forecastDays.flatMap(row=>{
  const {year,month,day}=row.displayDate;
  const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  // South Korea supplies a full day at local midnight instead of day and night parts.
  const part=row.fullDayForecast??row.daytimeForecast;
  if(!part||!dateSchema.safeParse(date).success)return [];
  const wind=part.wind?.speed;
  const rain=part.precipitation?.qpf;
  const snow=part.precipitation?.snowQpf;
  return [{
   date,condition:part.weatherCondition?.type??'',description:part.weatherCondition?.description?.text??'',
   high:row.maxTemperature?.degrees,low:row.minTemperature?.degrees,
   precipitationChance:part.precipitation?.probability?.percent,humidity:part.relativeHumidity,
   windKmh:wind?.unit==='KILOMETERS_PER_HOUR'?wind.value:undefined,uvIndex:part.uvIndex,
   rainMm:rain?.unit==='MILLIMETERS'?rain.quantity:undefined,snowCm:snow?.unit==='CENTIMETERS'?snow.quantity:undefined,
  }];
 }).sort((a,b)=>a.date.localeCompare(b.date));
}

export function calendarWeatherRoutes(environment:Environment,env=process.env,load=fetchCalendarForecast,clock=Date.now){
 const app=new Hono(),regions=new Map<string,WeatherRegion>(weatherRegions.map(region=>[region.id,region]));
 const cache=new Map<string,{expires:number;weather:CalendarWeather}>();
 const pending=new Map<string,Promise<CalendarWeather>>();
 const key=env.GOOGLE_WEATHER_API_KEY?.trim()||(environment!=='production'?env.GOOGLE_WEATHER_DEMO_KEY?.trim():undefined);
 const forecast=async(region:WeatherRegion):Promise<CalendarWeather>=>{
  if(!key)return {status:'disabled'};
  const saved=cache.get(region.id);
  if(saved&&saved.expires>clock())return saved.weather;
  const active=pending.get(region.id);
  if(active)return active;
  const task=(async():Promise<CalendarWeather>=>{
   let weather:CalendarWeather={status:'unavailable'};
   try{
    const days=await load(region,key);
    if(days.length)weather={status:'ok',days};
   }catch{/* The upstream error may contain request metadata. Only return a general status. */}
   const expires=clock()+(weather.status==='ok'?600_000:60_000);
   cache.set(region.id,{expires,weather});
   return weather;
  })();
  pending.set(region.id,task);
  try{return await task;}finally{pending.delete(region.id);}
 };
 app.get('/api/calendar/weather/:region',async c=>{
  const region=regions.get(c.req.param('region'));
  if(!region)return c.json({status:'unavailable'},400);
  const weather=await forecast(region);
  if(weather.status==='ok')c.header('Cache-Control','public, max-age=300, s-maxage=600');
  return c.json(weather);
 });
 return app;
}

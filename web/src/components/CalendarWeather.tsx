import {useEffect,useState} from 'react';
import {Cloud,CloudDrizzle,CloudFog,CloudHail,CloudLightning,CloudRain,CloudSnow,CloudSun,Sun,Wind} from 'lucide-react';
import {calendarWeatherSchema,weatherRegions,type CalendarWeather,type WeatherDay} from '../../../shared/calendar-weather';
import {addDays,koreaToday} from '../../../shared/schedules';
import {Icon} from './Icon';
import {useSlidingDialog} from './useSlidingDialog';
import {WeatherRegionControl} from './WeatherRegionControl';
import './calendar-weather.css';

const regionStorage='iharu:weather:region';
const dateFormat=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Seoul'});
const dateLabel=(date:string)=>dateFormat.format(new Date(date+'T12:00:00+09:00'));
const numberFormat=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
const format=(value:number,unit:string)=>numberFormat.format(value)+unit;

function initialRegion(){
 try{const id=localStorage.getItem(regionStorage);return weatherRegions.find(region=>region.id===id)??weatherRegions[0];}
 catch{return weatherRegions[0];}
}

export function useCalendarWeather(enabled=true){
 const [region,setRegion]=useState(initialRegion);
 const [forecast,setForecast]=useState<{region:string;data:CalendarWeather}|null>(null);
 const [detailDate,setDetailDate]=useState<string|null>(null);
 const [revision,setRevision]=useState(0);
 const today=koreaToday(),lastDate=addDays(today,10);
 useEffect(()=>{
  if(!enabled)return;
  const controller=new AbortController();
  const load=async()=>{
   try{
    const response=await fetch('/api/calendar/weather/'+region.id,{signal:controller.signal});
    if(!response.ok)throw new Error('WEATHER_UNAVAILABLE');
    const data=calendarWeatherSchema.parse(await response.json());
    if(!controller.signal.aborted)setForecast({region:region.id,data});
   }catch{
    if(!controller.signal.aborted)setForecast({region:region.id,data:{status:'unavailable'}});
   }
  };
  void load();
  const timer=window.setInterval(()=>{if(!document.hidden)void load();},900_000);
  return()=>{window.clearInterval(timer);controller.abort();};
 },[enabled,region.id,revision,today]);
 const data=forecast?.region===region.id?forecast.data:null;
 const status=data?.status??'loading';
 const days=data?.status==='ok'?data.days:[];
 function selectRegion(id:string){
  const found=weatherRegions.find(choice=>choice.id===id);
  if(!found)return;
  setRegion(found);
  try{localStorage.setItem(regionStorage,id);}catch{/* The current view still keeps its selection. */}
 }
 function showDetail(date:string|null){
  setDetailDate(date);
 }
 const hasDate=(date:string)=>enabled&&date>=today&&date<=lastDate;
 return {region,status,days,detailDate,selectRegion,showDetail,hasDate,
  reload:()=>{setForecast(null);setRevision(value=>value+1);}};
}

type WeatherView=ReturnType<typeof useCalendarWeather>;

function WeatherGlyph({condition=''}:{condition?:string}){
 const [Glyph,tone]=condition.includes('THUNDER')?[CloudLightning,'storm']
  :/RAIN_AND_SNOW|SLEET|ICE|FREEZING|HAIL/.test(condition)?[CloudHail,'snow']
  :/SNOW|FLURRIES|BLIZZARD/.test(condition)?[CloudSnow,'snow']
  :condition.includes('DRIZZLE')?[CloudDrizzle,'rain']
  :/RAIN|SHOWER/.test(condition)?[CloudRain,'rain']
  :/FOG|HAZE|SMOKE|DUST/.test(condition)?[CloudFog,'cloud']
  :condition.includes('WIND')?[Wind,'cloud']
  :condition==='CLEAR'?[Sun,'sun']
  :/MOSTLY_CLOUDY|^CLOUDY$|OVERCAST/.test(condition)?[Cloud,'cloud']
  :[CloudSun,condition?'sun':'cloud'];
 return <Glyph className="weather-glyph" data-tone={tone} aria-hidden="true" strokeWidth={1.8}/>;
}

function WeatherAttribution({day}:{day?:WeatherDay}){
 if(day?.source==='kma')return <div className="weather-attribution" aria-label="날씨 정보 출처">
  <span>날씨 정보 제공: <a href="https://www.weather.go.kr/" target="_blank" rel="noreferrer">기상청</a></span>
  {day.issuedAt&&<span>{day.issuedAt.slice(4,6)}/{day.issuedAt.slice(6,8)} {day.issuedAt.slice(8,10)}시 발표</span>}
 </div>;
 return <div className="weather-attribution" aria-label="날씨 정보 출처">
  <span className="weather-google-maps" translate="no">Google Maps</span>
  <span>날씨 정보 제공: <a href="https://kr.weathernews.com/" target="_blank" rel="noreferrer">웨더뉴스</a></span>
  <span className="weather-data-credit" translate="no">Source: Includes weather data from Google.</span>
 </div>;
}

export function WeatherToolbar({weather,date}:{weather:WeatherView;date:string}){
 const day=weather.days.find(forecast=>forecast.date===date);
 return <button type="button" className="weather-button" aria-haspopup="dialog"
   aria-label={`${weather.region.label} ${dateLabel(date)} 날씨 상세`}
   title="날씨 상세" onClick={()=>weather.showDetail(date)}>
  <WeatherGlyph condition={day?.condition}/>
 </button>;
}

export function WeatherDateButton({weather,date}:{weather:WeatherView;date:string}){
 if(!weather.hasDate(date))return null;
 const day=weather.days.find(forecast=>forecast.date===date);
 return <button type="button" className="weather-date-button" aria-haspopup="dialog" data-weather-date={date}
  aria-label={`${dateLabel(date)} 날씨 상세`}
  title={`${dateLabel(date)} 날씨 상세`} onClick={()=>weather.showDetail(date)}>
  <WeatherGlyph condition={day?.condition}/>
 </button>;
}

function ForecastDetails({day}:{day:WeatherDay}){
 const stats=[
  ['최고 기온',day.high,'°C'],['최저 기온',day.low,'°C'],
  [day.source==='kma'?'최대 강수 확률':'강수 확률',day.precipitationChance,'%'],
  ['오전 강수 확률',day.morning?.precipitationChance,'%'],['오후 강수 확률',day.afternoon?.precipitationChance,'%'],
  ['예상 강수량',day.rainMm,' mm'],
  ['예상 적설량',day.snowCm,' cm'],['상대 습도',day.humidity,'%'],
  ['최대 풍속',day.windKmh,' km/h'],['자외선 지수',day.uvIndex,''],
 ] as const;
 return <>
  <div className="weather-condition">
   <WeatherGlyph condition={day.condition}/>
   <div><time dateTime={day.date}>{dateLabel(day.date)}</time><strong>{day.description||'일별 예보'}</strong></div>
  </div>
  <dl className="weather-stats">
   {stats.map(([label,value,unit])=>value!==undefined&&<div key={label}><dt>{label}</dt><dd>{format(value,unit)}</dd></div>)}
  </dl>
 </>;
}

function WeatherDetailsDialog({weather,date}:{weather:WeatherView;date:string}){
 const {ref,closing,closeWithAnimation}=useSlidingDialog();
 const close=()=>void closeWithAnimation(()=>weather.showDetail(null));
 const day=weather.days.find(forecast=>forecast.date===date);
 return <dialog ref={ref} className="weather-dialog" aria-labelledby="calendar-weather-title" data-closing={closing||undefined}
  onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
  <header><h2 id="calendar-weather-title">날씨 상세</h2><button type="button" className="icon-button" aria-label="날씨 상세 닫기" onClick={close}><Icon name="close"/></button></header>
  <div className="weather-dialog-body" aria-busy={weather.status==='loading'}>
   <WeatherRegionControl region={weather.region} selectRegion={weather.selectRegion}/>
   {!!weather.days.length&&<div className="weather-days" role="group" aria-label="일자별 예보">
    {weather.days.map(forecast=><button type="button" key={forecast.date} aria-pressed={forecast.date===date}
     aria-label={dateLabel(forecast.date)+' 날씨'} onClick={()=>weather.showDetail(forecast.date)}>
     <span>{Number(forecast.date.slice(5,7))}/{Number(forecast.date.slice(8))}</span>
     <WeatherGlyph condition={forecast.condition}/>
    </button>)}
   </div>}
   {day?<ForecastDetails day={day}/>:weather.status==='loading'?<p role="status">날씨를 불러오는 중이에요.</p>
    :weather.status==='ok'?<p role="status">{dateLabel(date)} 예보가 없어요. 일자별 예보에서 조회 가능한 날짜를 선택해주세요. 예보는 오늘부터 최대 10일 후까지 제공해요.</p>
    :weather.status==='disabled'?<p role="status">날씨 예보 연결을 준비 중이에요.</p>
    :<div className="weather-unavailable"><p role="status">날씨를 불러오지 못했어요.</p><button type="button" className="button compact" onClick={weather.reload}>다시 불러오기</button></div>}
  </div>
  {weather.status==='ok'&&<WeatherAttribution day={day??weather.days[0]}/>}
 </dialog>;
}

export function WeatherDialog({weather}:{weather:WeatherView}){
 return weather.detailDate?<WeatherDetailsDialog weather={weather} date={weather.detailDate}/>:null;
}

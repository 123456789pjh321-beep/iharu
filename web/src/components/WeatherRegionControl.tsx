import {useEffect,useRef,useState} from 'react';
import {weatherRegions,type WeatherRegion} from '../../../shared/calendar-weather';
import {nearestWeatherRegion,readWeatherLocationConsent,weatherLocationConsentKey,weatherLocationConsentVersion} from '../../../shared/weather-location';
import {Icon} from './Icon';

function savedConsent(){
 try{return readWeatherLocationConsent(localStorage.getItem(weatherLocationConsentKey));}catch{return null;}
}

export function WeatherRegionControl({region,selectRegion}:{region:WeatherRegion;selectRegion:(id:string)=>void}){
 const [consent,setConsent]=useState(savedConsent),[review,setReview]=useState(false),[agreed,setAgreed]=useState(false);
 const [locating,setLocating]=useState(false),[message,setMessage]=useState('');
 const mounted=useRef(true),requestVersion=useRef(0),active=useRef(false);
 useEffect(()=>{
  mounted.current=true;
  function syncConsent(event:StorageEvent){
   if(event.key!==weatherLocationConsentKey&&event.key!==null)return;
   const next=event.key===null?null:readWeatherLocationConsent(event.newValue);
   setConsent(next);
   if(!next){requestVersion.current++;active.current=false;setLocating(false);setReview(false);setMessage('위치정보 이용이 해제됐어요. 지역을 직접 선택할 수 있어요.');}
  }
  window.addEventListener('storage',syncConsent);
  return()=>{mounted.current=false;requestVersion.current++;active.current=false;window.removeEventListener('storage',syncConsent);};
 },[]);
 function forgetConsent(){
  requestVersion.current++;active.current=false;setLocating(false);setConsent(null);setReview(false);setAgreed(false);
  try{localStorage.removeItem(weatherLocationConsentKey);}catch{/* In-memory consent is also removed. */}
 }
 function locate(){
  if(active.current)return;
  setMessage('');
  if(!navigator.geolocation){setMessage('이 기기에서는 위치를 확인할 수 없어요. 지역을 직접 선택해 주세요.');return;}
  const version=++requestVersion.current;active.current=true;setLocating(true);
  function fail(denied=false){
   if(!mounted.current||version!==requestVersion.current)return;
   active.current=false;setLocating(false);
   if(denied)forgetConsent();
   setMessage(denied?'위치 권한을 허용하지 않았어요. 지역을 직접 선택하거나 기기 설정에서 권한을 확인해 주세요.':'현재 위치를 확인하지 못했어요. 다시 시도하거나 지역을 직접 선택해 주세요.');
  }
  try{
   navigator.geolocation.getCurrentPosition(position=>{
    if(!mounted.current||version!==requestVersion.current)return;
    active.current=false;setLocating(false);
    const nearby=nearestWeatherRegion(position.coords.latitude,position.coords.longitude);
    if(!nearby){setMessage('현재 위치에서 가까운 국내 예보지역을 찾지 못했어요. 지역을 직접 선택해 주세요.');return;}
    selectRegion(nearby.id);
    setMessage(`현재 위치 근처의 ${nearby.label} 예보를 표시해요.`);
   },error=>fail(error.code===1),{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  }catch{fail();}
 }
 function requestLocation(){
  if(consent)locate();
  else{setReview(true);setAgreed(false);setMessage('');}
 }
 function acceptConsent(){
  if(!agreed)return;
  const record={version:weatherLocationConsentVersion,agreedAt:new Date().toISOString()} as const;
  setConsent(record);setReview(false);setAgreed(false);
  try{localStorage.setItem(weatherLocationConsentKey,JSON.stringify(record));}catch{/* Consent lasts only in this dialog when storage is unavailable. */}
  locate();
 }
 return <div className="weather-region-control">
  <label className="weather-region">지역<select value={region.id} onChange={event=>{forgetConsent();setMessage('');selectRegion(event.target.value);}}>
   {weatherRegions.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}
  </select></label>
  <div className="weather-location-actions">
   <button type="button" className="button compact" disabled={locating} aria-expanded={review} onClick={requestLocation}><Icon name="pin"/>{locating?'위치 확인 중…':'현재 위치로 찾기'}</button>
   {consent&&<button type="button" className="button compact" onClick={()=>{forgetConsent();setMessage('위치정보 이용이 해제됐어요. 지역을 직접 선택할 수 있어요.');}}>위치 이용 해제</button>}
  </div>
  {review&&<section className="weather-location-consent" aria-labelledby="weather-location-consent-title">
   <h3 id="weather-location-consent-title">날씨 지역 선택을 위한 위치 이용</h3>
   <p>기기의 현재 위치를 한 번 확인해 가까운 예보지역을 골라요. 위치 좌표는 기기 안에서만 사용하고 아이하루 서버에 보내거나 저장하지 않아요.</p>
   <p>선택한 지역과 동의 시각만 이 기기에 보관하며, ‘위치 이용 해제’를 누르면 동의 기록을 지워요. 동의하지 않아도 지역을 직접 선택할 수 있어요.</p>
   <a href="/legal/privacy#weather-location" target="_blank" rel="noreferrer">위치정보 이용 안내</a>
   <label className="weather-location-agreement"><input type="checkbox" checked={agreed} onChange={event=>setAgreed(event.target.checked)}/>위치정보 이용에 동의합니다 (선택)</label>
   <div className="weather-location-actions"><button type="button" className="button primary compact" disabled={!agreed} onClick={acceptConsent}>동의하고 위치 확인</button><button type="button" className="button compact" onClick={()=>{setReview(false);setAgreed(false);}}>취소</button></div>
  </section>}
  {locating&&<p className="weather-location-message" role="status">현재 위치를 확인하고 있어요.</p>}
  {message&&<p className="weather-location-message" role="status">{message}</p>}
 </div>;
}

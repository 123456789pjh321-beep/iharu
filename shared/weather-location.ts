import {z} from 'zod';
import {weatherRegions,type WeatherRegion} from './calendar-weather.js';

export const weatherLocationConsentKey='iharu:weather:location-consent';
export const weatherLocationConsentVersion='2026-11-18';
export const weatherLocationConsentSchema=z.object({
 version:z.literal(weatherLocationConsentVersion),agreedAt:z.iso.datetime(),
}).strict();

export function readWeatherLocationConsent(value:string|null){
 if(!value)return null;
 try{return weatherLocationConsentSchema.parse(JSON.parse(value));}catch{return null;}
}

// Coordinates stay on the device. Only the selected forecast region leaves it.
export function nearestWeatherRegion(latitude:number,longitude:number):WeatherRegion|undefined{
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return;
 const radians=Math.PI/180;
 const distances=weatherRegions.map(region=>{
  const latitudeDelta=(region.lat-latitude)*radians,longitudeDelta=(region.lng-longitude)*radians;
  const haversine=Math.sin(latitudeDelta/2)**2+Math.cos(latitude*radians)*Math.cos(region.lat*radians)*Math.sin(longitudeDelta/2)**2;
  return {region,km:6371.0088*2*Math.asin(Math.sqrt(Math.min(1,haversine)))};
 }).sort((a,b)=>a.km-b.km);
 // Do not choose a distant forecast region for an unsupported location.
 return distances[0].km<=100?distances[0].region:undefined;
}

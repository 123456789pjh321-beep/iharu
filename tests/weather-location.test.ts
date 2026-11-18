import {expect,it} from 'vitest';
import {nearestWeatherRegion,readWeatherLocationConsent,weatherLocationConsentVersion} from '../shared/weather-location';

it('selects a nearby supported forecast region from device coordinates',()=>{
 expect(nearestWeatherRegion(37.2001,127.0721)?.id).toBe('dongtan');
 expect(nearestWeatherRegion(37.2636,127.0286)?.id).toBe('suwon');
 expect(nearestWeatherRegion(38.0934,127.0771)?.id).toBe('yeoncheon');
 expect(nearestWeatherRegion(33.2541,126.5601)?.id).toBe('seogwipo');
});

it('does not turn invalid or distant coordinates into an unrelated Korean forecast',()=>{
 for(const [latitude,longitude] of [[NaN,127],[37,Infinity],[91,127],[37,-181],[35.6762,139.6503],[0,0]]){
  expect(nearestWeatherRegion(latitude,longitude)).toBeUndefined();
 }
});

it('only accepts the current consent notice with a timestamp and no coordinates',()=>{
 const record={version:weatherLocationConsentVersion,agreedAt:'2026-11-18T05:00:00.000Z'};
 expect(readWeatherLocationConsent(JSON.stringify(record))).toEqual(record);
 for(const value of [null,'{',JSON.stringify({...record,version:'old'}),JSON.stringify({...record,agreedAt:'invalid'}),JSON.stringify({...record,latitude:37.2})]){
  expect(readWeatherLocationConsent(value)).toBeNull();
 }
});

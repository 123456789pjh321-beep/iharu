import {expect,test,type Page} from '@playwright/test';
import {selectCalendarView,waitForAppReady} from '../helpers/workspace-ui';

test.use({baseURL:'http://127.0.0.1:4174',reducedMotion:'reduce'});

test('shows date-specific weather in the timetable and calendar and remembers the chosen region',async({page})=>{
 await page.setViewportSize({width:499,height:940});
 await page.clock.setFixedTime(new Date('2026-11-19T10:30:00+09:00'));
 let forecastRequests=0;
 await page.route('**/api/calendar/weather/*',route=>{
  forecastRequests+=1;
  const dongtan=route.request().url().endsWith('/dongtan');
  return route.fulfill({json:{status:'ok',days:[
   {date:'2026-11-19',condition:dongtan?'LIGHT_SNOW':'CLEAR',description:dongtan?'약한 눈':'맑음',high:dongtan?6:12,low:2,humidity:64,windKmh:13,precipitationChance:75},
   {date:'2026-11-20',condition:'LIGHT_RAIN',description:'약한 비',high:8,low:3,precipitationChance:90},
   {date:'2026-11-21',condition:'THUNDERSTORM',description:'뇌우',high:12,low:5},
  ]}});
 });
 await page.goto('/timetable');await waitForAppReady(page);
 const topbar=page.locator('[data-workspace-topbar]');
 const topWeather=topbar.locator('.weather-button');
 await expect(topWeather).toHaveAccessibleName(/서울 .* 날씨 상세/);
 await expect(topWeather.locator('.weather-glyph')).toHaveAttribute('data-tone','sun');
 await expect(topbar.getByText('Google Maps',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('group',{name:'요일별 날씨'}).getByRole('button')).toHaveCount(3);
 expect(forecastRequests).toBeGreaterThan(0);
 await topWeather.click();
 const details=page.getByRole('dialog',{name:'날씨 상세'});
 await expect(details.getByText('맑음',{exact:true})).toBeVisible();
 await expect(details.locator('.weather-condition .weather-glyph')).toHaveAttribute('data-tone','sun');
 await details.getByRole('combobox',{name:'지역'}).selectOption('dongtan');
 await expect(details.getByText('약한 눈',{exact:true})).toBeVisible();
 await expect(details.getByText('6°C',{exact:true})).toBeVisible();
 await expect(details.getByText('75%',{exact:true})).toBeVisible();
 await expect(details.getByText('Google Maps',{exact:true})).toBeVisible();
 await expect(details.getByRole('link',{name:'웨더뉴스'})).toBeVisible();
 await expect(details.getByText('Source: Includes weather data from Google.',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/calendar-weather-detail-499.png',animations:'disabled'});
 await details.getByRole('button',{name:/11월 20일 .* 날씨/}).click();
 await expect(details.getByText('약한 비',{exact:true})).toBeVisible();
 await details.getByRole('button',{name:'날씨 상세 닫기'}).click();
 await expect(details).toHaveCount(0);
 await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'달력',exact:true}).click();
 await expect(topWeather).toHaveAccessibleName(/경기 화성 동탄 .* 날씨 상세/);
 const current=page.locator('[data-pager-current]');
 const dateWeather=current.locator('[data-weather-date="2026-11-20"]');
 await expect(dateWeather).toBeVisible();
 await expect(current.locator('.calendar-week-row.has-weather')).toHaveCount(3);
 await expect(current.locator('.calendar-week-row.has-weather').filter({hasNot:page.locator('[data-weather-date]')})).toHaveCount(0);
 await dateWeather.click();
 await expect(details.getByText('약한 비',{exact:true})).toBeVisible();
 await details.getByRole('button',{name:'날씨 상세 닫기'}).click();
 await expect(details).toHaveCount(0);
 const dateButton=current.getByRole('button',{name:'2026-11-20 일정 보기',exact:true});
 await dateButton.click();
 const agenda=page.locator('.calendar-day-sheet');
 await expect(agenda).toBeVisible();
 await expect(details).toHaveCount(0);
 await expect(page.locator('.entry-login-sheet')).not.toBeVisible();
 await agenda.getByRole('button',{name:'날짜 일정 닫기',exact:true}).click();
 await expect(agenda).toHaveCount(0);
 await selectCalendarView(page,'주간');
 await expect(dateWeather).toBeVisible();
 for(const width of [320,499,1100]){
  await page.setViewportSize({width,height:940});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(topWeather).toBeInViewport();
  const dateBounds=(await dateButton.boundingBox())!, weatherBounds=(await dateWeather.boundingBox())!;
  expect(dateBounds.y+dateBounds.height).toBeLessThanOrEqual(weatherBounds.y);
  await page.screenshot({path:`test-results/calendar-weather-week-${width}.png`,animations:'disabled'});
 }
 await selectCalendarView(page,'일간');
 await topWeather.click();
 await expect(details.getByRole('combobox',{name:'지역'})).toHaveValue('dongtan');
 await details.getByRole('button',{name:'날씨 상세 닫기'}).click();
 await page.getByLabel('달력 날짜 선택').fill('2026-12-01');
 await topWeather.click();
 await expect(details.getByRole('status')).toContainText('최대 10일 후까지');
});

test('shows KMA morning/afternoon data and the selected workbook region without Google attribution',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-18T09:00:00+09:00'));
 await page.route('**/api/calendar/weather/*',route=>route.fulfill({json:{status:'ok',days:[{
  date:'2026-11-22',condition:'RAIN',description:'오전 맑음 · 오후 흐리고 비',source:'kma',issuedAt:'202611180600',high:12,low:0,precipitationChance:60,
  morning:{condition:'CLEAR',description:'맑음',precipitationChance:10},
  afternoon:{condition:'RAIN',description:'흐리고 비',precipitationChance:60},
 }]}}));
 await page.goto('/timetable');await waitForAppReady(page);
 await page.locator('[data-workspace-topbar] .weather-button').click();
 const details=page.getByRole('dialog',{name:'날씨 상세'});
 await details.getByRole('combobox',{name:'지역'}).selectOption('yeoncheon');
 await expect(details.getByRole('combobox',{name:'지역'})).toHaveValue('yeoncheon');
 await details.getByRole('button',{name:/11월 22일 .* 날씨/}).click();
 await expect(details.getByText('오전 맑음 · 오후 흐리고 비',{exact:true})).toBeVisible();
 await expect(details.getByText('0°C',{exact:true})).toBeVisible();
 await expect(details.getByRole('link',{name:'기상청',exact:true})).toBeVisible();
 await expect(details.getByText('11/18 06시 발표',{exact:true})).toBeVisible();
 await expect(details.getByText('Google Maps',{exact:true})).toHaveCount(0);
});

test('keeps the icon and region selection available while production forecasts are not configured',async({page})=>{
 await page.route('**/api/calendar/weather/*',route=>route.fulfill({json:{status:'disabled'}}));
 await page.goto('/timetable');await waitForAppReady(page);
 const topbar=page.locator('[data-workspace-topbar]');
 await expect(topbar.getByText('Google Maps',{exact:true})).toHaveCount(0);
 await topbar.locator('.weather-button').click();
 const details=page.getByRole('dialog',{name:'날씨 상세'});
 await expect(details.getByRole('status')).toHaveText('날씨 예보 연결을 준비 중이에요.');
 await expect(details.getByRole('combobox',{name:'지역'})).toBeVisible();
 await expect(details.getByRole('group',{name:'일자별 예보'})).toHaveCount(0);
});

async function openLocationWeather(page:Page){
 await page.route('**/api/calendar/weather/*',route=>route.fulfill({json:{status:'disabled'}}));
 await page.goto('/timetable');await waitForAppReady(page);
 await page.locator('[data-workspace-topbar] .weather-button').click();
 return page.getByRole('dialog',{name:'날씨 상세'});
}

test('requires optional location consent, chooses the nearby region, and only stores the region and consent time',async({page,context})=>{
 await page.setViewportSize({width:499,height:940});
 await context.grantPermissions(['geolocation']);
 await context.setGeolocation({latitude:37.2001,longitude:127.0721,accuracy:100});
 await page.addInitScript(()=>{
  const original=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  (window as any).weatherLocationCalls=0;
  navigator.geolocation.getCurrentPosition=(success,error,options)=>{
   (window as any).weatherLocationCalls++;original(success,error,options);
  };
 });
 const weatherRequests:string[]=[];
 page.on('request',request=>{if(request.url().includes('/api/calendar/weather/'))weatherRequests.push(request.url());});
 const details=await openLocationWeather(page);
 expect(await page.evaluate(()=>(window as any).weatherLocationCalls)).toBe(0);
 await details.getByRole('button',{name:'현재 위치로 찾기',exact:true}).click();
 await expect(details.getByRole('checkbox',{name:'위치정보 이용에 동의합니다 (선택)',exact:true})).not.toBeChecked();
 await expect(details.getByRole('button',{name:'동의하고 위치 확인',exact:true})).toBeDisabled();
 await expect(details.getByRole('link',{name:'위치정보 이용 안내',exact:true})).toHaveAttribute('href','/legal/privacy#weather-location');
 for(const width of [320,499]){
  await page.setViewportSize({width,height:940});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/weather-location-consent-${width}.png`,animations:'disabled'});
 }
 await details.getByRole('button',{name:'취소',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).weatherLocationCalls)).toBe(0);
 await details.getByRole('button',{name:'현재 위치로 찾기',exact:true}).click();
 await details.getByRole('checkbox',{name:'위치정보 이용에 동의합니다 (선택)',exact:true}).check();
 await details.getByRole('button',{name:'동의하고 위치 확인',exact:true}).click();
 await expect(details.getByRole('combobox',{name:'지역',exact:true})).toHaveValue('dongtan');
 await expect(details.getByText('현재 위치 근처의 경기 화성 동탄 예보를 표시해요.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).weatherLocationCalls)).toBe(1);
 await expect.poll(()=>weatherRequests.some(url=>url.endsWith('/dongtan'))).toBe(true);
 expect(weatherRequests.every(url=>new URL(url).search==='')).toBe(true);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('iharu:weather:location-consent')!))).toEqual({version:'2026-11-18',agreedAt:expect.any(String)});
 await page.reload();await waitForAppReady(page);
 expect(await page.evaluate(()=>(window as any).weatherLocationCalls)).toBe(0);
 await page.locator('[data-workspace-topbar] .weather-button').click();
 await expect(details.getByRole('combobox',{name:'지역',exact:true})).toHaveValue('dongtan');
 await details.getByRole('button',{name:'위치 이용 해제',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('iharu:weather:location-consent'))).toBeNull();
 await details.getByRole('button',{name:'현재 위치로 찾기',exact:true}).click();
 await expect(details.getByRole('button',{name:'동의하고 위치 확인',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>(window as any).weatherLocationCalls)).toBe(0);
});

test('handles denied device location without changing the chosen region or keeping consent',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(_success:unknown,error:PositionErrorCallback)=>error({code:1} as GeolocationPositionError)}});
 });
 const details=await openLocationWeather(page);
 await details.getByRole('combobox',{name:'지역',exact:true}).selectOption('yeoncheon');
 await details.getByRole('button',{name:'현재 위치로 찾기',exact:true}).click();
 await details.getByRole('checkbox',{name:'위치정보 이용에 동의합니다 (선택)',exact:true}).check();
 await details.getByRole('button',{name:'동의하고 위치 확인',exact:true}).click();
 await expect(details.getByText(/위치 권한을 허용하지 않았어요/)).toBeVisible();
 await expect(details.getByRole('combobox',{name:'지역',exact:true})).toHaveValue('yeoncheon');
 expect(await page.evaluate(()=>localStorage.getItem('iharu:weather:location-consent'))).toBeNull();
});

test('ignores late location results after consent withdrawal or manual region selection',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(success:PositionCallback)=>{
   (window as any).finishWeatherLocation=()=>success({coords:{latitude:37.2001,longitude:127.0721},timestamp:Date.now()} as GeolocationPosition);
  }}});
 });
 const details=await openLocationWeather(page);
 async function beginLocation(){
  await details.getByRole('button',{name:'현재 위치로 찾기',exact:true}).click();
  await details.getByRole('checkbox',{name:'위치정보 이용에 동의합니다 (선택)',exact:true}).check();
  await details.getByRole('button',{name:'동의하고 위치 확인',exact:true}).click();
  await expect(details.getByRole('button',{name:'위치 확인 중…',exact:true})).toBeDisabled();
 }
 await beginLocation();
 await details.getByRole('button',{name:'위치 이용 해제',exact:true}).click();
 await page.evaluate(()=>(window as any).finishWeatherLocation());
 await expect(details.getByRole('combobox',{name:'지역',exact:true})).toHaveValue('seoul');
 await beginLocation();
 await details.getByRole('combobox',{name:'지역',exact:true}).selectOption('suwon');
 await page.evaluate(()=>(window as any).finishWeatherLocation());
 await expect(details.getByRole('combobox',{name:'지역',exact:true})).toHaveValue('suwon');
 expect(await page.evaluate(()=>localStorage.getItem('iharu:weather:location-consent'))).toBeNull();
});

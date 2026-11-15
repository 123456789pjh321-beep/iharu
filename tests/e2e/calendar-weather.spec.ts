import {expect,test} from '@playwright/test';
import {selectCalendarView,waitForAppReady} from '../helpers/workspace-ui';

test('shows date-specific weather in the timetable and calendar and remembers the chosen region',async({page})=>{
 await page.setViewportSize({width:499,height:940});
 await page.clock.setFixedTime(new Date('2026-11-19T10:30:00+09:00'));
 await page.route('**/api/calendar/weather/*',route=>{
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
 await expect(page.getByRole('group',{name:'요일별 날씨'}).getByRole('button')).toHaveCount(3);
 await topWeather.click();
 const details=page.getByRole('dialog',{name:'날씨 상세'});
 await expect(details.getByText('맑음',{exact:true})).toBeVisible();
 await details.getByRole('combobox',{name:'지역'}).selectOption('dongtan');
 await expect(details.getByText('약한 눈',{exact:true})).toBeVisible();
 await expect(details.getByText('6°C',{exact:true})).toBeVisible();
 await expect(details.getByText('75%',{exact:true})).toBeVisible();
 await expect(details.getByText('Google Maps',{exact:true})).toBeVisible();
 await expect(details.getByRole('link',{name:'웨더뉴스'})).toBeVisible();
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
 await dateWeather.click();
 await expect(details.getByText('약한 비',{exact:true})).toBeVisible();
 await details.getByRole('button',{name:'날씨 상세 닫기'}).click();
 await selectCalendarView(page,'주간');
 await expect(dateWeather).toBeVisible();
 for(const width of [320,499,1100]){
  await page.setViewportSize({width,height:940});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(topWeather).toBeInViewport();
  await page.screenshot({path:`test-results/calendar-weather-week-${width}.png`,animations:'disabled'});
 }
 await selectCalendarView(page,'일간');
 await topWeather.click();
 await expect(details.getByRole('combobox',{name:'지역'})).toHaveValue('dongtan');
 await details.getByRole('button',{name:'날씨 상세 닫기'}).click();
 await page.getByLabel('달력 날짜 선택').fill('2026-12-01');
 await topWeather.click();
 await expect(details.getByRole('status')).toContainText('최대 10일의 예보');
});

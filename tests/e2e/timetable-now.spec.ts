import {test,expect} from '@playwright/test';
import {koreaToday} from '../../shared/schedules';
const origin='http://127.0.0.1:4174';test.use({baseURL:origin});
test('timetable opens at the current minute, highlights ongoing work, and keeps the same week during horizontal wheel gestures',async({page,request})=>{
 test.setTimeout(90000);const today=koreaToday(),email='timetable-now@example.test',password='timetable-now-fixture-2026';
 await page.setViewportSize({width:720,height:1024});await page.clock.install({time:new Date(today+'T15:37:00+09:00')});
 await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{ageAtLeast14:true,email,name:'현재 시각 일반사용자',password,callbackURL:'/login?verified=1'}});const mails=await(await request.get('/__test__/mail')).json();await page.request.get(mails.find((m:{to:string})=>m.to===email).url);await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}});
 await page.request.post('/api/v1/workspace/items.create',{headers:{Origin:origin},data:{kind:'REPEAT',data:{title:'현재 진행 수업',untilDate:today,weekdays:[new Date(today+'T12:00:00Z').getUTCDay()],date:today,startTime:'15:00',endTime:'16:00'}}});
 await page.clock.setSystemTime(new Date(today+'T15:37:00+09:00'));await page.goto('/timetable');await expect(page.locator('.timetable-day')).toHaveAttribute('aria-busy','false');await expect(page.getByLabel('현재 진행 중인 일정')).toContainText('현재 시각 일반사용자 · 현재 진행 수업');await expect(page.locator('.timetable-now strong')).toHaveText('현재 15:37');
 const visibleNow=async()=>{const marker=await page.locator('.timetable-now').boundingBox(),pane=await page.locator('.timetable-scroll').boundingBox();return !!marker&&!!pane&&marker.y>=pane.y&&marker.y<pane.y+pane.height;};await expect.poll(visibleNow).toBe(true);expect(await page.locator('.current-hour').evaluate(el=>Number(getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(750);
 await page.screenshot({path:'test-results/ui83-timetable-current.png',animations:'disabled'});
 const dates=await page.locator('[data-timetable-date]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-timetable-date')));
 await page.locator('.timetable-scroll').hover();await page.mouse.wheel(500,0);await page.mouse.wheel(-500,0);
 expect(await page.locator('[data-timetable-date]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-timetable-date')))).toEqual(dates);await expect(page.getByLabel('시간표 날짜 선택')).toHaveCount(0);await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'현재 시간으로 이동'})).toHaveCount(0);
 await page.clock.setSystemTime(new Date(today+'T00:05:00+09:00'));await page.reload();await expect(page.locator('.timetable-day')).toHaveAttribute('aria-busy','false');await expect(page.locator('.timetable-grid')).toHaveAttribute('data-start-minute','480');await expect(page.locator('.timetable-now')).toHaveCount(0);await expect(page.getByLabel('현재 진행 중인 일정')).toContainText('등록된 일정이 없는 시간');
 await page.clock.setSystemTime(new Date(today+'T23:05:00+09:00'));await page.reload();await expect(page.locator('.timetable-grid')).toHaveAttribute('data-end-minute','1320');await expect(page.locator('.timetable-now')).toHaveCount(0);
 await page.setViewportSize({width:320,height:844});await page.goto('/settings');await page.getByRole('button',{name:'어둡게',exact:true}).click();await page.goto('/timetable');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/ui83-timetable-midnight-mobile.png',animations:'disabled'});
});

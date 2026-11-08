import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:4174';test.use({baseURL:origin});
test('calendar merges adjacent identical schedules while dates, overflow and original editors remain available',async({page,request})=>{
 test.setTimeout(90000);
 const email='merged-calendar@example.test',password='merged-calendar-fixture-2026';
 expect((await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'달력 병합 보호자',password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
 const mails=await(await request.get('/__test__/mail')).json();await page.request.get(mails.find((m:{to:string})=>m.to===email).url);
 expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
 const api=async(op:string,data:object)=>{const r=await page.request.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();};
 for(const date of ['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06'])await api('items.create',{kind:'EVENT',data:{title:'가족 여행',date,startTime:'09:00',endTime:'13:50',place:'여행지',color:0}});
 for(const date of ['2026-11-02','2026-11-03'])await api('items.create',{kind:'EVENT',data:{title:'프로젝트 작업',date,startTime:'14:00',endTime:'15:00',color:1}});
 for(let i=0;i<2;i++)await api('items.create',{kind:'EVENT',data:{title:'중복된 준비 일정',date:'2026-11-04',startTime:'16:00',endTime:'17:00',color:2}});
 for(let i=0;i<4;i++)await api('items.create',{kind:'EVENT',data:{title:'개별 일정 '+i,date:'2026-11-02',startTime:`${16+i}:00`,endTime:`${17+i}:00`}});
 const before=await api('items.list',{from:'2026-11-01',to:'2026-11-30'});
 for(const width of [320,820,1440]){
  await page.setViewportSize({width,height:1000});await page.goto('/today/calendar');await page.getByLabel('달력 월 선택').fill('2026-11');
  const week=page.locator('[data-week-start="2026-11-01"]'),school=week.locator('.calendar-event').filter({hasText:'가족 여행'});
  await expect(school).toHaveCount(1);await expect(school).toHaveAttribute('data-span','5');
  const bar=(await school.boundingBox())!,first=(await week.locator('[data-date="2026-11-02"]').boundingBox())!,last=(await week.locator('[data-date="2026-11-06"]').boundingBox())!;
  expect(Math.abs(bar.x-first.x)).toBeLessThan(4);expect(Math.abs(bar.x+bar.width-last.x-last.width)).toBeLessThan(4);
  await page.screenshot({path:`test-results/ui98-calendar-merged-${width}.png`,animations:'disabled'});
  const project=week.locator('.calendar-event').filter({hasText:'프로젝트 작업'});await expect(project).toHaveAttribute('data-span','2');
  const p=(await project.boundingBox())!;await project.click({position:{x:p.width*.75,y:p.height/2}});await expect(page.getByLabel('날짜',{exact:true})).toHaveValue('2026-11-03');await page.getByRole('button',{name:'편집 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await week.locator('.calendar-event').filter({hasText:'중복된 준비 일정'}).click();await expect(page.locator('.calendar-day-sheet .day-sheet-event')).toHaveCount(3);await page.getByRole('button',{name:'날짜 일정 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await week.locator('[data-date="2026-11-02"] .calendar-overflow').click();await expect(page.locator('.calendar-day-sheet .day-sheet-event')).toHaveCount(6);await page.getByRole('button',{name:'날짜 일정 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await week.locator('[data-date="2026-11-03"] .calendar-day-target>span').click();await page.getByRole('button',{name:'이 날짜에 일정 추가'}).click();await expect(page.getByLabel('날짜',{exact:true})).toHaveValue('2026-11-03');await page.getByRole('button',{name:'편집 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('group',{name:'달력 보기'}).getByRole('button',{name:'주간',exact:true}).click();await expect(page.locator('.calendar-grid.week-view .calendar-event').filter({hasText:'가족 여행'})).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 const after=await api('items.list',{from:'2026-11-01',to:'2026-11-30'});expect(after.items).toEqual(before.items);
 await page.getByRole('button',{name:'어둡게',exact:true}).click();await page.screenshot({path:'test-results/ui98-calendar-merged-dark.png',animations:'disabled'});
});

import {expect,test,type Locator,type Page} from '@playwright/test';
import {waitForAppReady} from '../helpers/workspace-ui';

const origin='http://127.0.0.1:4174';
const password='graphics-fixture-password-2026';
test.use({baseURL:origin,reducedMotion:'reduce'});

async function signIn(page:Page,id:string){
 const email=id+'@example.test';
 const post=(path:string,data:object)=>page.request.post(path,{headers:{Origin:origin},data});
 expect((await post('/api/auth/sign-up/email',{ageAtLeast14:true,email,name:'그래픽 검증',password,callbackURL:'/login?verified=1'})).ok()).toBe(true);
 const mails=await(await page.request.get('/__test__/mail')).json();
 expect((await page.request.get(mails.find((mail:{to:string})=>mail.to===email).url)).ok()).toBe(true);
 expect((await post('/api/auth/sign-in/email',{email,password})).ok()).toBe(true);
 return post;
}

async function clickRing(ring:Locator,turn:number,radius:number){
 const box=(await ring.boundingBox())!;
 const angle=turn*Math.PI*2-Math.PI/2;
 await ring.click({position:{
  x:box.width*(.5+Math.cos(angle)*radius/480),
  y:box.height*(.5+Math.sin(angle)*radius/480),
 }});
}

test('ledger buttons, today, category drill-down, list filters and calculator work together',async({page})=>{
 await page.setViewportSize({width:390,height:900});
 const post=await signIn(page,'ledger-menu-graphics');
 for(const data of [
  {title:'간식',date:'2027-02-03',amount:2000,ledgerFlow:'EXPENSE',ledgerCategory:'FOOD'},
  {title:'버스',date:'2027-02-20',amount:3000,ledgerFlow:'EXPENSE',ledgerCategory:'TRANSPORT',note:'정기 이용'},
  {title:'월급',date:'2027-02-01',amount:8000,ledgerFlow:'INCOME',ledgerCategory:'SALARY'},
 ])expect((await post('/api/v1/workspace/items.create',{kind:'FEE',data})).ok()).toBe(true);
 await page.clock.setFixedTime(new Date('2027-02-15T09:30:00+09:00'));
 await page.goto('/tuition');
 await waitForAppReady(page);
 const month=page.getByLabel('조회 월',{exact:true});
 const menu=page.getByRole('group',{name:'가계부 보기'}),current=page.locator('[data-pager-current]');
 await expect(menu.getByRole('button')).toHaveText(['달력','내역','그래프','계산기']);
 await expect(menu.getByRole('button',{name:'달력',exact:true})).toHaveAttribute('aria-pressed','true');
 await month.fill('2027-01');
 await page.getByRole('button',{name:'오늘',exact:true}).click();
 await expect(month).toHaveValue('2027-02');
 await expect(page.locator('.tuition-day-sheet h2')).toContainText('2월 15일');
 await page.getByRole('button',{name:'날짜 가계부 닫기'}).click();
 await menu.getByRole('button',{name:'그래프',exact:true}).click();
 const ring=current.getByRole('img',{name:'어디에 썼나요? 원형 그래프'});
 await expect(ring).toHaveAttribute('data-renderer','phaser',{timeout:15000});
 await expect(ring.locator('canvas')).toHaveCount(1);
 const expense=current.locator('.ledger-stat-card').filter({has:page.getByRole('heading',{name:'어디에 썼나요?'})});
 await expect(expense).toContainText('5,000원');
 await expect(expense.getByRole('button',{name:/교통·자동차/})).toContainText('60%');
 await expect(current.locator('.ledger-trend-row').last()).toContainText('수입 8,000원');
 await page.screenshot({path:'test-results/ledger-graphic-390.png',animations:'disabled'});
 await clickRing(ring,.3,163);
 const list=current.getByRole('region',{name:'가계부 내역'});
 await expect(list.getByRole('combobox',{name:'분류',exact:true})).toHaveValue('TRANSPORT');
 await expect(list.locator('.ledger-entry')).toHaveCount(1);
 await expect(list.getByRole('button',{name:'버스 수정'})).toBeVisible();
 await list.getByLabel('내역 검색').fill('정기');
 await expect(list.locator('.ledger-entry')).toHaveCount(1);
 await list.getByLabel('내역 검색').fill('없는 항목');
 await expect(list).toContainText('조건에 맞는 내역이 없어요.');
 await list.getByRole('button',{name:'필터 초기화'}).click();
 await list.getByRole('combobox',{name:'정렬',exact:true}).selectOption('newest');
 await expect(list.locator('.ledger-entry h3')).toHaveText(['버스','간식']);
 await menu.getByRole('button',{name:'계산기',exact:true}).click();
 const calc=page.getByRole('region',{name:'가계부 계산기'}),output=calc.getByLabel('계산 결과');
 await expect(calc).toBeVisible();
 await calc.focus();
 await page.keyboard.type('12/0');
 await expect(calc.getByText('0으로 나눌 수 없어요.',{exact:true})).toBeVisible();
 await expect(calc.getByRole('button',{name:'지출로 등록'})).toBeDisabled();
 await page.keyboard.press('Escape');
 await page.keyboard.type('1200+50*10');
 await page.keyboard.press('Enter');
 await expect(output).toHaveText('1,700');
 await page.screenshot({path:'test-results/ledger-calculator-390.png',animations:'disabled'});
 await calc.getByRole('button',{name:'수입으로 등록'}).click();
 const editor=page.getByRole('dialog',{name:'가계부 등록'});
 await expect(editor.getByLabel('금액',{exact:true})).toHaveValue('1,700');
 await expect(editor.getByRole('button',{name:'수입',exact:true})).toHaveAttribute('aria-pressed','true');
 await editor.getByLabel('내용',{exact:true}).fill('계산 결과');
 await editor.getByRole('button',{name:'저장',exact:true}).click();
 await expect(editor).toHaveCount(0);
 const response=await post('/api/v1/workspace/items.list',{from:'2027-02-01',to:'2027-02-28',kind:'FEE'});
 expect((await response.json()).items).toEqual(expect.arrayContaining([expect.objectContaining({data:expect.objectContaining({title:'계산 결과',ledgerFlow:'INCOME',amount:1700})})]));
 await expect(output).toHaveText('1,700');
});

test('weekly timetable preserves its calendar and renders a touchable ring for the selected day',async({page})=>{
 await page.setViewportSize({width:390,height:900});
 const post=await signIn(page,'weekly-graphic');
 for(const data of [
  {title:'아침 모임',startTime:'09:00',endTime:'10:15',weekdays:[1],color:0},
  {title:'겹친 활동',startTime:'09:30',endTime:'11:00',weekdays:[1],color:1},
  {title:'화요일 수업',startTime:'14:00',endTime:'15:00',weekdays:[2],color:2},
 ])expect((await post('/api/v1/workspace/items.create',{kind:'REPEAT',data:{date:'2027-02-15',...data}})).ok()).toBe(true);
 await page.clock.setFixedTime(new Date('2027-02-15T09:45:00+09:00'));
 const engineRequests:string[]=[];
 page.on('request',request=>{if(request.url().includes('phaser-ring'))engineRequests.push(request.url());});
 await page.goto('/timetable');
 await waitForAppReady(page);
 const menu=page.getByRole('group',{name:'시간표 보기'});
 await expect(menu.getByRole('button')).toHaveText(['달력','그래픽']);
 await expect(page.locator('.timetable-grid')).toBeVisible();
 expect(engineRequests).toEqual([]);
 await menu.getByRole('button',{name:'그래픽',exact:true}).click();
 const graphic=page.getByRole('region',{name:'그래픽 시간표'}),ring=graphic.getByRole('img',{name:/24시간 원형 시간표/});
 await expect(ring).toHaveAttribute('data-renderer','phaser',{timeout:15000});
 await expect(graphic.getByRole('list',{name:'시간순 일정'}).getByRole('listitem')).toHaveCount(2);
 await expect(graphic.locator('.graphic-now')).toHaveText('현재 09:45');
 await expect(graphic.getByRole('button',{name:'아침 모임 · 수정'})).toContainText('진행 중');
 for(const width of [320,689,1440]){
  await page.setViewportSize({width,height:940});
  await expect(ring).toBeInViewport({ratio:.8});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/timetable-graphic-${width}.png`,animations:'disabled'});
 }
 await clickRing(ring,9.75/24,148);
 const editor=page.getByRole('dialog',{name:'수정'});
 await expect(editor.getByLabel('제목',{exact:true})).toHaveValue('겹친 활동');
 await editor.getByRole('button',{name:'편집 닫기'}).click();
 await page.locator('[data-timetable-date="2027-02-16"]').click();
 await expect(graphic.getByRole('button',{name:'화요일 수업 · 수정'})).toBeVisible();
 await expect(graphic.locator('.graphic-now')).toHaveCount(0);
 await menu.getByRole('button',{name:'달력',exact:true}).click();
 await expect(graphic).toHaveCount(0);
 await expect(page.locator('.timetable-grid')).toBeVisible();
 await expect(page.locator('[data-timetable-date="2027-02-16"]')).toHaveAttribute('aria-pressed','true');
});

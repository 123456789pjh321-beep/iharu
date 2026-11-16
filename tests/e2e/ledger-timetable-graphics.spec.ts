import {expect,test,type Locator,type Page} from '@playwright/test';
import {waitForAppReady,selectLedgerView} from '../helpers/workspace-ui';

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
  {title:'학원비',date:'2027-02-02',amount:580000,ledgerFlow:'EXPENSE',ledgerCategory:'EDUCATION'},
  {title:'간식',date:'2027-02-03',amount:272000,ledgerFlow:'EXPENSE',ledgerCategory:'FOOD'},
  {title:'버스',date:'2027-02-20',amount:370000,ledgerFlow:'EXPENSE',ledgerCategory:'TRANSPORT',note:'정기 이용'},
  {title:'마트',date:'2027-02-22',amount:229900,ledgerFlow:'EXPENSE',ledgerCategory:'GROCERIES'},
  {title:'기타 소액',date:'2027-02-11',amount:100,ledgerFlow:'EXPENSE',ledgerCategory:'OTHER_EXPENSE'},
  {title:'월급',date:'2027-02-01',amount:8000,ledgerFlow:'INCOME',ledgerCategory:'SALARY'},
 ])expect((await post('/api/v1/workspace/items.create',{kind:'FEE',data})).ok()).toBe(true);
 await page.clock.setFixedTime(new Date('2027-02-15T09:30:00+09:00'));
 await page.goto('/tuition');
 await waitForAppReady(page);
 const month=page.getByLabel('조회 월',{exact:true});
 const menu=page.getByRole('group',{name:'가계부 보기',exact:true}),current=page.locator('[data-pager-current]');
 const viewPicker=page.getByRole('region',{name:'그룹 선택'}).getByLabel(/^가계부 보기 · /);
 await expect(viewPicker).toHaveAccessibleName('가계부 보기 · 달력');
 await expect(page.locator('[data-workspace-actions]')).toHaveCount(0);
 await expect(menu).toBeHidden();
 await viewPicker.click();
 await expect(menu.getByRole('button')).toHaveText(['달력','내역','그래프','계산기']);
 const weekly=menu.getByRole('button',{name:'주간 시간표',exact:true});
 const dailyGraphic=menu.getByRole('button',{name:'하루 일과 그래픽',exact:true});
 await expect(weekly).toHaveAttribute('aria-pressed','true');
 await expect(menu.locator('button > svg')).toHaveCount(2);
 await page.screenshot({path:'test-results/ledger-group-view-picker-390.png',animations:'disabled'});
 await page.keyboard.press('Escape');
 await expect(menu).toBeHidden();
 await expect(viewPicker).toBeFocused();
 await month.fill('2027-01');
 await page.getByRole('button',{name:'오늘',exact:true}).click();
 await expect(month).toHaveValue('2027-02');
 await expect(page.locator('.tuition-day-sheet h2')).toContainText('2월 15일');
 await page.getByRole('button',{name:'날짜 가계부 닫기'}).click();
 await selectLedgerView(page,'그래프');
 const ring=current.getByRole('img',{name:'어디에 썼나요? 원형 그래프'});
 await expect(ring).toHaveAttribute('data-renderer','phaser',{timeout:15000});
 await expect(ring.locator('canvas')).toHaveCount(1);
 await expect(ring.locator('.graphic-ring-center strong')).toHaveText('1,452,000원');
 await expect(ring.locator('.graphic-ring-label strong')).toHaveText(['교육·학원','교통·자동차','식비','생활용품']);
 await expect(ring.locator('.graphic-ring-label small')).toHaveText(['580,000원','370,000원','272,000원','229,900원']);
 await expect(ring.locator('.graphic-ring-label .icon')).toHaveCount(4);
 const expense=current.getByRole('list',{name:'지출 분류별 내역'});
 await expect(expense.getByRole('listitem')).toHaveCount(5);
 await expect(expense.getByRole('button',{name:/교통·자동차/})).toContainText('25.5%');
 await expect(expense.getByRole('button',{name:/그 밖에 쓴 돈/})).toContainText('100원');
 const income=current.getByRole('img',{name:'어디에서 받았나요? 원형 그래프'});
 await expect(income.locator('.graphic-ring-center strong')).toHaveText('8,000원');
 await expect(income.locator('.graphic-ring-label strong')).toHaveText('월급');
 await expect(income.locator('.graphic-ring-label small')).toHaveText('8,000원');
 await expect(current.locator('.ledger-trend-row').last()).toContainText('수입 8,000원');
 for(const width of [320,499,1440]){
  await page.setViewportSize({width,height:940});
  await expect(ring).toBeInViewport({ratio:.8});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/ledger-infographic-${width}.png`,animations:'disabled'});
 }
 await page.setViewportSize({width:390,height:900});
 await clickRing(ring,.51,151);
 const list=current.getByRole('region',{name:'가계부 내역'});
 await expect(viewPicker).toHaveAccessibleName('가계부 보기 · 내역');
 await expect(list.getByRole('combobox',{name:'분류',exact:true})).toHaveValue('TRANSPORT');
 await expect(list.locator('.ledger-entry')).toHaveCount(1);
 await expect(list.getByRole('button',{name:'버스 수정'})).toBeVisible();
 await list.getByLabel('내역 검색').fill('정기');
 await expect(list.locator('.ledger-entry')).toHaveCount(1);
 await list.getByLabel('내역 검색').fill('없는 항목');
 await expect(list).toContainText('조건에 맞는 내역이 없어요.');
 await list.getByRole('button',{name:'필터 초기화'}).click();
 await list.getByRole('combobox',{name:'정렬',exact:true}).selectOption('newest');
 await expect(list.locator('.ledger-entry h3')).toHaveText(['마트','버스','기타 소액','간식','학원비']);
 await selectLedgerView(page,'계산기');
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

test('financial calculators show live results, validate inputs and keep each tool’s draft',async({page})=>{
 test.setTimeout(65000);
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{
  Object.defineProperty(navigator.clipboard,'writeText',{value:async (value:string)=>{
   document.documentElement.dataset.copiedCalculation=value;
  }});
 });
 await page.goto('/tuition');
 await selectLedgerView(page,'계산기');

 const calc=page.getByRole('region',{name:'가계부 계산기'});
 const tab=(name:string)=>calc.getByRole('group',{name:'계산기 종류'}).getByRole('button',{name,exact:true});
 const tool=(name:string)=>calc.getByRole('group',{name:'계산 도구'}).getByRole('button',{name,exact:true});
 const field=(name:string)=>calc.getByRole('textbox',{name,exact:true});
 const output=calc.locator('.economy-result output');

 await calc.focus();await page.keyboard.type('4500+50');
 await calc.getByRole('button',{name:'결과 복사',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-copied-calculation','4550');
 await tab('부동산').click();
 await field('대출금액').fill('120,000,000');
 await field('연 금리').fill('6');
 await field('상환 기간').fill('120');
 await expect(output).toHaveText('1,332,246원');
 const method=calc.getByRole('combobox',{name:'상환 방식'});
 await method.selectOption({label:'원금균등'});
 await expect(output).toHaveText('1,600,000원');
 await expect(calc.locator('dl')).toContainText('1,005,000원');
 await method.selectOption({label:'만기일시'});
 await expect(output).toHaveText('600,000원');
 await expect(calc.locator('dl')).toContainText('120,600,000원');
 await page.screenshot({path:'test-results/ledger-finance-loan-390.png',animations:'disabled'});

 await tool('임대수익률').click();
 await field('매입가').fill('300000000');
 await field('임대보증금 선택').fill('300000000');
 await field('월 임대료').fill('1200000');
 await expect(output).toHaveText('—');
 await expect(calc.getByText('임대보증금은 매입가보다 작아야 해요.')).toBeVisible();
 await field('임대보증금 선택').fill('30000000');
 await field('연 비용 선택').fill('1200000');
 await expect(output).toHaveText('4.89%');
 await expect(calc.locator('dl')).toContainText('13,200,000원');

 await tab('세금').click();
 await field('입력 금액').fill('11,00');
 await expect(field('입력 금액')).toHaveAttribute('aria-invalid','true');
 await expect(output).toHaveText('—');
 await field('입력 금액').fill('110000');
 await expect(output).toHaveText('11,000원');
 await calc.getByRole('button',{name:'부가세 포함',exact:true}).click();
 await expect(output).toHaveText('10,000원');
 await expect(calc.locator('dl')).toContainText('100,000원');
 await tool('세후 이자').click();
 await field('세전 이자').fill('100000');
 await expect(field('적용 세율')).toHaveValue('15.4');
 await expect(output).toHaveText('84,600원');
 await field('적용 세율').fill('0');
 await expect(output).toHaveText('100,000원');
 await field('적용 세율').fill('100.01');
 await expect(field('적용 세율')).toHaveAttribute('aria-invalid','true');
 await expect(output).toHaveText('—');

 await tab('주식').click();
 await field('1주 매수가').fill('50000');
 await field('1주 매도가').fill('55000');
 await field('거래 수량').fill('100');
 await expect(output).toHaveText('500,000원');
 await expect(field('매수 수수료 선택')).not.toBeVisible();
 await calc.getByText('거래 비용 입력',{exact:false}).click();
 await field('매수 수수료 선택').fill('1000');
 await field('매도 수수료·세금 선택').fill('12000');
 await expect(output).toHaveText('487,000원');
 await expect(calc.locator('dl')).toContainText('9.74%');
 await field('1주 매도가').fill('45000');
 await expect(output).toHaveText('-513,000원');
 await expect(output).toHaveAttribute('data-negative','true');
 await tool('평균단가').click();
 await field('보유 평균단가').fill('50000');
 await field('보유 수량').fill('100');
 await field('추가 매수가').fill('42000');
 await field('추가 수량').fill('50');
 await expect(output).toHaveText('47,333.33원');
 for(const [width,height] of [[320,844],[390,844],[1024,900],[844,390]]){
  await page.setViewportSize({width,height});
  expect(await calc.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(output).toBeVisible();
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 await page.screenshot({path:'test-results/ledger-finance-stock-dark-390.png',animations:'disabled'});
 await tab('부동산').click();
 await expect(tool('임대수익률')).toHaveAttribute('aria-pressed','true');
 await expect(output).toHaveText('4.89%');
 await tool('대출 상환').click();
 await expect(output).toHaveText('600,000원');
 await tab('기본').click();
 await expect(calc.getByLabel('계산 결과')).toHaveText('4,550');
});

test('weekly timetable opens a touchable daily infographic and a 24-hour ring for the selected day',async({page})=>{
 await page.setViewportSize({width:390,height:900});
 const post=await signIn(page,'weekly-graphic');
 for(const data of [
  {title:'아침 모임',startTime:'09:00',endTime:'10:15',weekdays:[1],color:0},
  {title:'겹친 활동',startTime:'09:30',endTime:'11:00',weekdays:[1],color:1},
  {title:'화요일 수업',startTime:'14:00',endTime:'15:00',weekdays:[2],color:2},
  ...['07','08','09','10','11','12'].map((hour,index)=>({
   title:'화요일 일과 '+(index+1),startTime:hour+':00',endTime:hour+':30',weekdays:[2],color:index,
  })),
 ])expect((await post('/api/v1/workspace/items.create',{kind:'REPEAT',data:{date:'2027-02-15',...data}})).ok()).toBe(true);
 await page.clock.setFixedTime(new Date('2027-02-15T09:45:00+09:00'));
 const engineRequests:string[]=[];
 page.on('request',request=>{if(request.url().includes('phaser-ring'))engineRequests.push(request.url());});
 await page.goto('/timetable');
 await waitForAppReady(page);
 const menu=page.getByRole('group',{name:'시간표 보기'});
 await expect(menu.getByRole('button',{name:'달력',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-workspace-topbar] [data-workspace-actions]')).toHaveCount(0);
 await expect(page.locator('.timetable-grid')).toBeVisible();
 expect(engineRequests).toEqual([]);
 await dailyGraphic.focus();
 await page.keyboard.press('Enter');
 await expect(dailyGraphic).toHaveAttribute('aria-pressed','true');
 const graphic=page.getByRole('region',{name:'그래픽 시간표'});
 const routine=graphic.getByRole('img',{name:/하루 일과 인포그래픽/});
 const views=graphic.getByRole('group',{name:'그래픽 표시'});
 await expect(views.getByRole('button',{name:'하루 일과'})).toHaveAttribute('aria-pressed','true');
 await expect(routine).toHaveAttribute('data-renderer','phaser',{timeout:15000});
 await expect(routine.locator('.graphic-ring-label strong')).toHaveText(['아침 모임','겹친 활동']);
 await expect(routine.locator('.graphic-ring-label small')).toHaveText(['09:00–10:15','09:30–11:00']);
 await expect(routine.locator('.graphic-ring-label .icon')).toHaveCount(2);
 await expect(graphic.getByRole('list',{name:'시간순 일정'}).getByRole('listitem')).toHaveCount(2);
 await expect(graphic.locator('.graphic-now')).toHaveText('현재 09:45');
 await expect(graphic.getByRole('button',{name:'아침 모임 · 수정'})).toContainText('진행 중');
 for(const width of [320,689,1440]){
  await page.setViewportSize({width,height:940});
  const [weekButton,graphicButton,firstDate]=await Promise.all([
   weekly.boundingBox(),dailyGraphic.boundingBox(),page.locator('[data-timetable-date]').first().boundingBox(),
  ]);
  for(const button of [weekButton!,graphicButton!]){
   expect(button.width).toBeGreaterThanOrEqual(24);
   expect(button.height).toBeGreaterThanOrEqual(44);
   expect(button.x+button.width).toBeLessThanOrEqual(firstDate!.x+.1);
  }
  await expect(routine).toBeInViewport({ratio:.8});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/timetable-infographic-${width}.png`,animations:'disabled'});
 }
 const editor=page.getByRole('dialog',{name:'수정'});
 await clickRing(routine,.25,151);
 await expect(editor.getByLabel('제목',{exact:true})).toHaveValue('아침 모임');
 await editor.getByRole('button',{name:'편집 닫기'}).click();
 await views.getByRole('button',{name:'24시간',exact:true}).click();
 const ring=graphic.getByRole('img',{name:/24시간 원형 시간표/});
 await expect(ring).toHaveAttribute('data-renderer','phaser',{timeout:15000});
 await clickRing(ring,9.75/24,148);
 await expect(editor.getByLabel('제목',{exact:true})).toHaveValue('겹친 활동');
 await editor.getByRole('button',{name:'편집 닫기'}).click();
 await page.locator('[data-timetable-date="2027-02-16"]').click();
 await expect(graphic.getByRole('button',{name:'화요일 수업 · 수정'})).toBeVisible();
 await expect(graphic.locator('.graphic-now')).toHaveCount(0);
 await views.getByRole('button',{name:'하루 일과'}).click();
 await expect(routine.locator('.graphic-ring-label strong')).toHaveText(Array.from({length:6},(_,i)=>'화요일 일과 '+(i+1)));
 const pages=graphic.getByRole('group',{name:'일과 인포그래픽 페이지'});
 await page.setViewportSize({width:320,height:940});
 await expect(pages).toBeInViewport();
 await expect(pages).toContainText('1 / 2');
 await page.screenshot({path:'test-results/timetable-infographic-six-320.png',animations:'disabled'});
 await pages.getByRole('button',{name:'다음 일과'}).click();
 await expect(routine.locator('.graphic-ring-label strong')).toHaveText(['화요일 수업']);
 await expect(pages).toContainText('2 / 2');
 await expect(graphic.getByRole('list',{name:'시간순 일정'}).getByRole('listitem')).toHaveCount(7);
 await page.locator('[data-timetable-date="2027-02-17"]').click();
 await expect(routine.locator('.graphic-ring-label')).toHaveCount(0);
 await expect(graphic.getByText('등록된 일정이 없어요.',{exact:true})).toBeVisible();
 await weekly.click();
 await expect(graphic).toHaveCount(0);
 await expect(page.locator('.timetable-grid')).toBeVisible();
 await expect(page.locator('[data-timetable-date="2027-02-17"]')).toHaveAttribute('aria-pressed','true');
});

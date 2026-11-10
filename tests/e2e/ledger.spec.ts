import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:4174',password='ledger-browser-fixture-2026';
test.use({baseURL:origin,viewport:{width:390,height:844},reducedMotion:'reduce'});
test('simple ledger saves basic and optional information, keeps payment details on edit and removes export and explanatory text',async({page})=>{
 test.setTimeout(120000);const email='ui133-ledger@example.test';
 expect((await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,password,name:'가계부 사용자',callbackURL:'/login?verified=1'}})).ok()).toBe(true);
 const mails=await(await page.request.get('/__test__/mail')).json();await page.request.get(mails.find((m:{to:string})=>m.to===email).url);expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
 await page.goto('/tuition');await page.getByLabel('조회 월',{exact:true}).fill('2027-02');
 await expect(page.getByRole('button',{name:'CSV 저장',exact:true})).toHaveCount(0);
 await expect(page.locator('.ledger-controls select,.tuition-calendar-hint,.ledger-record-note,.ledger-summary-note')).toHaveCount(0);
 await expect(page.getByText('수지 차액',{exact:true})).toHaveCount(0);
 for(const [flow,title,amount,done] of [['받는 돈','월급',3000000,true],['쓰는 돈','식비',100000,false]] as const){
  await page.getByRole('button',{name:'가계부 추가',exact:true}).click();const dialog=page.getByRole('dialog',{name:'가계부 등록',exact:true});await expect(dialog).toBeVisible();
  await dialog.getByRole('group',{name:'받는 돈·쓰는 돈 선택'}).getByRole('button',{name:flow,exact:true}).click();
  await dialog.getByLabel('내용',{exact:true}).fill(title);await dialog.getByLabel('금액',{exact:true}).fill(String(amount));await dialog.getByLabel('날짜',{exact:true}).fill('2027-02-20');
  await expect(dialog.getByLabel('항목',{exact:true})).not.toBeVisible();
  if(flow==='쓰는 돈'){
   await dialog.locator('.ledger-extra-options summary').click();await dialog.getByLabel('항목',{exact:true}).selectOption('FOOD');await dialog.getByLabel('결제 방법',{exact:true}).selectOption('CARD');
  }else await page.screenshot({path:'test-results/ui133-ledger-simple-entry.png',animations:'disabled'});
  await dialog.getByRole('checkbox',{name:flow==='받는 돈'?'이미 받았어요':'이미 썼어요'}).setChecked(done);await dialog.getByRole('button',{name:'저장',exact:true}).click();await expect(dialog).not.toBeVisible();
 }
 const current=page.locator('[data-pager-current]');await expect(current.locator('.ledger-summary .ledger-income')).toHaveText('3,000,000원');await expect(current.locator('.tuition-month-summary strong')).toHaveText('100,000원');await expect(current.locator('.ledger-summary section').last()).toContainText('남는 돈');
 await page.screenshot({path:'test-results/ui133-ledger-calendar.png',animations:'disabled'});
 await page.getByRole('group',{name:'가계부 보기'}).getByRole('button',{name:'내역',exact:true}).click();await page.getByRole('button',{name:'쓴 돈으로 표시: 식비',exact:true}).click();await expect(page.getByRole('button',{name:'쓸 예정으로 변경: 식비',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'식비 수정',exact:true}).click();const edit=page.getByRole('dialog',{name:'수정',exact:true});await expect(edit.getByLabel('항목',{exact:true})).not.toBeVisible();await edit.getByLabel('금액',{exact:true}).fill('120000');await edit.getByRole('button',{name:'저장',exact:true}).click();await expect(edit).not.toBeVisible();
 const response=await page.request.post('/api/v1/workspace/items.list',{headers:{Origin:origin},data:{from:'2027-02-01',to:'2027-02-28',kind:'FEE'}});expect(response.ok()).toBe(true);const rows=await response.json();const expense=rows.items.find((item:{data:{title:string}})=>item.data.title==='식비');expect(expense.data).toMatchObject({amount:120000,ledgerCategory:'FOOD',ledgerMethod:'CARD'});expect(expense.fee.paid).toBe(true);
 await page.getByLabel('가계부 검색',{exact:true}).fill('식비');await expect(current.locator('.ledger-summary .ledger-income')).toHaveText('0원');await expect(current.locator('.ledger-entry')).toHaveCount(1);await expect(current.locator('.ledger-summary section').last()).toContainText('모자란 돈');await expect(current.locator('.ledger-summary section').last().locator('strong')).toHaveText('120,000원');
 await page.getByLabel('가계부 검색',{exact:true}).fill('');await page.getByRole('group',{name:'보고 싶은 내역'}).getByRole('button',{name:'받는 돈',exact:true}).click();await expect(current.locator('.ledger-entry')).toHaveCount(1);
 await page.reload();await page.getByLabel('조회 월',{exact:true}).fill('2027-02');await expect(current.locator('.ledger-summary .ledger-income')).toHaveText('3,000,000원');await page.getByRole('group',{name:'가계부 보기'}).getByRole('button',{name:'내역',exact:true}).click();await expect(page.getByRole('button',{name:'쓸 예정으로 변경: 식비',exact:true})).toBeVisible();
 for(const width of [320,820,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/ui133-ledger-'+width+'.png',animations:'disabled'});}
});

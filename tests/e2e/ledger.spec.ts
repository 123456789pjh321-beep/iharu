import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const origin='http://127.0.0.1:4174',password='ledger-browser-fixture-2026';
test.use({baseURL:origin,viewport:{width:390,height:844},reducedMotion:'reduce'});
test('records income and expense, settles a planned item, filters and exports the same persisted ledger',async({page})=>{
 test.setTimeout(120000);const email='ui132-ledger@example.test';
 expect((await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,password,name:'가계부 사용자',callbackURL:'/login?verified=1'}})).ok()).toBe(true);
 const mails=await(await page.request.get('/__test__/mail')).json();await page.request.get(mails.find((m:{to:string})=>m.to===email).url);expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
 await page.goto('/tuition');await page.getByLabel('조회 월',{exact:true}).fill('2027-02');await expect(page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'가계부',exact:true})).toBeVisible();
 for(const [flow,title,amount,category,done] of [['수입','월급',3000000,'SALARY',true],['지출','식비',100000,'FOOD',false]] as const){
  await page.getByRole('button',{name:'가계부 추가',exact:true}).click();const dialog=page.getByRole('dialog',{name:'가계부 등록',exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('group',{name:'수입·지출 선택'}).getByRole('button',{name:flow,exact:true}).click();
  await dialog.getByLabel('거래 내용',{exact:true}).fill(title);await dialog.getByLabel('금액',{exact:true}).fill(String(amount));await dialog.getByLabel('거래일',{exact:true}).fill('2027-02-20');await dialog.getByLabel('분류',{exact:true}).selectOption(category);await dialog.getByLabel('결제 수단',{exact:true}).selectOption(flow==='수입'?'TRANSFER':'CARD');await dialog.getByRole('checkbox',{name:'이번 거래가 완료되었어요'}).setChecked(done);await dialog.getByRole('button',{name:'저장',exact:true}).click();await expect(dialog).not.toBeVisible();
 }
 const current=page.locator('[data-pager-current]');await expect(current.locator('.ledger-summary .ledger-income')).toHaveText('3,000,000원');await expect(current.locator('.tuition-month-summary strong')).toHaveText('100,000원');
 await page.getByRole('group',{name:'가계부 보기'}).getByRole('button',{name:'내역',exact:true}).click();await page.getByRole('button',{name:'완료로 변경: 식비',exact:true}).click();await expect(page.getByRole('button',{name:'예정으로 변경: 식비',exact:true})).toBeVisible();
 const promise=page.waitForEvent('download');await page.getByRole('button',{name:'CSV 저장',exact:true}).click();const download=await promise;expect(download.suggestedFilename()).toBe('iharu-ledger-2027-02.csv');const csv=await readFile((await download.path())!,'utf8');expect(csv).toContain('월급');expect(csv).toContain('식비');expect(csv).toContain('3000000');
 await page.getByLabel('가계부 검색',{exact:true}).fill('식비');await expect(current.locator('.ledger-summary .ledger-income')).toHaveText('0원');await expect(current.locator('.ledger-entry')).toHaveCount(1);await page.getByLabel('가계부 검색',{exact:true}).fill('');await page.getByRole('group',{name:'거래 구분'}).getByRole('button',{name:'수입',exact:true}).click();await expect(current.locator('.ledger-entry')).toHaveCount(1);
 await page.reload();await page.getByLabel('조회 월',{exact:true}).fill('2027-02');await expect(current.locator('.ledger-summary .ledger-income')).toHaveText('3,000,000원');await page.getByRole('group',{name:'가계부 보기'}).getByRole('button',{name:'내역',exact:true}).click();await expect(page.getByRole('button',{name:'예정으로 변경: 식비',exact:true})).toBeVisible();
 for(const width of [320,820,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/ui132-ledger-'+width+'.png',animations:'disabled'});}
});

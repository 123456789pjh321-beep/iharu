import {test,expect,type Page} from '@playwright/test';
import {koreaToday} from '../../shared/schedules';
const origin='http://127.0.0.1:4174',password='multi-group-browser-2026';
test.use({baseURL:origin,viewport:{width:520,height:900},reducedMotion:'reduce'});
const nav=(page:Page)=>page.getByRole('navigation',{name:'모바일 주 메뉴'});
const filter=(page:Page)=>page.getByRole('group',{name:'조회할 그룹',exact:true});
async function register(page:Page,name:string){
 const email='groups-'+crypto.randomUUID()+'@example.test';const signup=await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{ageAtLeast14:true,email,password,name,callbackURL:'/login?verified=1'}});expect(signup.ok(),await signup.text()).toBe(true);
 const mails=await(await page.request.get('/__test__/mail')).json();await page.request.get(mails.find((m:{to:string})=>m.to===email).url);
 expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
}
async function command(page:Page,op:string,data:object={}){const r=await page.request.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();}
const memo=(title:string)=>({id:crypto.randomUUID(),version:0,title,body:'공간별로 분리한 기록',date:koreaToday(),time:'09:00',category:'DAILY',tags:[],place:'',location:null,visibility:'GROUP',photos:[]});

test('creates groups from the menu, accepts an invitation without leaving another group and never shares personal records',async({page,browser})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const context=await browser.newContext({baseURL:origin,viewport:{width:520,height:900},reducedMotion:'reduce'}),guest=await context.newPage();
 try{
  await register(page,'그룹장');await command(page,'memos.save',memo('그룹장의 개인 기록'));
  await page.goto('/family');await expect(page.getByRole('region',{name:'개인 공간'})).toContainText('자동 공유되지');
  await page.getByRole('button',{name:'새 그룹',exact:true}).click();const editor=page.getByRole('dialog',{name:'새 그룹 만들기'});await expect(editor.getByLabel('그룹 이름')).toHaveValue('기본그룹');await editor.getByRole('button',{name:'그룹 만들기',exact:true}).click();
  const card=page.getByRole('region',{name:'기본그룹 그룹',exact:true});await expect(card).toBeVisible();await card.getByRole('button',{name:'구성원 초대',exact:true}).click();const link=page.getByLabel('발급한 그룹 초대 링크');await expect(link).toBeVisible();const url=await link.inputValue();await page.getByRole('button',{name:'초대 닫기'}).click();
  await register(guest,'구성원');await command(guest,'memos.save',memo('구성원의 개인 기록'));await command(guest,'group.create',{name:'친구 모임',description:'',color:1,clientRequestId:crypto.randomUUID()});
  await guest.goto(url);await guest.getByRole('button',{name:'초대 수락',exact:true}).click();await guest.getByRole('link',{name:'그룹 관리 열기'}).click();await expect(guest.locator('.managed-group')).toHaveCount(2);
  await nav(page).getByRole('link',{name:'타임라인',exact:true}).click();await expect(page.getByRole('article',{name:'그룹장의 개인 기록',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'새글 등록',exact:true}).click();const entry=page.getByRole('dialog',{name:'메모 작성'});await entry.getByLabel('제목',{exact:true}).fill('기본그룹 공유 기록');await entry.getByLabel('공유 범위').selectOption('GROUP');await entry.getByRole('button',{name:'메모 저장'}).click();await expect(page.getByRole('article',{name:'기본그룹 공유 기록',exact:true})).toBeVisible();
  await nav(guest).getByRole('link',{name:'타임라인',exact:true}).click();await expect(guest.getByRole('article',{name:'기본그룹 공유 기록',exact:true})).toBeVisible();await expect(guest.getByRole('article',{name:'그룹장의 개인 기록',exact:true})).toHaveCount(0);
  await filter(guest).getByRole('button',{name:'개인',exact:true}).click();await expect(guest.getByRole('article',{name:'구성원의 개인 기록',exact:true})).toBeVisible();await expect(guest.getByRole('article',{name:'기본그룹 공유 기록',exact:true})).toHaveCount(0);
  await filter(guest).getByRole('button',{name:'친구 모임',exact:true}).click();await expect(guest.getByRole('article',{name:'구성원의 개인 기록',exact:true})).toHaveCount(0);await guest.reload();await expect(filter(guest).getByRole('button',{name:'친구 모임',exact:true})).toHaveAttribute('aria-pressed','true');
  await filter(page).getByRole('button',{name:'개인',exact:true}).click();await expect(page.getByRole('article',{name:'그룹장의 개인 기록',exact:true})).toBeVisible();await page.getByRole('button',{name:'새글 등록',exact:true}).click();await expect(page.getByLabel('공유 범위').locator('option')).toHaveCount(1);await page.getByRole('button',{name:'메모 작성 닫기'}).click();
  // A private unfinished draft cannot be restored in a group editor.
  const me=await command(page,'me');
  await page.evaluate(({id,draft})=>sessionStorage.setItem('iharu-memo-draft:'+id,JSON.stringify({draft,expiresAt:Date.now()+86400000})),{id:me.id,draft:memo('개인 임시 글')});
  await page.getByRole('button',{name:'새글 등록',exact:true}).click();
  await expect(page.getByLabel('제목',{exact:true})).toHaveValue('개인 임시 글');
  await expect(page.getByLabel('공유 범위')).toHaveValue('PRIVATE');
  await page.reload();
  await expect(page.getByRole('article',{name:'그룹장의 개인 기록',exact:true})).toBeVisible();
  await filter(page).getByRole('button',{name:'기본그룹',exact:true}).click();await page.getByRole('button',{name:'새글 등록',exact:true}).click();await expect(page.getByLabel('제목',{exact:true})).toHaveValue('');await page.getByRole('button',{name:'메모 작성 닫기'}).click();
  await filter(page).getByRole('button',{name:'개인',exact:true}).click();await page.getByRole('button',{name:'새글 등록',exact:true}).click();await expect(page.getByLabel('제목',{exact:true})).toHaveValue('개인 임시 글');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'메모 작성 닫기'}).click();
  await nav(page).getByRole('link',{name:'그룹관리',exact:true}).click();await card.locator('.group-card-title').click();await expect(card.locator('.group-member-row')).toHaveCount(2);
  page.once('dialog',d=>d.accept());await card.getByRole('button',{name:'구성원 내보내기',exact:true}).click();await expect(card.locator('.group-member-row')).toHaveCount(1);
  await guest.reload();expect((await command(guest,'me')).groups.map((g:{name:string})=>g.name)).toEqual(['친구 모임']);
  await filter(guest).getByRole('button',{name:'개인',exact:true}).click();await expect(guest.getByRole('article',{name:'구성원의 개인 기록',exact:true})).toBeVisible();expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('keeps seven navigation items, shared group filters and management sheets usable at mobile and tablet sizes',async({page})=>{
 test.setTimeout(120000);await register(page,'화면검증');
 for(const [i,name] of ['기본그룹','우리 가족','학교 친구 모임'].entries())await command(page,'group.create',{name,color:i,description:'선택한 그룹 안에서만 함께 보는 자료',clientRequestId:crypto.randomUUID()});
 await page.goto('/family');
 await expect(nav(page).getByRole('link')).toHaveText(['시간표','달력','가계부','타임라인','그룹관리','대화','더보기']);
 for(const width of [320,520,820,1440]){
  await page.setViewportSize({width,height:900});await page.screenshot({path:`test-results/groups-management-${width}.png`,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  await page.getByRole('button',{name:'새 그룹',exact:true}).click();const dialog=page.getByRole('dialog',{name:'새 그룹 만들기'});await expect(dialog).toBeVisible();const bounds=(await dialog.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);await page.screenshot({path:`test-results/groups-editor-${width}.png`,animations:'disabled'});await dialog.getByRole('button',{name:'취소',exact:true}).click();
  for(const label of ['시간표','달력','가계부','타임라인']){await nav(page).getByRole('link',{name:label,exact:true}).click();await expect(filter(page)).toBeVisible();await expect(filter(page).getByRole('button',{name:'학교 친구 모임',exact:true})).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);}
  await page.screenshot({path:`test-results/groups-timeline-${width}.png`,animations:'disabled'});await nav(page).getByRole('link',{name:'그룹관리',exact:true}).click();
 }
 await page.evaluate(()=>localStorage.setItem('iharu:appearance',JSON.stringify({theme:'dark',quiet:true,font:'noto'})));await page.reload();await page.setViewportSize({width:320,height:900});await expect(page.locator('.managed-group')).toHaveCount(3);await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.locator('#app-launch')).toBeHidden();await page.screenshot({path:'test-results/groups-dark-320.png',animations:'disabled'});
});

import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {publicPosts} from '../../shared/public-content';

const origin='http://127.0.0.1:4174',password='reading-calendar-fixture-2026';
async function signIn(context:BrowserContext,email:string){
 expect((await context.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'읽기 화면',password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
 const mails=await(await context.request.get('/__test__/mail')).json();await context.request.get(mails.find((mail:{to:string})=>mail.to===email).url);
 expect((await context.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
}
async function noMarketing(page:Page){
 await expect(page.locator('.workspace-reader')).toBeVisible();
 await expect(page.locator('.market-header,.public-footer,.guide-hero,.story-art,.market-closing')).toHaveCount(0);
 for(const name of ['로그인','시작하기','회원가입'])await expect(page.getByRole('link',{name,exact:true})).toHaveCount(0);
 await expect(page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'더보기',exact:true})).toHaveAttribute('aria-current','page');
}
test('app guides, notices and blog keep list, search, article and return navigation inside the reading screen',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();
 try{
  await signIn(context,'reader-parent@example.test');await page.goto('/more');
  await page.getByRole('navigation',{name:'더보기 메뉴'}).getByRole('link',{name:'사용 가이드',exact:true}).click();await noMarketing(page);
  await page.getByRole('navigation',{name:'사용 가이드 목차'}).getByRole('link',{name:'학원비',exact:true}).click();await expect(page.locator('#fees')).toBeInViewport();
  await page.getByRole('link',{name:'더보기로 돌아가기',exact:true}).click();
  for(const section of ['notices','blog'] as const){
   const label=section==='notices'?'공지사항':'블로그',post=publicPosts.find(item=>item.section===section)!;
   await page.getByRole('navigation',{name:'더보기 메뉴'}).getByRole('link',{name:label,exact:true}).click();await noMarketing(page);
   const search=page.getByRole('searchbox',{name:'글 검색'});await search.fill('찾을 수 없는 문구');await expect(page.getByText('찾는 글이 없어요.',{exact:true})).toBeVisible();await search.fill(post.title);
   await page.getByRole('link',{name:post.title,exact:true}).click();await noMarketing(page);await expect(page.getByRole('heading',{level:1,name:post.title,exact:true})).toBeVisible();
   await expect(page.locator('.workspace-article section')).toHaveCount(post.sections.length);await page.screenshot({path:`test-results/ui124-${section}-article.png`,animations:'disabled'});
   await page.getByRole('link',{name:'관련 사용 가이드',exact:true}).click();await noMarketing(page);await expect(page.getByRole('navigation',{name:'사용 가이드 목차'})).toBeVisible();
   await page.goBack();await page.getByRole('link',{name:label+' 목록으로 돌아가기',exact:true}).click();await expect(search).toHaveValue(post.title);
   await page.getByRole('link',{name:'더보기로 돌아가기',exact:true}).click();
  }
  for(const width of [320,820,1440]){await page.setViewportSize({width,height:900});await page.getByRole('navigation',{name:'더보기 메뉴'}).getByRole('link',{name:'사용 가이드',exact:true}).click();await noMarketing(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/ui124-guide-${width}.png`,animations:'disabled'});await page.getByRole('link',{name:'더보기로 돌아가기',exact:true}).click();}
  // Public entry points still serve the standalone introduction to visitors.
  await page.goto('/guide');await expect(page.locator('.market-header')).toBeVisible();await expect(page.getByRole('navigation',{name:'사용 가이드 목차'})).toBeVisible();
 }finally{await context.close();}
});

for(const width of [390,820])test(`month rows, holiday colors and all dates stay stable after repeated real touch swipes at ${width}px`,async({browser})=>{
 const context=await browser.newContext({baseURL:origin,viewport:{width,height:900},isMobile:true,hasTouch:true}),page=await context.newPage();
 try{
  await signIn(context,`calendar-size-${width}@example.test`);await page.goto('/today/calendar');await expect(page.locator('#app-launch')).toHaveCount(0,{timeout:12000});const month=page.getByLabel('달력 월 선택',{exact:true});await month.fill('2026-11');
  const cdp=await context.newCDPSession(page),current=page.locator('[data-pager-current]'),track=page.locator('.calendar-page-track');
  async function inspect(){
   await expect.poll(()=>track.evaluate(el=>el.getAnimations().length)).toBe(0);
   const metrics=await current.evaluate(el=>{
    const grid=el.querySelector<HTMLElement>('.calendar-grid')!,rows=Array.from(grid.querySelectorAll<HTMLElement>(':scope>.calendar-week-row'));
    const rects=rows.map(row=>row.getBoundingClientRect()),bounds=grid.getBoundingClientRect();
    return {month:(document.querySelector('[aria-label="달력 월 선택"]') as HTMLInputElement).value,rowHeights:rects.map(rect=>rect.height),height:bounds.height,scrollHeight:grid.scrollHeight,rows:rows.length,
     dates:rows.flatMap(row=>Array.from(row.querySelectorAll<HTMLElement>(':scope>.calendar-cell')).map(cell=>({date:cell.dataset.date!,holiday:!!cell.querySelector('.calendar-holiday'),red:cell.classList.contains('holiday-date')}))),
     maxBottom:rects.at(-1)!.bottom-bounds.top+grid.scrollTop};
   });
   await test.info().attach('month-layout',{body:JSON.stringify(metrics,null,2),contentType:'application/json'});
   expect(Math.max(...metrics.rowHeights)-Math.min(...metrics.rowHeights)).toBeLessThan(1);
   expect(metrics.maxBottom).toBeLessThanOrEqual(Math.max(metrics.height,metrics.scrollHeight)+1);
   expect(metrics.dates).toHaveLength(metrics.rows*7);expect(new Set(metrics.dates.map(day=>day.date)).size).toBe(metrics.dates.length);
   for(const day of metrics.dates)expect(day.red,day.date).toBe(day.holiday||new Date(day.date+'T12:00:00Z').getUTCDay()===0);
   await current.locator('.calendar-grid').evaluate(el=>{el.scrollTop=el.scrollHeight;});await expect(current.locator('.calendar-cell').last().locator('button').first()).toBeInViewport();await current.locator('.calendar-grid').evaluate(el=>{el.scrollTop=0;});
   return metrics;
  }
  async function swipe(direction:number){
   const box=(await page.locator('.continuous-pager').boundingBox())!,x=box.x+box.width*(direction>0?.8:.2),y=box.y+80;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let n=1;n<=8;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-direction*box.width*.65*n/8,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  const first=await inspect();let value='2026-11';
  for(const direction of [1,1,1,1,1,1,-1,-1,-1,-1,-1,-1]){
   const date=new Date(value+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+direction);value=date.toISOString().slice(0,7);
   await swipe(direction);await expect(month).toHaveValue(value);await inspect();if(direction===1&&['2027-01','2027-02','2027-05'].includes(value))await page.screenshot({path:`test-results/ui124-${value}-${width}.png`,animations:'disabled'});
  }
  const last=await inspect();expect(last.rowHeights).toHaveLength(first.rowHeights.length);last.rowHeights.forEach((height,index)=>expect(height).toBeCloseTo(first.rowHeights[index],2));await page.screenshot({path:`test-results/ui124-month-rows-${width}.png`,animations:'disabled'});
  for(let index=0;index<4;index++)expect((await context.request.post('/api/v1/workspace/items.create',{headers:{Origin:origin},data:{kind:'EVENT',data:{title:'밀집 일정 '+index,date:'2027-05-03',allDay:true}}})).ok()).toBe(true);
  // A four-row February and a dense six-row month must remain scrollable when resized.
  for(const value of ['2026-02','2027-05']){await month.fill(value);if(value==='2027-05'){await expect(current.locator('.calendar-event')).toHaveCount(3);await expect(current.locator('.calendar-overflow')).toHaveCount(1);}await inspect();await page.setViewportSize({width,height:640});await inspect();await page.screenshot({path:`test-results/ui124-${value}-short-${width}.png`,animations:'disabled'});await page.setViewportSize({width,height:900});}
 }finally{await context.close();}
});

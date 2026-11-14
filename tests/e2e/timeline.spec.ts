import {test,expect,type Page,type Locator} from '@playwright/test';
import {koreaToday} from '../../shared/schedules';
const origin='http://127.0.0.1:4174';
test.use({baseURL:origin,reducedMotion:'reduce'});
async function login(page:Page,name:string){const email=name+'@example.test',password='memo-browser-fixture';const post=(path:string,data:object)=>page.request.post(path,{headers:{Origin:origin},data});expect((await post('/api/auth/sign-up/email',{ageAtLeast14:true,email,name,password,callbackURL:'/login?verified=1'})).ok()).toBe(true);const mail=await(await page.request.get('/__test__/mail')).json();await page.request.get(mail.find((m:{to:string})=>m.to===email).url);expect((await post('/api/auth/sign-in/email',{email,password})).ok()).toBe(true);}
const nav=(page:Page)=>page.getByRole('navigation',{name:'모바일 주 메뉴'});
test('shows two guide memos without login and uses the requested menu order at every width',async({page})=>{
 await page.goto('/timeline');await expect(page.getByRole('region',{name:'샘플 메모'}).getByRole('article')).toHaveCount(2);
 await expect(nav(page).getByRole('link')).toHaveText(['시간표','달력','가계부','타임라인','대화','더보기']);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'이전 달',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'다음 달',exact:true})).toHaveCount(0);await expect(page.getByRole('searchbox')).toHaveCount(0);await expect(page.getByRole('button',{name:'필터',exact:true})).toHaveCount(0);await expect(page.getByText('최신순',{exact:true})).toHaveCount(0);await expect(page.locator('.memo-count')).toHaveCount(0);
 const sample=page.getByRole('article',{name:'공원에서 보낸 오후'});await expect(sample.getByRole('img')).toHaveCount(0);await sample.getByRole('button',{name:'더보기',exact:true}).click();await expect(page.getByRole('dialog',{name:'글 상세'}).getByRole('img')).toBeVisible();await page.keyboard.press('Escape');
 for(const width of [320,520,820,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);await page.screenshot({path:`test-results/memo-samples-${width}.png`,fullPage:true,animations:'disabled'});}
 await page.getByRole('button',{name:'새글 등록',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('heading',{name:'메모를 저장하려면 로그인해 주세요'})).toBeVisible();
});
test('shows two-line summaries and opens complete photo/location memos with persistent editing',async({page,context})=>{
 await login(page,'memo-browser');await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:37.28,longitude:127.01,accuracy:12});
 const today=koreaToday();for(const kind of ['EVENT','FEE'])expect((await page.request.post('/api/v1/workspace/items.create',{headers:{Origin:origin},data:{kind,data:{title:'연동하지 않는 '+kind,date:today,weekdays:[],allDay:true,place:'',note:'',paid:false,...(kind==='FEE'?{amount:1000}:{})}}})).ok()).toBe(true);
 await page.setViewportSize({width:320,height:800});await page.goto('/timeline');await expect(page.getByRole('region',{name:'샘플 메모'}).getByRole('article')).toHaveCount(2);await expect(page.getByText('연동하지 않는 EVENT')).toHaveCount(0);
 await page.getByRole('button',{name:'새글 등록',exact:true}).click();const editor=page.getByRole('dialog',{name:'메모 작성'});
 await editor.getByLabel('제목',{exact:true}).fill('우리 동네 산책');await editor.getByLabel('글',{exact:true}).fill('오늘은 도서관에서 새로운 책을 읽었어요.\n두 번째 줄과 아주 긴 기록도 더보기에서는 줄임 없이 모두 읽을 수 있어요. '.repeat(8));await editor.getByLabel('카테고리',{exact:true}).selectOption('OUTING');await editor.getByLabel('장소',{exact:true}).fill('중앙 도서관');await editor.getByLabel(/태그/).fill('주말, 책');await editor.getByRole('button',{name:'현재 위치 담기'}).click();await expect(editor.getByText(/좌표 저장됨/)).toBeVisible();
 await editor.locator('input[type=file]').setInputFiles({name:'memo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAGklEQVR4nGOYcGEB2YhhVPOo5lHNo5oHVjMAm3IgLq+00UgAAAAASUVORK5CYII=','base64')});await expect(editor.getByAltText('첨부 사진 1')).toBeVisible();await editor.getByRole('button',{name:'메모 저장'}).click();await expect(editor).toHaveCount(0);
 const card=page.getByRole('article',{name:'우리 동네 산책'});await expect(card).toContainText('나만 보기');await expect(card.getByRole('img')).toHaveCount(0);await expect(card.getByRole('link')).toHaveCount(0);await expect(page.getByRole('region',{name:'샘플 메모'})).toHaveCount(0);await expect(page.getByRole('button',{name:'전체',exact:true})).toHaveCount(0);
 await expect(page.getByRole('group',{name:'메모 작성자'}).getByRole('button',{name:'memo-browser',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>card.locator('.memo-preview-body').evaluate(node=>node.clientHeight<=parseFloat(getComputedStyle(node).lineHeight)+1)).toBe(true);
 await card.getByRole('button',{name:'더보기',exact:true}).click();const detail=page.getByRole('dialog',{name:'글 상세'});await expect(detail.getByRole('link',{name:/중앙 도서관/})).toHaveAttribute('href',/37.28,127.01/);await expect(detail.getByRole('img')).toBeVisible();await expect(detail.locator('.memo-body')).toContainText('두 번째 줄');await expect(detail.getByText('#주말',{exact:true})).toBeVisible();
 await detail.getByRole('button',{name:'즐겨찾기',exact:true}).click();await expect(detail.getByRole('button',{name:'즐겨찾기 해제'})).toHaveAttribute('aria-pressed','true');await detail.getByRole('button',{name:/사진 1 크게 보기/}).click();await expect(page.getByRole('dialog',{name:'사진 크게 보기'})).toBeVisible();await page.getByRole('button',{name:'사진 닫기'}).click();await expect(detail).toBeVisible();
 await detail.getByRole('button',{name:'글 상세 닫기'}).click();await page.reload();await card.getByRole('button',{name:'더보기',exact:true}).click();await expect(detail.getByRole('button',{name:'즐겨찾기 해제'})).toHaveAttribute('aria-pressed','true');
 await detail.getByRole('button',{name:'수정',exact:true}).click();const edit=page.getByRole('dialog',{name:'메모 수정'});await edit.getByLabel('글',{exact:true}).fill('수정한 기록');await edit.getByRole('button',{name:'메모 저장'}).click();await expect(card.getByText('수정한 기록')).toBeVisible();
 for(const width of [320,520,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);await page.screenshot({path:`test-results/memo-record-${width}.png`,fullPage:true,animations:'disabled'});}
 await card.getByRole('button',{name:'더보기',exact:true}).click();await expect(detail.getByRole('img')).toBeVisible();await page.setViewportSize({width:520,height:900});await page.screenshot({path:'test-results/memo-detail-520.png',animations:'disabled'});
 page.once('dialog',dialog=>dialog.accept());await detail.getByRole('button',{name:'삭제',exact:true}).click();await expect(detail).toHaveCount(0);await expect(card).toHaveCount(0);await expect(page.getByRole('region',{name:'샘플 메모'}).getByRole('article')).toHaveCount(2);
});
test('keeps draft photos and text through save/refresh failures and reloads an older month after saving',async({page})=>{
 await login(page,'memo-recovery');await page.goto('/timeline');await page.getByRole('button',{name:'새글 등록',exact:true}).click();let editor=page.getByRole('dialog',{name:'메모 작성'});await editor.getByLabel('제목',{exact:true}).fill('남아 있어야 하는 초안');await editor.getByLabel('글',{exact:true}).fill('연결이 끊겨도 유지');await editor.getByLabel('날짜',{exact:true}).fill('2026-02-03');
 await page.route('**/api/v1/workspace/memos.save',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE',message:'연결을 확인해 주세요.'}})}),{times:1});await editor.getByRole('button',{name:'메모 저장'}).click();await expect(editor.getByRole('alert')).toContainText('연결을 확인');await expect(editor.getByLabel('글',{exact:true})).toHaveValue('연결이 끊겨도 유지');
 await page.route('**/api/v1/workspace/memos.list',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE',message:'연결 오류'}})}),{times:1});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(editor.getByLabel('글',{exact:true})).toHaveValue('연결이 끊겨도 유지');await expect(editor.getByRole('status')).toContainText('임시 보관');
 page.once('dialog',dialog=>dialog.accept());await page.reload();await page.getByRole('button',{name:'새글 등록',exact:true}).click();editor=page.getByRole('dialog',{name:'메모 작성'});await expect(editor.getByLabel('글',{exact:true})).toHaveValue('연결이 끊겨도 유지');await editor.getByRole('button',{name:'메모 저장'}).click();await expect(page.getByLabel('타임라인 조회 월')).toHaveValue('2026-02');await expect(page.getByRole('article',{name:'남아 있어야 하는 초안'})).toBeVisible();
});

test('swipes real months without opening details or interfering with vertical scrolling and member controls',async({browser})=>{
 test.setTimeout(120000);
 const context=await browser.newContext({baseURL:origin,hasTouch:true,isMobile:true,viewport:{width:390,height:900}}),page=await context.newPage();
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await login(page,'memo-swipes');
  for(let i=0;i<13;i++){
   const response=await page.request.post('/api/v1/workspace/memos.save',{headers:{Origin:origin},data:{id:crypto.randomUUID(),version:0,title:i===12?'1월 기록':'12월 기록 '+i,body:'두 줄 요약과 상세 내용을 확인해요.',date:i===12?'2027-01-15':'2026-12-15',time:'09:00',category:'DAILY',tags:[],place:'',location:null,visibility:'PRIVATE',photos:[]}});
   expect(response.ok(),await response.text()).toBe(true);
  }
  await page.goto('/timeline');
  const month=page.getByLabel('타임라인 조회 월'),area=page.locator('[data-pager-current="true"] .month-swipe-area'),track=page.locator('.memo-timeline .calendar-page-track');
  await month.fill('2026-12');await expect(page.getByRole('article',{name:'12월 기록 0',exact:true})).toBeVisible();
  const settled=()=>expect.poll(()=>track.evaluate(node=>node.getAnimations().length)).toBe(0);
  const cdp=await context.newCDPSession(page);
  async function touch(from:{x:number;y:number},to:{x:number;y:number},cancel=false){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
   for(let n=1;n<=8;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*n/8,y:from.y+(to.y-from.y)*n/8,id:1}]});await page.waitForTimeout(18);}
   await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  }
  async function swipe(region:Locator,left:boolean,cancel=false){const box=(await region.boundingBox())!,y=Math.max(box.y,80)+Math.min(box.height/2,75);await touch({x:box.x+(left?box.width-24:24),y},{x:box.x+(left?24:box.width-24),y:y+2},cancel);}
  await swipe(area,true);await expect(month).toHaveValue('2027-01');await settled();await expect(page.getByRole('article',{name:'1월 기록',exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('article',{name:'1월 기록',exact:true}).getByRole('button',{name:'더보기',exact:true}).tap();await expect(page.getByRole('dialog',{name:'글 상세'})).toBeVisible();await page.getByRole('button',{name:'글 상세 닫기'}).tap();
  await swipe(area,false);await expect(month).toHaveValue('2026-12');await settled();
  await swipe(area,true,true);await expect(month).toHaveValue('2026-12');await settled();
  const member=page.getByRole('group',{name:'메모 작성자'});await swipe(member,true);await expect(month).toHaveValue('2026-12');await expect(member.getByRole('button',{name:'memo-swipes',exact:true})).toHaveAttribute('aria-pressed','true');
  const scrollPosition=()=>page.evaluate(()=>Array.from(document.querySelectorAll('*')).reduce((sum,node)=>sum+node.scrollTop,0)),before=await scrollPosition();
  await touch({x:230,y:700},{x:232,y:380});await expect.poll(scrollPosition).toBeGreaterThan(before+50);await expect(month).toHaveValue('2026-12');
  await page.locator('.workspace-toolbar').scrollIntoViewIfNeeded();await page.waitForTimeout(350);
  await page.getByRole('button',{name:'새글 등록',exact:true}).tap();await expect(page.getByRole('dialog',{name:'메모 작성'})).toBeVisible();await page.getByRole('button',{name:'메모 작성 닫기'}).tap();await expect(month).toHaveValue('2026-12');
  await page.screenshot({path:'test-results/memo-swipe-390.png',animations:'disabled'});
  await page.setViewportSize({width:1440,height:900});const box=(await area.boundingBox())!;
  await page.mouse.move(box.x+box.width-30,box.y+70);await page.mouse.down();await page.mouse.move(box.x+30,box.y+71,{steps:10});await page.mouse.up();
  await expect(month).toHaveValue('2027-01');await settled();await expect(page.getByRole('dialog')).toHaveCount(0);
  await area.hover();await page.mouse.wheel(-180,0);await expect(month).toHaveValue('2026-12');await settled();
  await page.emulateMedia({reducedMotion:'reduce'});await swipe(area,true);await expect(month).toHaveValue('2027-01');await settled();
  expect(errors).toEqual([]);
 }finally{await context.close();}
});

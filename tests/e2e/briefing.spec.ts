import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:4174',password='ui139-browser-isolated-password';test.use({baseURL:origin,reducedMotion:'reduce'});
async function login(page:import('@playwright/test').Page,email:string){expect((await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{ageAtLeast14:true,email,name:'브리핑 화면 검사',password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);const mail=await(await page.request.get('/__test__/mail')).json();await page.request.get(mail.find((m:{to:string})=>m.to===email).url);expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);}
async function open(page:import('@playwright/test').Page){await page.goto('/briefing');await expect(page.getByRole('region',{name:'AI 브리핑 피드',exact:true})).toBeVisible();const banner=page.locator('.location-access-prompt');if(await banner.isVisible())await banner.getByRole('button',{name:'나중에',exact:true}).click();}
test('saved briefing entry still prompts guests to sign in',async({page})=>{
 await page.goto('/briefing?view=saved');
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('heading',{name:'AI 브리핑 이용을 위해 로그인해 주세요'})).toBeVisible();
});
test('opt-in uses a locally suggested region, persists settings, and withdrawal deletes the feed',async({page})=>{
 await page.addInitScript(()=>{const permission=Object.assign(new EventTarget(),{state:'granted'});Object.defineProperty(navigator,'permissions',{value:{query:async()=>permission}});Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(success:PositionCallback)=>success({coords:{latitude:37.26,longitude:127.03,accuracy:500,altitude:null,altitudeAccuracy:null,heading:null,speed:null},timestamp:Date.now()} as GeolocationPosition)}});});
 const requests:string[]=[];page.on('request',r=>{if(r.postData())requests.push(r.postData()!);});const email='ui139-settings@example.test';await login(page,email);await open(page);await page.getByRole('button',{name:'내 브리핑 시작하기'}).click();const dialog=page.getByRole('dialog',{name:'내 브리핑 설정'});await dialog.getByLabel('AI 브리핑 사용',{exact:true}).check();await dialog.getByRole('button',{name:'현재 위치로 지역 추천'}).click();await expect(dialog.getByLabel('브리핑 기준 지역')).toHaveValue('경기도 수원시');await dialog.getByRole('checkbox',{name:'기준 지역과 기준일을 OpenAI의 공개 소식 검색에 사용하는 데 동의해요.'}).check();await dialog.getByRole('button',{name:'설정 저장'}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('article',{name:'샘플 브리핑 카드'})).toContainText('경기도 수원시');expect(requests.join(' ')).not.toMatch(/latitude|longitude|37\.26|127\.03/);expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toMatch(/latitude|longitude|37\.26|127\.03/);
 expect((await page.request.post('/__test__/briefing-seed',{data:{email}})).ok()).toBe(true);await page.reload();await expect(page.locator('.briefing-card')).toHaveCount(1);await page.goto('/briefing?settings=1');await dialog.getByLabel('AI 브리핑 사용',{exact:true}).uncheck();await dialog.getByRole('button',{name:'설정 저장'}).click();await expect(page.getByRole('button',{name:'내 브리핑 시작하기'})).toBeVisible();await expect(page.locator('.briefing-card')).toHaveCount(0);await page.reload();await expect(page.getByRole('button',{name:'내 브리핑 시작하기'})).toBeVisible();
});
test('a single photo post supports multiple topics, accessible controls, source links and saved posts',async({page})=>{
 const email='ui139-feed@example.test';await login(page,email);await open(page);expect((await page.request.post('/__test__/briefing-seed',{data:{email}})).ok()).toBe(true);await page.reload();const card=page.locator('.briefing-card');await expect(card).toHaveCount(1);await expect(card.getByRole('heading',{name:'방문 전에 도서관 이용 시간을 확인하세요'})).toBeVisible();await expect(page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'더보기',exact:true})).toHaveAttribute('aria-current','page');await card.getByRole('button',{name:'2번째 주제 보기',exact:true}).click();await expect(card.getByRole('heading',{name:'우리 지역 문화 프로그램을 확인해 보세요'})).toBeVisible();await card.locator('.briefing-photo').focus();await page.keyboard.press('ArrowLeft');await expect(card.getByRole('heading',{name:'방문 전에 도서관 이용 시간을 확인하세요'})).toBeVisible();await card.getByRole('button',{name:'더 보기',exact:true}).click();await expect(card).toContainText('나에게 필요한 이유');await expect(card.getByRole('link',{name:'출처 원문 열기'})).toHaveAttribute('rel','noopener noreferrer');await card.getByRole('button',{name:'소식 보관',exact:true}).click();await expect(card.getByRole('button',{name:'소식 보관',exact:true})).toHaveAttribute('aria-pressed','true');await page.goto('/settings');await page.getByRole('link',{name:'보관한 소식',exact:true}).click();await expect(card).toHaveCount(1);await card.getByRole('button',{name:'도움이 됐어요',exact:true}).click();await expect(card.getByRole('button',{name:'도움이 됐어요',exact:true})).toHaveAttribute('aria-pressed','true');
 for(const width of [320,820,1440]){await page.setViewportSize({width,height:1000});await page.locator('#auth-main').evaluate(node=>{node.scrollTop=0;});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const navLabel=page.locator(".workspace-mobile-nav a[href='/timeline']>span:nth-child(2)");expect((await navLabel.boundingBox())!.height).toBeLessThan(20);await expect(card.locator('.briefing-slide[aria-hidden=false] img')).toBeVisible();expect(await card.locator('.briefing-slide[aria-hidden=false] img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);await page.screenshot({path:'test-results/ui139-briefing-'+width+'.png',fullPage:true,animations:'disabled'});}
 await card.getByRole('button',{name:'소식 메뉴',exact:true}).click();await card.getByRole('button',{name:'이 소식 숨기기',exact:true}).click();await expect(card).toHaveCount(0);
});

test('Dongtan Instagram cards link to the original and load the embed only on request',async({page})=>{
 await page.setViewportSize({width:320,height:850});
 await login(page,'instagram-briefing@example.test');
 const region='경기도 화성시 동탄구',day='2026-11-13';
 const reel='https://www.instagram.com/reel/DongtanFixture/';
 const item={fingerprint:'reel',contentHash:'reel',category:'EVENT',collectionType:'DATE',editorialType:'INSTAGRAM',instagramEmbeddable:true,title:'동탄 주말 가족 체험',summary:'동탄호수공원에서 열리는 주말 가족 체험이에요.',reason:'동탄 공개 게시물',action:'원문에서 일정 확인',sourceUrl:reel,sourceName:'Instagram',evidenceQuote:'동탄호수공원',publishedAt:day,validFrom:day,validUntil:'2026-11-28',matchKey:'동탄',score:90,urgent:false};
 const post={id:'local-reel',day,kind:'REGULAR',region,createdAt:day+'T09:00:00+09:00',updatedAt:day+'T09:00:00+09:00',saved:false,helpful:false,items:[item]};
 await page.route('**/api/v1/briefing/read',route=>route.fulfill({json:{
  preferences:{enabled:true,region,version:1,lastCheckedAt:post.updatedAt,lastState:'DONE',newContentCount:1},
  available:true,posts:[post,{...post,id:'old-reel',items:[{...item,title:'지난 동탄 행사',validUntil:'2026-11-12'}]}],
  hasMore:false,nextCursor:null,serverDay:day
 }}));
 await page.route(reel+'embed/captioned/',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<p>Instagram 공개 릴스</p>'}));
 await open(page);
 const search=page.getByRole('link',{name:'인스타그램에서 동탄 소식 찾기'});
 await expect(search).toBeVisible();
 expect(new URL((await search.getAttribute('href'))!).searchParams.get('q')).toBe('동탄 지역 소식');
 const card=page.locator('.briefing-card');
 await expect(card).toHaveCount(1);
 await expect(card.getByRole('heading',{name:item.title})).toBeVisible();
 await expect(card.getByRole('link',{name:'인스타그램 릴스 열기'}).first()).toHaveAttribute('href',reel);
 await expect(card.locator('iframe')).toHaveCount(0);
 await card.getByRole('button',{name:'앱에서 게시물 보기'}).click();
 await expect(card.frameLocator('iframe').getByText('Instagram 공개 릴스')).toBeVisible();
 await card.getByRole('button',{name:'게시물 닫기'}).click();
 await expect(card.locator('iframe')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('a quiet Dongtan search shows public local posts and an on-demand channel feed',async({page})=>{
 await page.setViewportSize({width:320,height:850});
 await login(page,'instagram-channels@example.test');
 const region='경기도 화성시 동탄구',profile='https://www.instagram.com/dongtanlakepark/';
 let serverDay='2026-11-13';
 await page.route('**/api/v1/briefing/read',route=>route.fulfill({json:{
  preferences:{enabled:true,region,version:1,lastCheckedAt:serverDay+'T19:00:00+09:00',lastState:'EMPTY',newContentCount:0},
  available:true,posts:[],hasMore:false,nextCursor:null,serverDay
 }}));
 await page.route(profile+'embed/',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<p>동탄호수공원 공개 게시물</p>'}));
 await open(page);
 const channels=page.getByRole('region',{name:'지역 인스타그램 소식'});
 const highlights=channels.getByRole('article');
 await expect(highlights).toHaveCount(2);
 await expect(highlights.first().getByRole('link')).toHaveAttribute('href','https://www.instagram.com/p/Dfq1Iwagp-n/');
 await expect(highlights.last().getByRole('link')).toHaveAttribute('href','https://www.instagram.com/reel/Dfo5kwoBabR/');
 await expect(channels.locator('iframe')).toHaveCount(0);
 await channels.getByRole('button',{name:'동탄호수공원'}).click();
 await expect(channels.getByRole('link',{name:'동탄호수공원 인스타그램 열기'})).toHaveAttribute('href',profile);
 await expect(channels.frameLocator('iframe').getByText('동탄호수공원 공개 게시물')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 serverDay='2026-12-05';
 await page.reload();
 await expect(channels).toBeVisible();
 await expect(highlights).toHaveCount(0);
});

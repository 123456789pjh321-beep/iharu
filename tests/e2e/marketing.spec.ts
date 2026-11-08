import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:4174';
test.use({baseURL:origin,reducedMotion:'reduce'});

test('public service and usage pages work across phone, tablet and desktop without account navigation',async({page})=>{
 test.setTimeout(90000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 for(const width of [320,820,1440]){
  await page.setViewportSize({width,height:1000});
  for(const path of ['/service','/guide']){
   await page.goto(path);await expect(page.locator('.marketing-site h1')).toBeVisible();
   await expect(page.locator('.workspace-mobile-nav,.workspace-rail')).toHaveCount(0);
   await expect(page.locator('meta[name=robots]')).toHaveAttribute('content','index, follow');
   await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href','https://myiharu.com'+path);
   const html=await(await page.request.get(path)).text();expect(html).toContain('content="index, follow"');expect(html).toContain('https://myiharu.com'+path);
   await page.screenshot({path:`test-results/marketing-${path.slice(1)}-${width}-hero.png`,animations:'disabled'});
   expect(await page.locator('.marketing-site').evaluate(el=>({width:el.clientWidth,overflow:el.scrollWidth-el.clientWidth}))).toMatchObject({overflow:0});
   const feature=page.locator(path==='/service'?'.market-feature':'.guide-section').first();await feature.scrollIntoViewIfNeeded();
   await page.screenshot({path:`test-results/marketing-${path.slice(1)}-${width}-feature.png`,animations:'disabled'});
   const faq=page.locator('.market-faq details').first();await faq.locator('summary').click();await expect(faq).toHaveAttribute('open','');await expect(faq.locator('p')).toBeVisible();
   await page.locator('.public-footer').scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/marketing-${path.slice(1)}-${width}-footer.png`,animations:'disabled'});
  }
 }
 expect(errors).toEqual([]);
});

test('visitors can explore examples, use mobile navigation and reach signup/login/legal pages',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/service');
 const hero=page.locator('.market-hero'),preview=hero.locator('.market-preview');
 await preview.getByRole('button',{name:'학원비',exact:true}).click();await expect(preview.locator('.demo-fee-total strong')).toHaveText('540,000원');
 await preview.getByRole('button',{name:'민서',exact:true}).click();await expect(preview.locator('.demo-fee-total strong')).toHaveText('370,000원');await expect(preview.locator('.demo-fee-row')).toHaveCount(2);
 await preview.getByRole('button',{name:'가족 달력',exact:true}).click();await expect(preview.locator('.calendar-school')).toBeVisible();
 await preview.getByRole('button',{name:'가족 대화',exact:true}).click();await preview.getByRole('button',{name:'사랑해 예시 입력'}).click();await expect(preview.locator('.demo-chat-input')).toContainText('💛 사랑해');
 await page.getByRole('button',{name:'소개 메뉴 열기'}).click();await page.locator('.market-nav').getByRole('link',{name:'활용방법',exact:true}).click();await expect(page).toHaveURL(/\/guide$/);await expect(page.getByRole('button',{name:'소개 메뉴 열기'})).toHaveAttribute('aria-expanded','false');
 await page.locator('.guide-jumps').getByRole('link',{name:'학원비 관리'}).click();await expect(page).toHaveURL(/\/guide#fees$/);await expect(page.locator('#fees h2')).toBeInViewport();
 await page.getByRole('button',{name:'소개 메뉴 열기'}).click();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'소개 메뉴 열기'})).toBeFocused();
 await page.locator('.market-closing').getByRole('link',{name:'아이하루 시작하기',exact:true}).click();await expect(page).toHaveURL(/\/signup$/);await expect(page.locator('meta[name=robots]')).toHaveAttribute('content','noindex, nofollow');await expect(page.locator('link[rel=canonical]')).toHaveCount(0);
 await page.locator('.public-footer').getByRole('link',{name:'서비스 소개',exact:true}).click();await expect(page).toHaveURL(/\/service$/);
 await page.locator('.market-header').getByRole('link',{name:'로그인',exact:true}).click();await expect(page).toHaveURL(/\/login$/);await expect(page.getByLabel('아이디',{exact:true})).toBeVisible();
 await page.locator('.public-footer').getByRole('link',{name:'활용방법',exact:true}).click();await page.locator('.public-footer').getByRole('link',{name:'개인정보처리방침',exact:true}).click();await expect(page).toHaveURL(/\/legal\/privacy$/);await expect(page.locator('.legal-page')).toBeVisible();await expect(page.locator('.workspace-mobile-nav')).toHaveCount(0);
});

for(const width of [320,820,1440])test(`public header and footer stay fixed through entry navigation at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/service');
 const header=page.locator('.market-header'),footer=page.locator('.public-footer'),before=[await header.boundingBox(),await footer.boundingBox()];
 await page.locator('.public-content').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 expect([await header.boundingBox(),await footer.boundingBox()]).toEqual(before);
 await header.getByRole('link',{name:'로그인',exact:true}).click();await expect(page.getByLabel('아이디',{exact:true})).toBeVisible();
 expect([await header.boundingBox(),await footer.boundingBox()]).toEqual(before);
 await page.getByRole('link',{name:'회원가입',exact:true}).click();await expect(page.getByRole('link',{name:'학부모로 회원가입'})).toBeVisible();await expect(page.getByRole('link',{name:'자녀로 회원가입'})).toBeVisible();
 expect([await header.boundingBox(),await footer.boundingBox()]).toEqual(before);
 await page.getByRole('link',{name:'자녀로 회원가입'}).click();await expect(page.getByLabel('부모 승인번호',{exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'회원가입 대상'}).getByRole('link',{name:'학부모',exact:true}).click();await expect(page.getByRole('heading',{name:'학부모 회원가입'})).toBeVisible();await expect(page.getByLabel('부모 승인번호',{exact:true})).toHaveCount(0);
 await page.locator('.public-content').evaluate(el=>{el.scrollTop=el.scrollHeight;});expect([await header.boundingBox(),await footer.boundingBox()]).toEqual(before);
});

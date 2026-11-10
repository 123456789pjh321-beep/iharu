import {test,expect} from '@playwright/test';
import {publicPaths,publicPosts} from '../../shared/public-content';
const origin='http://127.0.0.1:4174';test.use({baseURL:origin,reducedMotion:'reduce'});
test('article reading size persists and the outline follows the selected section',async({page})=>{
 await page.goto('/blog/monthly-tuition-routine');
 const controls=page.getByRole('group',{name:'본문 글자 크기'}),body=page.locator('.story-body');
 const normal=await body.locator('p').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
 await controls.getByRole('button',{name:'크게',exact:true}).click();
 await expect(page.locator('.story-detail')).toHaveAttribute('data-reading-size','large');
 expect(await body.locator('p').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(normal);
 await page.reload();await expect(controls.getByRole('button',{name:'크게',exact:true})).toHaveAttribute('aria-pressed','true');
 const section=page.getByRole('navigation',{name:'글 목차'}).getByRole('link',{name:'누구의 내역인지 정해요',exact:true});
 await section.click();await expect(section).toHaveAttribute('aria-current','location');await expect(page.locator('#part-1 h2')).toBeInViewport();
 await controls.getByRole('button',{name:'기본',exact:true}).click();await expect(page.locator('.story-detail')).toHaveAttribute('data-reading-size','normal');
});
test('public notices and blogs support filtering, search, deep links and reading without login',async({page,request})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 for(const section of ['notices','blog']){
  await page.goto('/'+section);await expect(page.locator('.stories-heading h1')).toBeVisible();await expect(page.locator('.story-card')).toHaveCount(publicPosts.filter(post=>post.section===section).length);
  await page.getByRole('searchbox',{name:'글 검색'}).fill('없는내용xyz');await expect(page.getByRole('heading',{name:'찾는 글이 없어요.'})).toBeVisible();await page.getByRole('button',{name:'전체 글 보기'}).click();await expect(page.locator('.story-card')).toHaveCount(publicPosts.filter(post=>post.section===section).length);
 }
 await page.goto('/notices');await page.getByRole('button',{name:'서비스 안내',exact:true}).click();await expect(page.locator('.story-card')).toHaveCount(1);await page.reload();await expect(page.getByRole('button',{name:'서비스 안내',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'전체',exact:true}).click();await page.getByRole('searchbox',{name:'글 검색'}).fill('말 대신 그림으로');await expect(page.locator('.story-card')).toHaveCount(1);await page.locator('.story-card a').click();await expect(page).toHaveURL(/\/notices\/picture-messages$/);
 await page.getByRole('navigation',{name:'글 목차'}).getByRole('link',{name:'입력창 바로 위에서 고르고 보내요'}).click();await expect(page.locator('#part-1 h2')).toBeInViewport();await page.reload();await expect(page.locator('.story-detail h1')).toHaveText(publicPosts.find(post=>post.slug==='picture-messages')!.title);await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content','article');
 await page.getByRole('link',{name:'← 공지사항 목록'}).click();await expect(page).toHaveURL(/\/notices$/);await page.goBack();await expect(page.locator('.story-detail h1')).toHaveText(publicPosts.find(post=>post.slug==='picture-messages')!.title);
 for(const path of publicPaths){const response=await request.get(path);expect(response.status(),path).toBe(200);const html=await response.text();expect(html).toContain(`href="https://myiharu.com${path}"`);expect(html).toContain('content="index, follow"');if(path.split('/').length>2)expect(html).toContain('application/ld+json');}
 const sitemap=await(await request.get('/sitemap.xml')).text();for(const path of publicPaths)expect(sitemap).toContain('https://myiharu.com'+path);expect(await(await request.get('/robots.txt')).text()).toContain('Disallow: /');
 await page.goto('/blog/missing-article');await expect(page.getByRole('heading',{name:'글을 찾을 수 없어요.'})).toBeVisible();await expect(page.locator('meta[name=robots]')).toHaveAttribute('content','noindex, nofollow');await expect(page.locator('link[rel=canonical]')).toHaveCount(0);expect(errors).toEqual([]);
});
test('all introduction menus and article layouts remain usable on small screens',async({page})=>{
 for(const width of [320,820,1440]){
  await page.setViewportSize({width,height:900});
  for(const path of ['/notices','/blog','/blog/first-picture-conversation']){await page.goto(path);await expect(page.locator('#marketing-main h1')).toBeVisible();expect(await page.locator('.marketing-site').evaluate(el=>el.scrollWidth-el.clientWidth)).toBe(0);await page.screenshot({path:`test-results/public-${path.replaceAll('/','-')}-${width}.png`,animations:'disabled'});}
  if(width===320){await page.getByRole('button',{name:'소개 메뉴 열기'}).click();const nav=page.getByRole('navigation',{name:'아이하루 소개 메뉴'});await expect(nav.getByRole('link')).toHaveText(['서비스','활용방법','공지사항','블로그']);await nav.getByRole('link',{name:'활용방법',exact:true}).click();await expect(page).toHaveURL(/\/guide$/);await expect(page.getByRole('button',{name:'소개 메뉴 열기'})).toHaveAttribute('aria-expanded','false');}
 }
 await page.goto('/guide');await page.getByRole('button',{name:'글쓰기가 서툰 아이',exact:true}).click();await expect(page.locator('.usage-case-content')).toContainText('말하고 싶은 마음을 그림으로.');await page.locator('.usage-case-content').getByRole('link').click();await expect(page).toHaveURL(/\/blog\/first-picture-conversation$/);
 await page.goto('/login');await expect(page.locator('.market-nav').getByRole('link')).toHaveText(['서비스','활용방법','공지사항','블로그']);await page.locator('.market-nav').getByRole('link',{name:'공지사항',exact:true}).click();await expect(page).toHaveURL(/\/notices$/);
});

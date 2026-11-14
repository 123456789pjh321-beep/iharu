import {test,expect,type Page} from '@playwright/test';
import {addDays,koreaToday} from '../../shared/schedules';

const origin='http://127.0.0.1:4174';
test.use({baseURL:origin,reducedMotion:'reduce'});
const nav=(page:Page)=>page.getByRole('navigation',{name:'모바일 주 메뉴'});

test('the timeline takes the briefing tab and prompts guests to sign in there',async({page})=>{
 await page.goto('/timetable');
 await expect(nav(page).getByRole('link')).toHaveText(['시간표','달력','대화','타임라인','가계부','더보기']);
 await nav(page).getByRole('link',{name:'타임라인'}).click();
 await expect(page).toHaveURL(/\/timeline\?signin=1$/);
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('heading',{name:'타임라인 이용을 위해 로그인해 주세요'})).toBeVisible();
});

test('timeline orders actual occurrences and persists per-item review, notes and saving',async({page})=>{
 const email='timeline-browser@example.test',password='timeline-browser-fixture';
 const post=(path:string,data:object={})=>page.request.post(path,{headers:{Origin:origin},data});
 expect((await post('/api/auth/sign-up/email',{ageAtLeast14:true,email,name:'타임라인 검증',password,callbackURL:'/login?verified=1'})).ok()).toBe(true);
 const mail=await(await page.request.get('/__test__/mail')).json();
 await page.request.get(mail.find((m:{to:string})=>m.to===email).url);
 expect((await post('/api/auth/sign-in/email',{email,password})).ok()).toBe(true);
 const today=koreaToday(),yesterday=addDays(today,-1),day=Number(new Date(today+'T12:00:00Z').getUTCDay());
 const common={date:today,weekdays:[],place:'',note:'',paid:false};
 for(const [kind,data] of [
  ['REPEAT',{...common,title:'학교 시간표',weekdays:[day],startTime:'08:20',endTime:'09:00'}],
  ['EVENT',{...common,title:'저녁 운동',startTime:'17:00',endTime:'18:00'}],
  ['FEE',{...common,date:yesterday,title:'자전거 정비',amount:17000,ledgerFlow:'EXPENSE'}],
  ['EVENT',{...common,date:addDays(today,1),title:'다음 일정',allDay:true}],
 ]){
  const response=await post('/api/v1/workspace/items.create',{kind,data});
  expect(response.ok(),await response.text()).toBe(true);
 }
 await page.setViewportSize({width:320,height:770});
 await page.goto('/timeline');
 const timeline=page.getByRole('region',{name:'타임라인 기록'});
 const articles=timeline.getByRole('article'),card=timeline.getByRole('article',{name:'저녁 운동'});
 await expect(articles.nth(0)).toHaveAccessibleName('저녁 운동');
 await expect(articles.nth(1)).toHaveAccessibleName('학교 시간표');
 await expect(timeline.getByRole('article',{name:'자전거 정비'})).toContainText('−17,000원');
 await expect(timeline.getByRole('article',{name:'다음 일정'})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
 await card.getByRole('button',{name:'확인',exact:true}).click();
 await expect(card.getByRole('button',{name:'확인됨',exact:true})).toHaveAttribute('aria-pressed','true');
 await card.getByRole('button',{name:'보관',exact:true}).click();
 await expect(card).toHaveAttribute('data-saved','true');
 await card.getByRole('button',{name:'메모',exact:true}).click();
 await card.getByLabel('내 메모').fill('운동화 챙기기');
 await card.getByRole('button',{name:'메모 저장'}).click();
 await expect(card.getByText('운동화 챙기기')).toBeVisible();
 await page.reload();
 await expect(card.getByText('운동화 챙기기')).toBeVisible();
 await expect(card).toHaveAttribute('data-saved','true');
 await page.getByLabel('상태',{exact:true}).selectOption('saved');
 await expect(articles).toHaveCount(1);
 await page.getByRole('searchbox',{name:'항목 검색'}).fill('운동화');
 await expect(articles).toHaveCount(1);
 await page.getByRole('group',{name:'항목 종류'}).getByRole('button',{name:'시간표',exact:true}).click();
 await expect(timeline.getByRole('heading',{name:'필터에 맞는 기록이 없어요'})).toBeVisible();
 await timeline.getByRole('button',{name:'필터 초기화'}).click();
 await card.getByRole('button',{name:'메모',exact:true}).click();
 await card.getByRole('button',{name:'메모 삭제'}).click();
 await expect(card.getByText('운동화 챙기기')).toHaveCount(0);
 await page.getByLabel('기간',{exact:true}).selectOption('upcoming');
 await expect(timeline.getByRole('article',{name:'다음 일정'})).toBeVisible();
 await expect(card).toHaveCount(0);
});

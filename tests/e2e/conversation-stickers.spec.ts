import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:4174';
test.use({baseURL:origin});
test('child picture messages persist, reach the parent, retry once, and remain above the input',async({page,browser,request})=>{
 test.setTimeout(90000);
 const email='picture-parent@example.test',password='picture-fixture-2026';
 await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'그림 일반사용자',password,callbackURL:'/login?verified=1'}});
 const mails=await(await request.get('/__test__/mail')).json();await page.request.get(mails.find((m:{to:string})=>m.to===email).url);
 await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}});
 const invite=await(await page.request.post('/api/v1/workspace/invite.issue',{headers:{Origin:origin},data:{consent:true}})).json();
 const context=await browser.newContext({baseURL:origin,viewport:{width:390,height:844},hasTouch:true,isMobile:true,extraHTTPHeaders:{'x-fixture-client':'picture-child'}}),child=await context.newPage();
 try{
  const signup=await context.request.post('/api/v1/workspace/child.signup',{headers:{Origin:origin},data:{loginId:'picture_child',name:'그림 아이',password,code:invite.code||invite.data?.code}});expect(signup.ok(),await signup.text()).toBe(true);
  await child.goto('/child/chat');await expect(child.getByRole('group',{name:'그림 메시지 선택'})).toBeHidden();await child.getByRole('button',{name:'그림 메시지',exact:true}).click();
  const tray=child.getByRole('group',{name:'그림 메시지 선택'}),input=child.getByRole('textbox',{name:'참여자에게 전할 말'}),send=child.getByRole('button',{name:'메시지 보내기'});
  await expect(tray.getByRole('button')).toHaveCount(24);expect(await tray.evaluate(el=>getComputedStyle(el).scrollbarWidth)).toBe('none');await expect(child.getByRole('button',{name:'이모티콘',exact:true})).toHaveCount(0);
  for(const label of ['안녕','어디야','학원','아빠','엄마','나 집이야']){
   const button=tray.getByRole('button',{name:label+' 그림 선택'});await expect(button.getByRole('img',{name:label,exact:true})).toHaveCount(1);
   const src=await button.locator('image').getAttribute('href');expect((await context.request.get(src!)).status()).toBe(200);
  }
  await input.fill('작성하던 글');await tray.getByRole('button',{name:'나 집이야 그림 선택'}).click();await expect(input).toHaveValue('작성하던 글');await expect(input).not.toBeFocused();
  let first=true;const ids:string[]=[];
  await child.route('**/api/v1/workspace/chat.send',async route=>{
   ids.push(route.request().postDataJSON().clientMessageId);
   if(first){first=false;await route.fetch();await route.abort('failed');}else await route.continue();
  });
  await send.click();await expect(child.locator('.auth-notice.error')).toBeVisible();await expect(tray.getByRole('button',{name:'나 집이야 그림 선택'})).toHaveAttribute('aria-pressed','true');
  await send.click();await expect(child.locator('.chat-message.mine .picture-bubble')).toHaveCount(1);await expect(tray).toBeHidden();expect(ids).toHaveLength(2);expect(ids[0]).toBe(ids[1]);
  await expect(input).toHaveValue('작성하던 글');await input.fill('');
  await page.goto('/chat');await expect(page.locator('.chat-message.theirs .picture-bubble').getByRole('img',{name:'나 집이야',exact:true})).toBeVisible();
  await child.reload();await expect(child.locator('.chat-message.mine .picture-bubble')).toHaveCount(1);await child.getByRole('button',{name:'그림 메시지',exact:true}).click();
  for(const size of [{width:320,height:700},{width:390,height:844},{width:844,height:390}]){
   await child.setViewportSize(size);await expect(tray).toBeVisible();
   const t=(await tray.boundingBox())!,i=(await input.boundingBox())!,nav=(await child.getByRole('navigation',{name:'모바일 주 메뉴'}).boundingBox())!;
   expect(t.y+t.height).toBeLessThanOrEqual(i.y);expect(i.y+i.height).toBeLessThanOrEqual(nav.y);expect(await child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await tray.getByRole('button',{name:'안녕 그림 선택'}).click();expect((await input.boundingBox())!.y+(await input.boundingBox())!.height).toBeLessThanOrEqual((await child.getByRole('navigation',{name:'모바일 주 메뉴'}).boundingBox())!.y);await child.screenshot({path:'test-results/picture-chat-landscape.png'});await child.getByRole('button',{name:'그림 선택 취소'}).click();
  await child.setViewportSize({width:390,height:844});await tray.getByRole('button',{name:'엄마 그림 선택'}).click();await expect(send).toBeEnabled();await child.getByRole('button',{name:'그림 선택 취소'}).click();await expect(send).toBeDisabled();
  expect((await tray.boundingBox())!.height).toBeLessThanOrEqual(60);expect((await child.locator('.chat-message.mine .picture-bubble').boundingBox())!.width).toBeLessThanOrEqual(80);expect((await child.locator('.group-chat-history').boundingBox())!.height).toBeGreaterThan(350);
  const before=await tray.evaluate(el=>el.scrollLeft);await child.getByRole('button',{name:'다음 그림 보기'}).click();await expect.poll(()=>tray.evaluate(el=>el.scrollLeft)).toBeGreaterThan(before);
  const next=await tray.evaluate(el=>el.scrollLeft);await child.getByRole('button',{name:'이전 그림 보기'}).click();await expect.poll(()=>tray.evaluate(el=>el.scrollLeft)).toBeLessThan(next);
  await child.screenshot({path:'test-results/picture-chat-mobile.png'});
  await child.goto('/settings');await child.getByRole('button',{name:'어둡게',exact:true}).click();await child.goto('/child/chat');await child.screenshot({path:'test-results/picture-chat-dark.png'});
 }finally{await context.close();}
});

test('timetable, tuition and calendar creation open their matching editors without a floating action',async({page,request})=>{
 const email='registration-parent@example.test',password='registration-fixture-2026';
 await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'등록 일반사용자',password,callbackURL:'/login?verified=1'}});
 const mails=await(await request.get('/__test__/mail')).json();await page.request.get(mails.find((m:{to:string})=>m.to===email).url);await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}});
 await page.goto('/timetable');await page.locator('.timetable-slot[data-time="09:00"]').first().click();await expect(page.getByRole('dialog',{name:'반복 일정 등록',exact:true})).toBeVisible();await page.getByRole('button',{name:'편집 닫기'}).click();
 await page.goto('/tuition');await page.getByRole('button',{name:'가계부 추가',exact:true}).click();await expect(page.getByRole('dialog',{name:'가계부 등록',exact:true})).toBeVisible();await page.getByRole('button',{name:'편집 닫기'}).click();
 for(const path of ['/timetable','/today/calendar']){await page.goto(path);await expect(page.locator('.workspace-add-action')).toHaveCount(0);}
 await page.locator('[data-pager-current] .calendar-cell.is-today .calendar-day-target').click();await page.getByRole('button',{name:'이 날짜에 일정 추가'}).click();await expect(page.getByRole('dialog',{name:'일정 등록',exact:true})).toBeVisible();
});

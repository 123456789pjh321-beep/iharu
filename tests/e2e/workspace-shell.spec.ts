import {waitForAppReady} from '../helpers/workspace-ui';
import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
test.use({baseURL:'http://127.0.0.1:4174'});
async function login(page: Page, request: APIRequestContext, email: string) {
  await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: "http://127.0.0.1:4174" },
    data: {
      ageAtLeast14: true,
      email,
      password: "household-browser-password-2026",
      name: "가상 일반사용자",
      callbackURL: "/login?verified=1",
    },
  });
  const mail = await (await request.get("/__test__/mail")).json();
  await page.goto(mail.find((m: { to: string }) => m.to === email).url);await waitForAppReady(page);
  await page.getByLabel("아이디", { exact: true }).fill(email);
  await page
    .getByLabel("암호", { exact: true })
    .fill("household-browser-password-2026");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(
    page.locator('.personal-timetable'),
  ).toBeVisible();
}
for(const width of [320,390,768,1024,1440])test(`workspace shell remains visible on all menus at ${width}px`,async({page,request})=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:900});await login(page,request,`shell-hotfix-${width}@example.test`);
 for(const path of ['/today','/today/calendar','/today/repeats','/calendar','/tuition','/location','/chat','/records','/notifications','/family','/account','/account/reauth','/account/email','/phone?link=1','/family/invite']){
  await page.goto(path);await waitForAppReady(page);const nav=page.getByRole('navigation',{name:'모바일 주 메뉴'});await expect(nav).toBeVisible();await expect(nav.getByRole('link')).toHaveText(['시간표','달력','가계부','타임라인','그룹관리','설정','더보기']);
  const box=(await nav.boundingBox())!;expect(Math.abs(box.y+box.height-900)).toBeLessThanOrEqual(1);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
 }
});


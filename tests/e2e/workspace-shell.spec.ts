import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
test.use({baseURL:'http://127.0.0.1:4174'});
async function login(page: Page, request: APIRequestContext, email: string) {
  await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: "http://127.0.0.1:4174" },
    data: {
      email,
      password: "household-browser-password-2026",
      name: "가상 보호자",
      callbackURL: "/login?verified=1",
    },
  });
  const mail = await (await request.get("/__test__/mail")).json();
  await page.goto(mail.find((m: { to: string }) => m.to === email).url);
  await page.getByLabel("아이디", { exact: true }).fill(email);
  await page
    .getByLabel("암호", { exact: true })
    .fill("household-browser-password-2026");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "오늘의 일정", exact:true }),
  ).toBeVisible();
}
for(const width of [320,390,768,1024,1440])test(`workspace shell remains visible on all menus at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:900});await login(page,request,`shell-hotfix-${width}@example.test`);
 for(const path of ['/today','/today/calendar','/today/repeats','/calendar','/tuition','/location','/chat','/records','/notifications','/family','/account','/account/reauth','/account/email','/phone?link=1','/family/invite','/device/connect?legacy=1']){
  await page.goto(path);await expect(page.locator('.workspace-brand')).toBeVisible();await expect(page.locator(width>760?'.workspace-rail':'.workspace-mobile-nav')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
 }
});


import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:4174" });
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
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("household-browser-password-2026");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "오늘도 함께 챙겨요" }),
  ).toBeVisible();
}
test("first login guide → nickname child → family code request/accept → email-free child device", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, request, "managed-browser-owner@example.test");
  await expect(
    page.getByRole("region", { name: "처음 시작 가이드" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "가족 연결 시작", exact: true }).click();
  await page.getByLabel("가족 이름", { exact: true }).fill("새로운 가상 가족");
  await page.getByRole("checkbox", { name: /나는 성인 보호자/ }).check();
  await page
    .getByRole("button", { name: "새 가족 만들기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "자녀는 별명만 추가해요" }),
  ).toBeVisible();
  await page.getByLabel("자녀 별명", { exact: true }).fill("가상 새싹");
  await page.getByRole("checkbox", { name: /나는 이 아이의 부모/ }).check();
  await page
    .getByRole("button", { name: "자녀 추가하고 다음", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "아이 번호를 확인하고 수락해요" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "가족 코드 만들기", exact: true })
    .click();
  const code = await page.getByLabel("24시간 가족 코드").inputValue();
  const guestContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    guest = await guestContext.newPage();
  await login(guest, request, "managed-browser-guest@example.test");
  await guest.goto("/start");
  await guest.getByLabel("받은 가족 코드").fill(code);
  await guest
    .getByRole("button", { name: "코드로 가족 참여 요청", exact: true })
    .click();
  await expect(
    guest.getByRole("heading", { name: "새로운 가상 가족 · 참여 승인 대기" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "요청 새로고침", exact: true })
    .click();
  await page.getByRole("button", { name: "요청 수락", exact: true }).click();
  await guest.getByRole("button", { name: "참여 상태 새로고침" }).click();
  await expect(guest.getByText("가상 새싹", { exact: true })).toHaveCount(0);
  const childContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    child = await childContext.newPage();
  await child.goto("http://127.0.0.1:4174/device/connect");
  await child.getByRole("button", { name: "연결 번호 받기" }).click();
  const deviceCode = (await child.locator(".pairing-code").innerText()).replace(
    /\s/g,
    "",
  );
  await page.getByLabel("아이 화면의 6자리 번호").fill(deviceCode);
  await page
    .getByRole("button", { name: "연결 요청 확인", exact: true })
    .click();
  await page.getByRole("button", { name: "이 아이의 연결 요청 수락" }).click();
  await expect(
    child.getByRole("heading", { name: "내 이름이 맞나요?" }),
  ).toBeVisible({ timeout: 10000 });
  await child.getByRole("button", { name: "내 기기로 연결하기" }).click();
  await expect(
    child.getByRole("heading", { name: "가상 새싹, 반가워요" }),
  ).toBeVisible();
  await child.reload();
  await expect(
    child.getByRole("heading", { name: "가상 새싹, 반가워요" }),
  ).toBeVisible();
  await expect(
    child.locator('.workspace-rail a[href="/child/connected"]'),
  ).toHaveCount(1);
  await guestContext.close();
  await childContext.close();
});
for (const width of [320, 390, 768, 1024, 1440])
  test(`every signed-in menu retains the shared shell at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, request, `menu-audit-${width}@example.test`);
    for (const path of [
      "/today",
      "/today/calendar",
      "/today/repeats",
      "/tuition",
      "/location",
      "/chat",
      "/records",
      "/notifications",
      "/family",
      "/start",
      "/account",
      "/account/reauth",
      "/account/email",
      "/phone?link=1",
      "/family/invite",
      "/device/connect",
    ]) {
      await page.goto(path);
      await expect(page.locator(".workspace-brand")).toBeVisible();
      await expect(
        page.locator(width > 760 ? ".workspace-rail" : ".workspace-mobile-nav"),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <= innerWidth &&
              document.documentElement.scrollHeight <= innerHeight,
          ),
        )
        .toBe(true);
    }
  });

test("public guide shows readable role buttons and leads children to code entry",async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/start');
 const parent=page.getByRole('link',{name:'보호자 로그인·가입',exact:true});await expect(parent).toBeVisible();expect((await parent.boundingBox())!.width).toBeGreaterThan(100);
 await page.getByRole('link',{name:'아이 연결 시작',exact:true}).click();await expect(page.getByRole('heading',{name:'가족과 연결해 볼까요?'})).toBeVisible();
 await expect(page.getByRole('button',{name:'연결 번호 받기'})).toBeVisible();
});

import { test, expect, type Page } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:4174" });
async function isolate(page: Page) {
  const calls: string[] = [];
  await page.route("**/api/**", (route) => {
    calls.push(route.request().url());
    return route.abort();
  });
  return calls;
}
test("test workspace needs no auth, persists CRUD and never touches production APIs", async ({
  page,
}) => {
  const calls = await isolate(page);
  await page.goto("/test/today");
  await expect(
    page.getByRole("heading", { name: "가족의 하루를 자유롭게 테스트해요" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "일정 추가", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("일정 이름").fill("기능 확인 수업");
  await dialog.getByLabel("시작 시간").fill("18:00");
  await dialog.getByLabel("종료 시간").fill("19:00");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/test/daily");
  const row = page.locator(".test-event-row").filter({
    has: page.getByRole("heading", { name: "기능 확인 수업", exact: true }),
  });
  await row.getByRole("button", { name: "도착", exact: true }).click();
  await expect(row).toContainText("도착 완료");
  await row.getByRole("button", { name: "출발", exact: true }).click();
  await expect(row).toContainText("출발 완료");
  await page.reload();
  await expect(
    page.locator(".test-event-row").filter({
      has: page.getByRole("heading", { name: "기능 확인 수업", exact: true }),
    }),
  ).toContainText("출발 완료");
  await page.goto("/test/records");
  await page.getByRole("textbox", { name: "기록 검색" }).fill("기능 확인 수업");
  await expect(
    page.getByText("기능 확인 수업 출발 기록", { exact: true }),
  ).toBeVisible();
  expect(calls).toEqual([]);
});
test("family, repeat, chat, device, fees and simulated location work together", async ({
  page,
}) => {
  const calls = await isolate(page);
  await page.goto("/test/family");
  await page.getByRole("button", { name: "아이 추가", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("가상 아이 이름")
    .fill("테스트친구");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "테스트친구", exact: true }),
  ).toBeVisible();
  await page.goto("/test/repeats");
  await page.getByRole("button", { name: "앞으로 7일 일정 생성" }).click();
  await expect(page.getByRole("status")).toContainText(
    "이미 생성한 일정은 중복되지 않아요",
  );
  await page.goto("/test/chat");
  await page
    .getByRole("textbox", { name: "하고 싶은 말" })
    .fill("통합 테스트 메시지");
  await page.getByRole("button", { name: "사랑해요", exact: true }).click();
  await page.getByRole("button", { name: "메시지 보내기" }).click();
  await expect(
    page.getByText("통합 테스트 메시지", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "아이", exact: true }).click();
  await page
    .getByRole("textbox", { name: "하고 싶은 말" })
    .fill("아이 답장 테스트");
  await page.getByRole("button", { name: "메시지 보내기" }).click();
  await expect(
    page.getByText("아이 답장 테스트", { exact: true }),
  ).toBeVisible();
  await page.goto("/test/devices");
  await page.getByRole("button", { name: "연결 번호 발급" }).click();
  const code = await page.locator(".test-pair-code strong").innerText();
  await page.getByLabel("발급한 6자리 번호").fill(code);
  await page.getByRole("button", { name: "기기 연결 승인" }).click();
  await expect(
    page.getByRole("heading", { name: "아이 테스트 기기", exact: true }),
  ).toBeVisible();
  await page.goto("/test/fees");
  await page.getByRole("button", { name: "납부 표시", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "납부 표시 취소", exact: true }),
  ).toBeVisible();
  await page.goto("/test/location");
  await page.getByRole("button", { name: "가상 위치 보내기" }).click();
  await expect(page.getByText("서준 · 학교", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "가상 위치 공유 중지" }).click();
  await expect(
    page.getByText("공유한 위치가 없어요", { exact: true }),
  ).toBeVisible();
  await page.goto("/test/notifications");
  await page.getByRole("button", { name: "모두 읽음", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "새 소식 0개" }),
  ).toBeVisible();
  expect(calls).toEqual([]);
});
const testPages = [
  "today",
  "calendar",
  "daily",
  "repeats",
  "chat",
  "family",
  "devices",
  "location",
  "fees",
  "records",
  "notifications",
  "account",
  "child",
];
for (const width of [320, 390, 768, 1024, 1440]) {
  test(`all test menus reflow at ${width}px without API access`, async ({
    page,
  }) => {
    const calls = await isolate(page);
    await page.setViewportSize({ width, height: 950 });
    for (const path of testPages) {
      await test.step(path, async () => {
        await page.goto("/test/" + path);
        await expect(page.locator("main h1")).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          )
          .toBe(true);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollHeight <= window.innerHeight,
          ),
        ).toBe(true);
        await expect(page.locator("main")).toHaveCSS("overflow-y", "auto");
      });
    }
    expect(calls).toEqual([]);
  });
}
test("test workspace supports large text and 200 percent reflow", async ({
  page,
}) => {
  const calls = await isolate(page);
  await page.setViewportSize({ width: 720, height: 800 });
  await page.goto("/test/today");
  await page.getByRole("button", { name: "큰 글씨", exact: true }).click();
  await page.evaluate(() => (document.documentElement.style.fontSize = "32px"));
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  expect(calls).toEqual([]);
});
test("validation, cancellation, font preferences and reset remain usable", async ({
  page,
}) => {
  const calls = await isolate(page);
  await page.goto("/test/calendar");
  await page.getByRole("button", { name: "일정 추가", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("일정 이름").fill("잘못된 시간");
  await d.getByLabel("시작 시간").fill("15:00");
  await d.getByLabel("종료 시간").fill("14:00");
  await d.getByRole("button", { name: "저장", exact: true }).click();
  await expect(d).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(d).toHaveCount(0);
  await page.getByText("화면", { exact: true }).click();
  await page.getByRole("button", { name: "노토 산스", exact: true }).click();
  await page.getByRole("button", { name: "어둡게", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-font", "noto");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/test/account");
  await page.getByLabel("테스트 보호자 이름").fill("변경 테스트");
  await page.getByRole("button", { name: "프로필 저장" }).click();
  await page.getByRole("button", { name: "테스트 데이터 초기화" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page.getByLabel("테스트 보호자 이름")).toHaveValue(
    "테스트 보호자",
  );
  expect(calls).toEqual([]);
});

test("content pane scrolls by keyboard while shell stays fixed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/test/family");
  const main = page.locator("main");
  await main.focus();
  await page.keyboard.press("Control+End");
  await expect
    .poll(() =>
      main.evaluate(
        (el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
      ),
    )
    .toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator(".topbar")).toBeInViewport();
});
test("map configuration failure is recoverable and clearly labels example data", async ({
  page,
}) => {
  await page.goto("/test/location");
  await expect(
    page.getByRole("region", { name: "카카오 예시 지도" }),
  ).toBeVisible();
  await expect(page.getByText("지도 연결 설정을 준비 중이에요.")).toBeVisible();
  await page.getByRole("button", { name: "다시 연결", exact: true }).click();
  await expect(page.getByText("지도 연결 설정을 준비 중이에요.")).toBeVisible();
  await expect(
    page.getByText("제주 예시 좌표 · 실제 아이 위치가 아니에요"),
  ).toBeVisible();
});

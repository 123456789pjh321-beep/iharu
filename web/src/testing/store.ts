import { z } from "zod";
export const TEST_STORAGE_KEY = "iharu:test-workspace:v1";
export const stickers = [
  "hello",
  "arrived",
  "home",
  "love",
  "happy",
  "help",
  "thanks",
  "goodnight",
] as const;
const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => {
      const n = Date.parse(s + "T12:00:00Z");
      return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === s;
    }, "날짜를 확인해 주세요."),
  timestamp = z.iso.datetime(),
  time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  id = z.string().min(1).max(100);
export const childSchema = z.object({
  id,
  nickname: z.string().trim().min(1).max(20),
  birthDate: day,
  color: z.enum(["blue", "violet", "amber"]),
});
export const eventSchema = z.object({
  id,
  childId: id,
  title: z.string().trim().min(1).max(60),
  date: day,
  start: time,
  end: time,
  place: z.string().max(60),
  arrived: timestamp.nullable(),
  departed: timestamp.nullable(),
  seriesId: id.optional(),
});
export const repeatSchema = z.object({
  id,
  childId: id,
  title: z.string().trim().min(1).max(60),
  start: time,
  end: time,
  place: z.string().max(60),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
});
const messageSchema = z.object({
  id,
  childId: id,
  actor: z.enum(["guardian", "child"]),
  text: z.string().max(500),
  sticker: z.union([z.literal(""), z.enum(stickers)]),
  at: timestamp,
});
const memberSchema = z.object({
  id,
  name: z.string().trim().min(1).max(20),
  status: z.enum(["pending", "active"]),
  daily: z.boolean(),
  chat: z.boolean(),
  location: z.boolean(),
});
const deviceSchema = z.object({
  id,
  childId: id,
  label: z.string().max(40),
  at: timestamp,
});
const feeSchema = z.object({
  id,
  childId: id,
  title: z.string().trim().min(1).max(50),
  amount: z.number().int().min(0).max(100000000),
  due: day,
  paid: z.boolean(),
});
const noticeSchema = z.object({
  id,
  title: z.string(),
  at: timestamp,
  read: z.boolean(),
});
const logSchema = z.object({
  id,
  text: z.string(),
  at: timestamp,
  kind: z.enum([
    "schedule",
    "daily",
    "family",
    "chat",
    "device",
    "fee",
    "location",
    "account",
  ]),
});
const positionSchema = z.object({
  childId: id,
  point: z.enum(["home", "school", "academy"]),
  at: timestamp,
  sharing: z.boolean(),
});
const pairingSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
    expiresAt: z.number(),
    label: z.string().max(40),
  })
  .nullable();
export const testStateSchema = z.object({
  version: z.literal(1),
  familyName: z.string().trim().min(1).max(40),
  profileName: z.string().trim().min(1).max(30),
  children: z.array(childSchema).max(20),
  events: z.array(eventSchema).max(1000),
  repeats: z.array(repeatSchema).max(100),
  messages: z.array(messageSchema).max(500),
  members: z.array(memberSchema).max(30),
  devices: z.array(deviceSchema).max(40),
  fees: z.array(feeSchema).max(200),
  notices: z.array(noticeSchema).max(200),
  logs: z.array(logSchema).max(500),
  positions: z.array(positionSchema).max(20),
  pairing: pairingSchema,
  guardianReview: z.enum(["not-started", "pending", "approved", "rejected"]),
});
export type TestState = z.infer<typeof testStateSchema>;
export type TestEvent = z.infer<typeof eventSchema>;
export type TestChild = z.infer<typeof childSchema>;
export type TestRepeat = z.infer<typeof repeatSchema>;
export type TestFee = z.infer<typeof feeSchema>;
export type LogKind = TestState["logs"][number]["kind"];
export function koreaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function newId() {
  return crypto.randomUUID();
}
export function seedTestState(now = new Date()): TestState {
  const today = koreaDate(now),
    at = now.toISOString();
  return {
    version: 1,
    familyName: "우리 그룹 · 테스트",
    profileName: "테스트 일반사용자",
    children: [
      {
        id: "test-child-1",
        nickname: "서준",
        birthDate: "2018-04-12",
        color: "blue",
      },
      {
        id: "test-child-2",
        nickname: "서하",
        birthDate: "2019-08-23",
        color: "violet",
      },
    ],
    events: [
      {
        id: "test-event-1",
        childId: "test-child-1",
        title: "학교",
        date: today,
        start: "08:40",
        end: "14:10",
        place: "예시 초등학교",
        arrived: null,
        departed: null,
      },
      {
        id: "test-event-2",
        childId: "test-child-1",
        title: "태권도",
        date: today,
        start: "16:00",
        end: "17:00",
        place: "예시 태권도장",
        arrived: null,
        departed: null,
      },
      {
        id: "test-event-3",
        childId: "test-child-2",
        title: "유치원",
        date: today,
        start: "09:00",
        end: "15:00",
        place: "예시 유치원",
        arrived: null,
        departed: null,
      },
    ],
    repeats: [
      {
        id: "test-repeat-1",
        childId: "test-child-1",
        title: "독서 교실",
        start: "15:00",
        end: "16:00",
        place: "예시 독서 교실",
        days: [1, 3, 5],
      },
    ],
    messages: [
      {
        id: "test-message-1",
        childId: "test-child-1",
        actor: "child",
        text: "학교에 잘 도착했어요!",
        sticker: "arrived",
        at,
      },
    ],
    members: [
      {
        id: "test-member-1",
        name: "함께하는 일반사용자",
        status: "active",
        daily: true,
        chat: true,
        location: false,
      },
    ],
    devices: [],
    fees: [
      {
        id: "test-fee-1",
        childId: "test-child-1",
        title: "태권도 수업료",
        amount: 150000,
        due: addDays(today, 7),
        paid: false,
      },
    ],
    notices: [
      {
        id: "test-notice-1",
        title: "통합 테스트 모드에 오신 것을 환영해요.",
        at,
        read: false,
      },
    ],
    logs: [
      {
        id: "test-log-1",
        text: "테스트 그룹과 예시 일정을 준비했어요.",
        at,
        kind: "account",
      },
    ],
    positions: [],
    pairing: null,
    guardianReview: "approved",
  };
}
export function loadTestState(
  raw: string | null,
  now = new Date(),
): { state: TestState; recovered: boolean } {
  if (!raw) return { state: seedTestState(now), recovered: false };
  try {
    if (raw.length > 2000000) throw new Error("size");
    return { state: testStateSchema.parse(JSON.parse(raw)), recovered: false };
  } catch {
    return { state: seedTestState(now), recovered: true };
  }
}
export function audit(
  s: TestState,
  text: string,
  kind: LogKind,
  now = new Date(),
) {
  const at = now.toISOString();
  s.logs.unshift({ id: newId(), text, at, kind });
  s.logs = s.logs.slice(0, 500);
  s.notices.unshift({ id: newId(), title: text, at, read: false });
  s.notices = s.notices.slice(0, 200);
}
function childExists(s: TestState, childId: string) {
  if (!s.children.some((c) => c.id === childId))
    throw new Error("먼저 테스트 아이를 등록해 주세요.");
}
export function saveEvent(s: TestState, input: TestEvent) {
  const e = eventSchema.parse(input);
  childExists(s, e.childId);
  if (e.end <= e.start)
    throw new Error("끝나는 시간은 시작 시간보다 늦어야 해요.");
  const index = s.events.findIndex((x) => x.id === e.id);
  if (index < 0) {
    if (s.events.length >= 1000)
      throw new Error("일정은 1,000개까지 테스트할 수 있어요.");
    s.events.push(e);
  } else s.events[index] = e;
  audit(
    s,
    `${e.title} 일정을 ${index < 0 ? "등록" : "수정"}했어요.`,
    "schedule",
  );
}
export function attendance(
  s: TestState,
  eventId: string,
  action: "arrive" | "depart" | "reset",
  now = new Date(),
) {
  const e = s.events.find((x) => x.id === eventId);
  if (!e) throw new Error("일정을 다시 선택해 주세요.");
  if (action === "depart" && !e.arrived)
    throw new Error("도착 기록을 먼저 남겨 주세요.");
  if ((action === "arrive" && e.arrived) || (action === "depart" && e.departed))
    return;
  if (action === "arrive") e.arrived = now.toISOString();
  if (action === "depart") e.departed = now.toISOString();
  if (action === "reset") {
    e.arrived = null;
    e.departed = null;
  }
  audit(
    s,
    `${e.title} ${action === "arrive" ? "도착" : action === "depart" ? "출발" : "등하원 초기화"} 기록`,
    "daily",
    now,
  );
}
export function saveRepeat(s: TestState, input: TestRepeat) {
  const r = repeatSchema.parse(input);
  childExists(s, r.childId);
  if (r.end <= r.start) throw new Error("끝나는 시간을 확인해 주세요.");
  const index = s.repeats.findIndex((x) => x.id === r.id);
  if (index < 0) {
    if (s.repeats.length >= 100)
      throw new Error("반복 일정은 100개까지 등록할 수 있어요.");
    s.repeats.push(r);
  } else s.repeats[index] = r;
  audit(s, `${r.title} 반복 일정을 저장했어요.`, "schedule");
}
export function generateWeek(s: TestState, seriesId: string, from: string) {
  const r = s.repeats.find((x) => x.id === seriesId);
  if (!r) throw new Error("반복 일정을 선택해 주세요.");
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDays(from, i),
      weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (
      r.days.includes(weekday) &&
      !s.events.some((e) => e.seriesId === r.id && e.date === date)
    ) {
      saveEvent(s, {
        id: newId(),
        childId: r.childId,
        title: r.title,
        date,
        start: r.start,
        end: r.end,
        place: r.place,
        arrived: null,
        departed: null,
        seriesId: r.id,
      });
      count++;
    }
  }
  return count;
}
export function removeChild(s: TestState, childId: string) {
  const child = s.children.find((c) => c.id === childId);
  if (!child) return;
  s.children = s.children.filter((c) => c.id !== childId);
  s.events = s.events.filter((c) => c.childId !== childId);
  s.repeats = s.repeats.filter((c) => c.childId !== childId);
  s.messages = s.messages.filter((c) => c.childId !== childId);
  s.fees = s.fees.filter((c) => c.childId !== childId);
  s.devices = s.devices.filter((c) => c.childId !== childId);
  s.positions = s.positions.filter((c) => c.childId !== childId);
  audit(
    s,
    `${child.nickname}의 테스트 정보와 연결 데이터를 삭제했어요.`,
    "family",
  );
}
export function sendMessage(
  s: TestState,
  childId: string,
  actor: "guardian" | "child",
  text: string,
  sticker = "",
) {
  childExists(s, childId);
  text = text.trim();
  if (!text && !sticker) throw new Error("메시지나 그림을 선택해 주세요.");
  if (text.length > 500)
    throw new Error("메시지는 500자까지 입력할 수 있어요.");
  if (sticker && !stickers.includes(sticker as (typeof stickers)[number]))
    throw new Error("그림을 다시 선택해 주세요.");
  s.messages.push(
    messageSchema.parse({
      id: newId(),
      childId,
      actor,
      text,
      sticker,
      at: new Date().toISOString(),
    }),
  );
  s.messages = s.messages.slice(-500);
  audit(s, "새 단체 대화를 남겼어요.", "chat");
}
export function saveFee(s: TestState, input: TestFee) {
  const f = feeSchema.parse(input);
  childExists(s, f.childId);
  const i = s.fees.findIndex((x) => x.id === f.id);
  if (i < 0) {
    if (s.fees.length >= 200)
      throw new Error("가계부는 200개까지 테스트할 수 있어요.");
    s.fees.push(f);
  } else s.fees[i] = f;
  audit(s, `${f.title} 가계부를 저장했어요.`, "fee");
}
export function issuePairing(s: TestState, label: string, now = Date.now()) {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  s.pairing = {
    code: String(100000 + (bytes[0] % 900000)),
    expiresAt: now + 300000,
    label: label.trim().slice(0, 40) || "테스트 아이 기기",
  };
}
export function connectDevice(
  s: TestState,
  childId: string,
  code: string,
  now = Date.now(),
) {
  childExists(s, childId);
  if (!s.pairing || s.pairing.code !== code)
    throw new Error("발급한 6자리 번호를 확인해 주세요.");
  if (now >= s.pairing.expiresAt)
    throw new Error("번호가 만료됐어요. 새 번호를 발급해 주세요.");
  if (s.devices.filter((d) => d.childId === childId).length >= 2)
    throw new Error("아이당 기기는 2대까지 연결할 수 있어요.");
  s.devices.push({
    id: newId(),
    childId,
    label: s.pairing.label,
    at: new Date(now).toISOString(),
  });
  s.pairing = null;
  audit(s, "테스트 아이 기기를 연결했어요.", "device");
}

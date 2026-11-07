import { describe, it, expect } from "vitest";
import {
  TEST_STORAGE_KEY,
  seedTestState,
  loadTestState,
  testStateSchema,
  koreaDate,
  saveEvent,
  attendance,
  generateWeek,
  removeChild,
  sendMessage,
  saveFee,
  issuePairing,
  connectDevice,
} from "../web/src/testing/store";
const now = new Date("2026-11-07T16:20:00Z");
describe("isolated test workspace", () => {
  it("seeds relative to Korea time and contains no authentication credentials", () => {
    const s = seedTestState(now);
    expect(koreaDate(now)).toBe("2026-11-08");
    expect(s.events.every((e) => e.date === "2026-11-08")).toBe(true);
    expect(TEST_STORAGE_KEY).toBe("iharu:test-workspace:v1");
    expect(Object.keys(s)).not.toContain("session");
    expect(Object.keys(s)).not.toContain("token");
    expect(testStateSchema.safeParse(s).success).toBe(true);
  });
  it("round trips edits and restores malformed or incompatible saved state safely", () => {
    const s = seedTestState(now);
    s.familyName = "다른 테스트 가족";
    expect(loadTestState(JSON.stringify(s), now).state.familyName).toBe(
      s.familyName,
    );
    for (const raw of [
      "broken",
      JSON.stringify({ ...s, version: 99 }),
      JSON.stringify({ ...s, logs: [{ ...s.logs[0], at: "invalid" }] }),
    ])
      expect(loadTestState(raw, now).recovered).toBe(true);
    expect(loadTestState(null, now).recovered).toBe(false);
  });
  it("creates and edits the same event rather than duplicating it", () => {
    const s = seedTestState(now),
      e = { ...s.events[0], id: "new-event", title: "추가 테스트" };
    saveEvent(s, e);
    saveEvent(s, { ...e, title: "수정 테스트" });
    expect(s.events.filter((x) => x.id === e.id)).toHaveLength(1);
    expect(s.events.find((x) => x.id === e.id)?.title).toBe("수정 테스트");
  });
  it("rejects invalid times and children before changing event data", () => {
    const s = seedTestState(now),
      count = s.events.length;
    expect(() =>
      saveEvent(s, { ...s.events[0], id: "bad", start: "15:00", end: "14:00" }),
    ).toThrow();
    expect(() =>
      saveEvent(s, { ...s.events[0], id: "bad", childId: "missing" }),
    ).toThrow();
    expect(s.events).toHaveLength(count);
  });
  it("requires arrival before departure, avoids duplicate records and permits reset", () => {
    const s = seedTestState(now),
      e = s.events[0];
    expect(() => attendance(s, e.id, "depart", now)).toThrow();
    attendance(s, e.id, "arrive", now);
    const n = s.logs.length;
    attendance(s, e.id, "arrive", now);
    expect(s.logs).toHaveLength(n);
    attendance(s, e.id, "depart", now);
    expect(e.departed).toBe(now.toISOString());
    attendance(s, e.id, "reset", now);
    expect(e.arrived).toBeNull();
    expect(e.departed).toBeNull();
  });
  it("generates matching weekdays without duplicating repeated schedules", () => {
    const s = seedTestState(now);
    const count = generateWeek(s, s.repeats[0].id, "2026-11-09");
    expect(count).toBe(3);
    expect(generateWeek(s, s.repeats[0].id, "2026-11-09")).toBe(0);
    expect(
      s.events.filter((e) => e.seriesId === s.repeats[0].id).map((e) => e.date),
    ).toEqual(["2026-11-09", "2026-11-11", "2026-11-13"]);
  });
  it("cascades deletion only through the selected child test data", () => {
    const s = seedTestState(now),
      a = s.children[0].id,
      b = s.children[1].id;
    s.devices.push({
      id: "device",
      childId: a,
      label: "테스트 기기",
      at: now.toISOString(),
    });
    s.positions.push({
      childId: a,
      point: "home",
      sharing: true,
      at: now.toISOString(),
    });
    removeChild(s, a);
    for (const key of [
      "events",
      "repeats",
      "messages",
      "fees",
      "devices",
      "positions",
    ] as const)
      expect(s[key].some((x) => x.childId === a)).toBe(false);
    expect(s.children.some((c) => c.id === b)).toBe(true);
    expect(s.events.some((e) => e.childId === b)).toBe(true);
  });
  it("supports parent and child messages, trims text and validates stickers", () => {
    const s = seedTestState(now),
      child = s.children[0].id;
    sendMessage(s, child, "guardian", "  반가워요  ", "love");
    sendMessage(s, child, "child", "", "hello");
    expect(s.messages.at(-2)?.text).toBe("반가워요");
    expect(s.messages.at(-1)?.actor).toBe("child");
    expect(() => sendMessage(s, child, "child", " ", "")).toThrow();
    expect(() =>
      sendMessage(s, child, "child", "내용", "arbitrary-path"),
    ).toThrow();
    expect(() => sendMessage(s, "missing", "child", "안녕")).toThrow();
  });
  it("validates fee values and edits without adding a second row", () => {
    const s = seedTestState(now),
      fee = s.fees[0];
    saveFee(s, { ...fee, amount: 100000, paid: true });
    expect(s.fees).toHaveLength(1);
    expect(s.fees[0].paid).toBe(true);
    expect(() => saveFee(s, { ...fee, amount: -1 })).toThrow();
    expect(() => saveFee(s, { ...fee, due: "2026-02-31" })).toThrow();
  });
  it("requires an exact unexpired pairing code and consumes it after approval", () => {
    const s = seedTestState(now),
      t = now.getTime();
    issuePairing(s, "가상 기기", t);
    const code = s.pairing!.code;
    expect(code).toMatch(/^\d{6}$/);
    expect(() => connectDevice(s, s.children[0].id, "000000", t)).toThrow();
    expect(() =>
      connectDevice(s, s.children[0].id, code, t + 300001),
    ).toThrow();
    connectDevice(s, s.children[0].id, code, t + 1000);
    expect(s.devices).toHaveLength(1);
    expect(s.pairing).toBeNull();
    expect(() => connectDevice(s, s.children[0].id, code, t + 2000)).toThrow();
  });
  it("limits test devices per child", () => {
    const s = seedTestState(now),
      t = now.getTime(),
      child = s.children[0].id;
    for (let i = 0; i < 2; i++) {
      issuePairing(s, "기기 " + i, t);
      connectDevice(s, child, s.pairing!.code, t);
    }
    issuePairing(s, "세 번째", t);
    expect(() => connectDevice(s, child, s.pairing!.code, t)).toThrow("2대");
  });
});

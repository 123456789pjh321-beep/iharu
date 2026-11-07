import {KakaoMap} from '../maps/KakaoMap';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { z } from "zod";
import {
  WorkspaceBrand,
  WorkspaceNavigation,
} from "../components/WorkspaceNavigation";
import { DisplaySettings, Entrance } from "../components/Experience";
import { Card } from "../components/Common";
import { Icon, type IconName } from "../components/Icon";
import {
  TEST_STORAGE_KEY,
  loadTestState,
  testStateSchema,
  seedTestState,
  koreaDate,
  newId,
  audit,
  saveEvent,
  attendance,
  saveRepeat,
  generateWeek,
  removeChild,
  sendMessage,
  saveFee,
  issuePairing,
  connectDevice,
  stickers,
  type TestState,
  type TestEvent,
  type TestChild,
  type TestRepeat,
  type TestFee,
  type LogKind,
} from "./store";
import "./test-workspace.css";
const pages: Record<
  string,
  { title: string; description: string; icon: IconName }
> = {
  today: {
    title: "가족의 하루를 자유롭게 테스트해요",
    description: "일정부터 등하원, 가족 대화까지 직접 추가하고 확인하세요.",
    icon: "home",
  },
  calendar: {
    title: "우리 가족 달력",
    description: "날짜를 선택하고 일정을 추가·수정·삭제해 보세요.",
    icon: "calendar",
  },
  daily: {
    title: "오늘의 등하원",
    description: "도착과 출발을 기록하면 하루 기록과 알림에 함께 남아요.",
    icon: "bag",
  },
  repeats: {
    title: "반복 일정",
    description: "요일별 계획을 만들고 앞으로 7일의 일정으로 적용해 보세요.",
    icon: "repeat",
  },
  chat: {
    title: "가족 대화",
    description: "보호자와 아이 역할을 바꿔 글과 그림 메시지를 보내 보세요.",
    icon: "chat",
  },
  family: {
    title: "가족과 아이 관리",
    description: "가상 아이와 보호자를 등록하고 공유 범위를 조정해 보세요.",
    icon: "shield",
  },
  devices: {
    title: "아이 기기 연결",
    description: "연결 번호 발급부터 승인·해제까지 이 브라우저에서 테스트해요.",
    icon: "device",
  },
  location: {
    title: "아이 위치",
    description: "카카오 지도에서 예시 위치를 보내는 흐름을 확인해요.",
    icon: "pin",
  },
  fees: {
    title: "학원비 관리",
    description:
      "예상 학원비와 납부 상태를 기록해요. 실제 결제는 발생하지 않아요.",
    icon: "wallet",
  },
  records: {
    title: "하루 기록",
    description: "테스트 작업실에서 남긴 활동을 날짜와 유형별로 확인해요.",
    icon: "book",
  },
  notifications: {
    title: "가족의 새 소식",
    description: "일정과 대화, 등하원 기록에서 만들어진 알림을 확인해요.",
    icon: "bell",
  },
  account: {
    title: "테스트 계정과 데이터",
    description: "회원가입이나 이메일 인증 없이 기능을 살펴볼 수 있어요.",
    icon: "settings",
  },
  child: {
    title: "아이의 하루",
    description: "큰 버튼으로 도착을 알리고 가족에게 그림을 보내 보세요.",
    icon: "sun",
  },
};
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const stickerNames: Record<string, string> = {
  hello: "안녕",
  arrived: "도착했어요",
  home: "집이에요",
  love: "사랑해요",
  happy: "기뻐요",
  help: "도와주세요",
  thanks: "고마워요",
  goodnight: "잘 자요",
};
const kindNames: Record<LogKind, string> = {
  schedule: "일정",
  daily: "등하원",
  family: "가족",
  chat: "대화",
  device: "기기",
  fee: "학원비",
  location: "위치",
  account: "계정",
};
const money = (n: number) => new Intl.NumberFormat("ko-KR").format(n) + "원";
const stamp = (value: string) =>
  new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function readSaved() {
  try {
    return loadTestState(localStorage.getItem(TEST_STORAGE_KEY));
  } catch {
    return { state: seedTestState(), recovered: false };
  }
}
type Editor = {
  kind: "event" | "child" | "repeat" | "fee" | "member";
  id?: string;
};
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="test-empty">
      <Icon name="calendar" />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current,
      old = document.activeElement as HTMLElement | null;
    d?.showModal();
    return () => {
      d?.close();
      old?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="test-dialog"
      aria-labelledby="test-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="test-dialog-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="대화상자 닫기"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Field({
  label,
  name,
  value = "",
  type = "text",
  required = true,
  maxLength = 60,
  min,
  max,
}: {
  label: string;
  name: string;
  value?: string | number;
  type?: string;
  required?: boolean;
  maxLength?: number;
  min?: string | number;
  max?: string | number;
}) {
  return (
    <div className="form-field">
      <label htmlFor={"edit-" + name}>{label}</label>
      <input
        id={"edit-" + name}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        maxLength={maxLength}
        min={min}
        max={max}
      />
    </div>
  );
}
function EditDialog({
  editor,
  state,
  childId,
  date,
  onClose,
  onSave,
}: {
  editor: Editor;
  state: TestState;
  childId: string;
  date: string;
  onClose: () => void;
  onSave: (values: FormData) => boolean;
}) {
  const current =
    editor.kind === "event"
      ? state.events.find((e) => e.id === editor.id)
      : editor.kind === "child"
        ? state.children.find((e) => e.id === editor.id)
        : editor.kind === "repeat"
          ? state.repeats.find((e) => e.id === editor.id)
          : editor.kind === "fee"
            ? state.fees.find((e) => e.id === editor.id)
            : state.members.find((e) => e.id === editor.id);
  const defaults = current as
    | (Partial<TestEvent & TestChild & TestRepeat & TestFee> & {
        name?: string;
      })
    | undefined;
  const title =
    {
      event: "일정",
      child: "아이",
      repeat: "반복 일정",
      fee: "학원비",
      member: "보호자",
    }[editor.kind] + (current ? " 수정" : " 추가");
  const [error, setError] = useState("");
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        className="test-edit-form"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          try {
            if (onSave(new FormData(e.currentTarget))) onClose();
            else setError("입력한 내용을 다시 확인해 주세요.");
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "입력을 확인해 주세요.",
            );
          }
        }}
      >
        {["event", "repeat", "fee"].includes(editor.kind) && (
          <div className="form-field">
            <label htmlFor="edit-child">아이</label>
            <select
              id="edit-child"
              name="childId"
              required
              defaultValue={defaults?.childId || childId}
            >
              {state.children.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.nickname}
                </option>
              ))}
            </select>
          </div>
        )}
        {editor.kind === "child" ? (
          <>
            <Field
              label="가상 아이 이름"
              name="nickname"
              value={defaults?.nickname}
              maxLength={20}
            />
            <Field
              label="예시 생년월일"
              name="birthDate"
              type="date"
              value={defaults?.birthDate || "2018-01-01"}
              max={koreaDate()}
            />
            <div className="form-field">
              <label htmlFor="edit-color">아이 색상</label>
              <select
                id="edit-color"
                name="color"
                defaultValue={defaults?.color || "blue"}
              >
                <option value="blue">블루</option>
                <option value="violet">바이올렛</option>
                <option value="amber">앰버</option>
              </select>
            </div>
          </>
        ) : editor.kind === "member" ? (
          <Field
            label="가상 보호자 이름"
            name="name"
            value={defaults?.name}
            maxLength={20}
          />
        ) : (
          <Field
            label={editor.kind === "fee" ? "학원비 항목" : "일정 이름"}
            name="title"
            value={defaults?.title}
          />
        )}
        {editor.kind === "event" && (
          <Field
            label="날짜"
            name="date"
            type="date"
            value={defaults?.date || date}
          />
        )}
        {["event", "repeat"].includes(editor.kind) && (
          <>
            <div className="test-form-columns">
              <Field
                label="시작 시간"
                name="start"
                type="time"
                value={defaults?.start || "09:00"}
              />
              <Field
                label="종료 시간"
                name="end"
                type="time"
                value={defaults?.end || "10:00"}
              />
            </div>
            <Field
              label="장소"
              name="place"
              value={defaults?.place}
              required={false}
            />
          </>
        )}
        {editor.kind === "repeat" && (
          <fieldset className="test-weekdays">
            <legend>반복할 요일</legend>
            {weekdays.map((d, i) => (
              <label key={d}>
                <input
                  name="days"
                  type="checkbox"
                  value={i}
                  defaultChecked={defaults?.days?.includes(i)}
                />
                <span>{d}</span>
              </label>
            ))}
          </fieldset>
        )}
        {editor.kind === "fee" && (
          <>
            <Field
              label="금액 (원)"
              name="amount"
              type="number"
              value={defaults?.amount || 0}
              min={0}
              max={100000000}
            />
            <Field
              label="납부 예정일"
              name="due"
              type="date"
              value={defaults?.due || date}
            />
          </>
        )}
        {error && (
          <p className="test-inline-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button className="button" type="button" onClick={onClose}>
            취소
          </button>
          <button className="button primary" type="submit">
            저장
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
export default function TestWorkspace() {
  const { pathname } = useLocation(),
    page = pathname.replace(/^\/test\/?/, "") || "today",
    meta = pages[page];
  const [initial] = useState(readSaved),
    [state, setState] = useState(initial.state),
    stateRef = useRef(state),
    [child, setChild] = useState("all"),
    [date, setDate] = useState(koreaDate),
    [editor, setEditor] = useState<Editor | null>(null),
    [notice, setNotice] = useState(
      initial.recovered
        ? "이전 테스트 데이터를 읽지 못해 예시 데이터로 복구했어요."
        : "",
    ),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<{
      title: string;
      detail: string;
      run: () => void;
    } | null>(null),
    [large, setLarge] = useState(() => {
      try {
        return localStorage.getItem("iharu:large-type") === "true";
      } catch {
        return false;
      }
    });
  useEffect(() => {
    document.documentElement.classList.toggle("large-type", large);
    try {
      localStorage.setItem("iharu:large-type", String(large));
    } catch {
      /* optional */
    }
  }, [large]);
  useEffect(() => {
    document.title = `${meta?.title || "기능 테스트"} · 아이하루 테스트`;
    setError("");
    document.getElementById("test-main")?.scrollTo(0, 0);
    document.getElementById("test-main")?.focus({ preventScroll: true });
  }, [page, meta?.title]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key !== TEST_STORAGE_KEY) return;
      const loaded = loadTestState(e.newValue);
      stateRef.current = loaded.state;
      setState(loaded.state);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function update(
    recipe: (next: TestState) => void,
    message = "테스트 내용을 저장했어요.",
  ) {
    setError("");
    try {
      const next = structuredClone(stateRef.current);
      recipe(next);
      const validated = testStateSchema.parse(next);
      try {
        localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(validated));
        setNotice(message);
      } catch {
        setNotice(
          "브라우저 저장 공간을 사용할 수 없어 현재 화면에서만 유지해요.",
        );
      }
      stateRef.current = validated;
      setState(validated);
      return true;
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? "입력 값과 등록 가능한 개수를 확인해 주세요."
          : e instanceof Error
            ? e.message
            : "다시 시도해 주세요.",
      );
      return false;
    }
  }
  const childId =
      state.children.find((c) => c.id === child)?.id ||
      state.children[0]?.id ||
      "",
    nickname = (id: string) =>
      state.children.find((c) => c.id === id)?.nickname || "아이";
  const events = state.events
      .filter(
        (e) => e.date === date && (child === "all" || e.childId === child),
      )
      .sort((a, b) => a.start.localeCompare(b.start)),
    unread = state.notices.filter((n) => !n.read).length;
  const open = (kind: Editor["kind"], id?: string) => {
    if (["event", "repeat", "fee"].includes(kind) && !state.children.length) {
      setNotice("가상 아이를 먼저 등록해 주세요.");
      setEditor({ kind: "child" });
      return;
    }
    setEditor({ kind, id });
  };
  const ask = (title: string, detail: string, run: () => void) =>
    setConfirm({ title, detail, run });
  const erase = (
    kind: "events" | "repeats" | "fees" | "messages" | "devices",
    id: string,
    label: string,
  ) =>
    ask(`${label} 삭제`, "이 브라우저의 테스트 기록에서 삭제해요.", () =>
      update((s) => {
        if (kind === "events") s.events = s.events.filter((x) => x.id !== id);
        else if (kind === "repeats")
          s.repeats = s.repeats.filter((x) => x.id !== id);
        else if (kind === "fees") s.fees = s.fees.filter((x) => x.id !== id);
        else if (kind === "messages")
          s.messages = s.messages.filter((x) => x.id !== id);
        else s.devices = s.devices.filter((x) => x.id !== id);
        audit(
          s,
          `${label} 테스트 기록을 삭제했어요.`,
          kind === "messages"
            ? "chat"
            : kind === "fees"
              ? "fee"
              : kind === "devices"
                ? "device"
                : "schedule",
        );
      }),
    );
  function save(values: FormData) {
    if (!editor) return false;
    const get = (k: string) => String(values.get(k) || "");
    return update((s) => {
      const id = editor.id || newId();
      switch (editor.kind) {
        case "event": {
          const old = s.events.find((e) => e.id === id);
          saveEvent(s, {
            id,
            childId: get("childId"),
            title: get("title"),
            date: get("date"),
            start: get("start"),
            end: get("end"),
            place: get("place"),
            arrived: old?.arrived || null,
            departed: old?.departed || null,
            ...(old?.seriesId ? { seriesId: old.seriesId } : {}),
          });
          break;
        }
        case "repeat":
          saveRepeat(s, {
            id,
            childId: get("childId"),
            title: get("title"),
            start: get("start"),
            end: get("end"),
            place: get("place"),
            days: values.getAll("days").map(Number),
          });
          break;
        case "fee":
          saveFee(s, {
            id,
            childId: get("childId"),
            title: get("title"),
            amount: Number(get("amount")),
            due: get("due"),
            paid: s.fees.find((f) => f.id === id)?.paid || false,
          });
          break;
        case "child": {
          const c = {
            id,
            nickname: get("nickname").trim(),
            birthDate: get("birthDate"),
            color: get("color") as TestChild["color"],
          };
          if (c.birthDate > koreaDate())
            throw new Error("생년월일은 오늘 이전으로 입력해 주세요.");
          const i = s.children.findIndex((c) => c.id === id);
          if (i < 0) s.children.push(c);
          else s.children[i] = c;
          audit(s, `${c.nickname} 테스트 아이를 저장했어요.`, "family");
          break;
        }
        case "member": {
          const i = s.members.findIndex((m) => m.id === id);
          if (i < 0)
            s.members.push({
              id,
              name: get("name").trim(),
              status: "pending",
              daily: true,
              chat: true,
              location: false,
            });
          else s.members[i].name = get("name").trim();
          audit(s, "가상 보호자를 저장했어요.", "family");
          break;
        }
      }
    });
  }
  function eventRows(items: TestEvent[], compact = false) {
    return items.length ? (
      <div className="test-event-list">
        {items.map((e) => (
          <article className="test-event-row" key={e.id}>
            <div className="test-event-time">
              <strong>{e.start}</strong>
              <small>{e.end}</small>
            </div>
            <div className="test-event-description">
              <span
                className={
                  "test-child-tag " +
                  (state.children.find((c) => c.id === e.childId)?.color ||
                    "blue")
                }
              >
                {nickname(e.childId)}
              </span>
              <h3>{e.title}</h3>
              <p>{e.place || "장소 미등록"}</p>
              {e.arrived && (
                <small>
                  도착 {stamp(e.arrived)}
                  {e.departed && ` · 출발 ${stamp(e.departed)}`}
                </small>
              )}
            </div>
            <div className="test-row-actions">
              {compact ? (
                <Link className="button compact" to="/test/daily">
                  기록하기
                </Link>
              ) : (
                <>
                  <span
                    className={
                      "badge " +
                      (e.departed ? "soft" : e.arrived ? "green" : "soft")
                    }
                  >
                    {e.departed
                      ? "출발 완료"
                      : e.arrived
                        ? "도착 완료"
                        : "일정 대기"}
                  </span>
                  <button
                    className="button compact"
                    disabled={!!e.arrived}
                    onClick={() =>
                      update(
                        (s) => attendance(s, e.id, "arrive"),
                        "도착을 기록했어요.",
                      )
                    }
                  >
                    도착
                  </button>
                  <button
                    className="button compact"
                    disabled={!e.arrived || !!e.departed}
                    onClick={() =>
                      update(
                        (s) => attendance(s, e.id, "depart"),
                        "출발을 기록했어요.",
                      )
                    }
                  >
                    출발
                  </button>
                  <button
                    className="test-text-button"
                    onClick={() => update((s) => attendance(s, e.id, "reset"))}
                  >
                    기록 취소
                  </button>
                  <button
                    className="test-text-button"
                    onClick={() => open("event", e.id)}
                  >
                    일정 수정
                  </button>
                  <button
                    className="test-text-button danger-text"
                    onClick={() => erase("events", e.id, e.title)}
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    ) : (
      <Empty title="이날의 일정이 없어요.">
        일정을 추가하거나 반복 일정을 적용해 보세요.
      </Empty>
    );
  }
  if (!meta) return <Navigate to="/test/today" replace />;
  return (
    <div className="test-workspace">
      <a className="skip-link" href="#test-main">
        본문 바로가기
      </a>
      <WorkspaceNavigation testMode />
      <header className="topbar">
        <WorkspaceBrand testMode />
        <div className="workspace-header-context">
          <span className="header-divider" />
          <span>통합 기능 테스트</span>
        </div>
        <div className="top-actions">
          <Link className="test-return-link" to="/today">
            운영 서비스로
          </Link>
          <DisplaySettings />
          <button
            className="font-toggle" aria-label="큰 글씨"
            aria-pressed={large}
            onClick={() => setLarge((v) => !v)}
          >
            <Icon name="type" />
            <span>큰 글씨</span>
          </button>
        </div>
      </header>
      <div className="test-environment-banner">
        <span className="test-environment-label">
          <span />
          TEST MODE
        </span>
        <p>
          <strong>이메일 인증 없이 모든 테스트 메뉴를 이용해요.</strong>{" "}
          데이터는 이 브라우저에만 저장돼요. 실제 개인정보는 입력하지 마세요.
        </p>
        <Link to="/test/account">
          테스트 안내
          <Icon name="arrow" />
        </Link>
      </div>
      <main className="main test-main" id="test-main" tabIndex={-1}>
        <div className="workspace-page-heading">
          <div>
            <span className="workspace-module">
              FAMILY LAB · {page.toUpperCase()}
            </span>
            <h1>{meta.title}</h1>
            <p>{meta.description}</p>
          </div>
          <Link
            className="button"
            to={page === "child" ? "/test/today" : "/test/child"}
          >
            <Icon name={page === "child" ? "home" : "sun"} />
            {page === "child" ? "보호자 화면" : "아이 화면"}
          </Link>
        </div>
        <div className="test-context-bar">
          <div className="test-child-filters" aria-label="테스트 아이 선택">
            <button
              aria-pressed={child === "all"}
              onClick={() => setChild("all")}
            >
              모든 아이
            </button>
            {state.children.map((c) => (
              <button
                key={c.id}
                aria-pressed={child === c.id}
                onClick={() => setChild(c.id)}
              >
                <span className={"test-avatar " + c.color}>
                  {c.nickname.slice(0, 1)}
                </span>
                {c.nickname}
              </button>
            ))}
            <button onClick={() => open("child")} aria-label="테스트 아이 추가">
              <Icon name="plus" />
            </button>
          </div>
          <label className="test-date-control">
            기준일
            <input
              aria-label="테스트 기준일"
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            <button
              className="test-text-button"
              onClick={() => setDate(koreaDate())}
            >
              오늘
            </button>
          </label>
        </div>
        {error && (
          <div className="test-feedback error" role="alert">
            <Icon name="shield" />
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="오류 닫기"
              onClick={() => setError("")}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        {notice && (
          <div className="test-feedback" role="status">
            <Icon name="check" />
            <span>{notice}</span>
            <button
              className="icon-button"
              aria-label="알림 닫기"
              onClick={() => setNotice("")}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        <Entrance key={page} className="test-page-content">
          {page === "today" && (
            <>
              <section
                className="workspace-metrics"
                aria-label="테스트 가족 현황"
              >
                {[
                  {
                    to: "daily",
                    label: "오늘의 일정",
                    value: `${events.length}개`,
                    note: `도착 기록 ${events.filter((e) => !!e.arrived).length}개`,
                    icon: "bag" as const,
                  },
                  {
                    to: "family",
                    label: "함께하는 아이",
                    value: `${state.children.length}명`,
                    note: `보호자 ${state.members.filter((m) => m.status === "active").length + 1}명`,
                    icon: "shield" as const,
                  },
                  {
                    to: "chat",
                    label: "가족 대화",
                    value: `${state.messages.length}개`,
                    note: "글과 그림으로 이어지는 소식",
                    icon: "chat" as const,
                  },
                  {
                    to: "fees",
                    label: "납부 예정 학원비",
                    value: money(
                      state.fees
                        .filter(
                          (f) =>
                            !f.paid && (child === "all" || f.childId === child),
                        )
                        .reduce((a, f) => a + f.amount, 0),
                    ),
                    note: `새 알림 ${unread}개`,
                    icon: "wallet" as const,
                  },
                ].map((m) => (
                  <Link
                    to={"/test/" + m.to}
                    className="workspace-metric"
                    key={m.to}
                  >
                    <div className="metric-top">
                      <span>{m.label}</span>
                      <Icon name={m.icon} />
                    </div>
                    <strong>{m.value}</strong>
                    <p>{m.note}</p>
                    <div className="metric-foot">
                      <span>TEST DATA</span>
                      <Icon name="arrow" />
                    </div>
                  </Link>
                ))}
              </section>
              <div className="test-two-columns">
                <Card
                  title="기준일의 등하원"
                  icon="bag"
                  action={
                    <button
                      className="button compact"
                      onClick={() => open("event")}
                    >
                      <Icon name="plus" />
                      일정 추가
                    </button>
                  }
                >
                  {eventRows(events.slice(0, 5), true)}
                  <Link className="test-card-link" to="/test/daily">
                    전체 등하원 확인
                    <Icon name="arrow" />
                  </Link>
                </Card>
                <Card title="이어서 테스트해 보세요" icon="check">
                  <ol className="test-checklist">
                    {[
                      {
                        to: "calendar",
                        label: "달력에 일정 등록",
                        done: state.events.some(
                          (e) => !e.id.startsWith("test-"),
                        ),
                      },
                      {
                        to: "daily",
                        label: "도착·출발 기록",
                        done: state.events.some((e) => !!e.arrived),
                      },
                      {
                        to: "chat",
                        label: "그림과 글 메시지 보내기",
                        done: state.messages.length > 1,
                      },
                      {
                        to: "devices",
                        label: "아이 기기 연결",
                        done: state.devices.length > 0,
                      },
                      {
                        to: "fees",
                        label: "학원비 납부 표시",
                        done: state.fees.some((f) => f.paid),
                      },
                    ].map((step, i) => (
                      <li key={step.to}>
                        <span className={step.done ? "done" : ""}>
                          {step.done ? <Icon name="check" /> : i + 1}
                        </span>
                        <Link to={"/test/" + step.to}>
                          {step.label}
                          <Icon name="arrow" />
                        </Link>
                      </li>
                    ))}
                  </ol>
                  <div className="test-info-note">
                    <Icon name="shield" />
                    <p>
                      저장과 새로고침, 메뉴 간 연결을 자유롭게 확인해요. 실제
                      발송·위치 수집·결제는 실행되지 않아요.
                    </p>
                  </div>
                </Card>
              </div>
            </>
          )}
          {page === "calendar" && (
            <div className="test-two-columns test-calendar-layout">
              <Card
                title={
                  date.slice(0, 4) + "년 " + Number(date.slice(5, 7)) + "월"
                }
                icon="calendar"
                action={
                  <div className="test-month-actions">
                    <button
                      className="icon-button"
                      aria-label="이전 달"
                      onClick={() => {
                        const d = new Date(date + "T12:00:00Z");
                        d.setUTCDate(1);
                        d.setUTCMonth(d.getUTCMonth() - 1);
                        setDate(d.toISOString().slice(0, 10));
                      }}
                    >
                      <Icon name="chevron" className="flip" />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="다음 달"
                      onClick={() => {
                        const d = new Date(date + "T12:00:00Z");
                        d.setUTCDate(1);
                        d.setUTCMonth(d.getUTCMonth() + 1);
                        setDate(d.toISOString().slice(0, 10));
                      }}
                    >
                      <Icon name="chevron" />
                    </button>
                  </div>
                }
              >
                <MonthGrid
                  date={date}
                  events={state.events.filter(
                    (e) => child === "all" || e.childId === child,
                  )}
                  select={setDate}
                />
                <p className="test-caption">
                  공휴일 API 연결 대신 일정 조작 흐름을 확인하는 테스트
                  달력이에요.
                </p>
              </Card>
              <Card
                title={
                  Number(date.slice(5, 7)) +
                  "월 " +
                  Number(date.slice(8)) +
                  "일 일정"
                }
                icon="bag"
                action={
                  <button
                    className="button compact"
                    onClick={() => open("event")}
                  >
                    <Icon name="plus" />
                    일정 추가
                  </button>
                }
              >
                {events.length ? (
                  <div className="test-simple-list">
                    {events.map((e) => (
                      <article key={e.id}>
                        <span className="test-list-icon">
                          <Icon name="calendar" />
                        </span>
                        <div>
                          <small>
                            {nickname(e.childId)} · {e.start}–{e.end}
                          </small>
                          <h3>{e.title}</h3>
                          <p>{e.place}</p>
                        </div>
                        <div className="test-list-actions">
                          <button
                            className="test-text-button"
                            onClick={() => open("event", e.id)}
                          >
                            수정
                          </button>
                          <button
                            className="test-text-button danger-text"
                            onClick={() => erase("events", e.id, e.title)}
                          >
                            삭제
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <Empty title="등록된 일정이 없어요." />
                )}
              </Card>
            </div>
          )}
          {page === "daily" && (
            <Card
              title="일정별 도착·출발"
              icon="bag"
              action={
                <button
                  className="button compact"
                  onClick={() => open("event")}
                >
                  <Icon name="plus" />
                  일정 추가
                </button>
              }
            >
              {eventRows(events)}
            </Card>
          )}
          {page === "repeats" && (
            <Card
              title="요일별 반복 계획"
              icon="repeat"
              action={
                <button
                  className="button compact"
                  onClick={() => open("repeat")}
                >
                  <Icon name="plus" />
                  반복 일정 추가
                </button>
              }
            >
              {state.repeats.filter(
                (r) => child === "all" || r.childId === child,
              ).length ? (
                <div className="test-grid-cards">
                  {state.repeats
                    .filter((r) => child === "all" || r.childId === child)
                    .map((r) => (
                      <article className="test-mini-card" key={r.id}>
                        <span className="badge soft">
                          {nickname(r.childId)}
                        </span>
                        <h3>{r.title}</h3>
                        <p>
                          {r.start}–{r.end} · {r.place || "장소 미등록"}
                        </p>
                        <div className="test-repeat-days">
                          {weekdays.map((d, i) => (
                            <span
                              key={d}
                              className={r.days.includes(i) ? "active" : ""}
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                        <button
                          className="button primary full"
                          onClick={() => {
                            let count = 0;
                            const ok = update((s) => {
                              count = generateWeek(s, r.id, date);
                            });
                            if (ok)
                              setNotice(
                                `${date}부터 7일 동안 ${count}개 일정을 추가했어요. 이미 생성한 일정은 중복되지 않아요.`,
                              );
                          }}
                        >
                          앞으로 7일 일정 생성
                        </button>
                        <div className="test-mini-actions">
                          <button
                            className="test-text-button"
                            onClick={() => open("repeat", r.id)}
                          >
                            수정
                          </button>
                          <button
                            className="test-text-button danger-text"
                            onClick={() => erase("repeats", r.id, r.title)}
                          >
                            삭제
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              ) : (
                <Empty title="반복 계획이 없어요." />
              )}
            </Card>
          )}
          {page === "chat" && (
            <TestChat
              state={state}
              childId={childId}
              nickname={nickname(childId)}
              update={update}
              erase={erase}
            />
          )}
          {page === "family" && (
            <>
              <div className="test-two-columns">
                <Card title="우리 가족" icon="home">
                  <form
                    className="test-inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = String(
                        new FormData(e.currentTarget).get("familyName") || "",
                      ).trim();
                      update((s) => {
                        s.familyName = name;
                        audit(s, "테스트 가족 이름을 수정했어요.", "family");
                      });
                    }}
                  >
                    <label htmlFor="test-family-name">가족 이름</label>
                    <input
                      key={state.familyName}
                      id="test-family-name"
                      name="familyName"
                      defaultValue={state.familyName}
                      maxLength={40}
                      required
                    />
                    <button className="button" type="submit">
                      이름 저장
                    </button>
                  </form>
                  <div className="test-info-note">
                    <Icon name="shield" />
                    <p>
                      테스트 모드는 이메일·보호자 인증을 요구하지 않아요. 아래
                      상태 변경은 심사 화면 테스트를 위한 시뮬레이션이에요.
                    </p>
                  </div>
                  <div className="test-review-row">
                    <span>보호자 확인</span>
                    <strong>
                      {
                        {
                          "not-started": "미신청",
                          pending: "심사 중",
                          approved: "승인",
                          rejected: "반려",
                        }[state.guardianReview]
                      }
                    </strong>
                    <select
                      aria-label="보호자 확인 테스트 상태"
                      value={state.guardianReview}
                      onChange={(e) =>
                        update((s) => {
                          s.guardianReview = e.target
                            .value as TestState["guardianReview"];
                          audit(
                            s,
                            "보호자 확인 테스트 상태를 변경했어요.",
                            "family",
                          );
                        })
                      }
                    >
                      <option value="not-started">미신청</option>
                      <option value="pending">심사 중</option>
                      <option value="approved">승인</option>
                      <option value="rejected">반려</option>
                    </select>
                  </div>
                </Card>
                <Card
                  title="가상 아이"
                  icon="sun"
                  action={
                    <button
                      className="button compact"
                      onClick={() => open("child")}
                    >
                      <Icon name="plus" />
                      아이 추가
                    </button>
                  }
                >
                  {state.children.length ? (
                    <div className="test-simple-list">
                      {state.children.map((c) => (
                        <article key={c.id}>
                          <span className={"test-avatar " + c.color}>
                            {c.nickname.slice(0, 1)}
                          </span>
                          <div>
                            <h3>{c.nickname}</h3>
                            <small>예시 생년월일 {c.birthDate}</small>
                          </div>
                          <div className="test-list-actions">
                            <button
                              className="test-text-button"
                              onClick={() => open("child", c.id)}
                            >
                              수정
                            </button>
                            <button
                              className="test-text-button danger-text"
                              onClick={() =>
                                ask(
                                  "테스트 아이 삭제",
                                  "이 아이의 테스트 일정·대화·학원비·기기 연결도 함께 삭제돼요.",
                                  () => update((s) => removeChild(s, c.id)),
                                )
                              }
                            >
                              삭제
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty title="가상 아이를 추가해 주세요." />
                  )}
                </Card>
              </div>
              <Card
                title="함께하는 보호자 · 공유 범위"
                icon="shield"
                action={
                  <button
                    className="button compact"
                    onClick={() => open("member")}
                  >
                    <Icon name="plus" />
                    보호자 초대 테스트
                  </button>
                }
              >
                <div className="test-grid-cards">
                  {state.members.map((m) => (
                    <article className="test-mini-card" key={m.id}>
                      <div className="test-split">
                        <h3>{m.name}</h3>
                        <span
                          className={
                            "badge " +
                            (m.status === "active" ? "green" : "soft")
                          }
                        >
                          {m.status === "active" ? "참여 중" : "승인 대기"}
                        </span>
                      </div>
                      <div className="test-permissions">
                        {(["daily", "chat", "location"] as const).map((k) => (
                          <label key={k}>
                            <input
                              type="checkbox"
                              checked={m[k]}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                update((s) => {
                                  const member = s.members.find(
                                    (x) => x.id === m.id,
                                  );
                                  if (member) {
                                    member[k] = checked;
                                    audit(
                                      s,
                                      `${member.name}의 공유 범위를 저장했어요.`,
                                      "family",
                                    );
                                  }
                                });
                              }}
                            />
                            {k === "daily"
                              ? "일정·등하원"
                              : k === "chat"
                                ? "가족 대화"
                                : "위치 공유"}
                          </label>
                        ))}
                      </div>
                      <div className="test-mini-actions">
                        {m.status === "pending" && (
                          <button
                            className="button primary"
                            onClick={() =>
                              update((s) => {
                                s.members.find((x) => x.id === m.id)!.status =
                                  "active";
                                audit(
                                  s,
                                  "가상 보호자의 참여를 승인했어요.",
                                  "family",
                                );
                              })
                            }
                          >
                            참여 승인
                          </button>
                        )}
                        <button
                          className="test-text-button danger-text"
                          onClick={() =>
                            ask(
                              "보호자 참여 해제",
                              "테스트 보호자의 참여와 공유 설정을 해제해요.",
                              () =>
                                update((s) => {
                                  s.members = s.members.filter(
                                    (x) => x.id !== m.id,
                                  );
                                  audit(
                                    s,
                                    "테스트 보호자의 참여를 해제했어요.",
                                    "family",
                                  );
                                }),
                            )
                          }
                        >
                          참여 해제
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {!state.members.length && (
                  <Empty title="함께할 가상 보호자를 추가해 주세요." />
                )}
              </Card>
            </>
          )}
          {page === "devices" && (
            <TestDevices
              state={state}
              childId={childId}
              nickname={nickname}
              update={update}
              erase={erase}
            />
          )}
          {page === "location" && (
            <TestLocation
              state={state}
              childId={childId}
              nickname={nickname(childId)}
              update={update}
            />
          )}
          {page === "fees" && (
            <>
              <section className="test-financial-summary">
                {[
                  {
                    label: "등록한 학원비",
                    value: state.fees
                      .filter((f) => child === "all" || f.childId === child)
                      .reduce((a, f) => a + f.amount, 0),
                  },
                  {
                    label: "납부 표시 완료",
                    value: state.fees
                      .filter(
                        (f) =>
                          f.paid && (child === "all" || f.childId === child),
                      )
                      .reduce((a, f) => a + f.amount, 0),
                  },
                  {
                    label: "남은 예정 금액",
                    value: state.fees
                      .filter(
                        (f) =>
                          !f.paid && (child === "all" || f.childId === child),
                      )
                      .reduce((a, f) => a + f.amount, 0),
                  },
                ].map((x) => (
                  <div key={x.label}>
                    <span>{x.label}</span>
                    <strong>{money(x.value)}</strong>
                  </div>
                ))}
              </section>
              <Card
                title="학원비 장부"
                icon="wallet"
                action={
                  <button
                    className="button compact"
                    onClick={() => open("fee")}
                  >
                    <Icon name="plus" />
                    학원비 추가
                  </button>
                }
              >
                {state.fees.filter(
                  (f) => child === "all" || f.childId === child,
                ).length ? (
                  <div className="test-simple-list">
                    {state.fees
                      .filter((f) => child === "all" || f.childId === child)
                      .map((f) => (
                        <article key={f.id}>
                          <span className="test-list-icon">
                            <Icon name="wallet" />
                          </span>
                          <div>
                            <small>
                              {nickname(f.childId)} · 예정일 {f.due}
                            </small>
                            <h3>{f.title}</h3>
                            <strong>{money(f.amount)}</strong>
                          </div>
                          <div className="test-list-actions">
                            <button
                              className={
                                "button compact " + (f.paid ? "" : "primary")
                              }
                              onClick={() =>
                                update((s) => {
                                  const item = s.fees.find(
                                    (x) => x.id === f.id,
                                  )!;
                                  item.paid = !item.paid;
                                  audit(
                                    s,
                                    `${item.title} ${item.paid ? "납부 표시" : "납부 표시 취소"}`,
                                    "fee",
                                  );
                                })
                              }
                            >
                              {f.paid ? "납부 표시 취소" : "납부 표시"}
                            </button>
                            <button
                              className="test-text-button"
                              onClick={() => open("fee", f.id)}
                            >
                              수정
                            </button>
                            <button
                              className="test-text-button danger-text"
                              onClick={() => erase("fees", f.id, f.title)}
                            >
                              삭제
                            </button>
                          </div>
                        </article>
                      ))}
                  </div>
                ) : (
                  <Empty title="등록된 학원비가 없어요." />
                )}
                <p className="test-caption">
                  실제 결제·송금·청구 없이 장부 기록만 테스트해요.
                </p>
              </Card>
            </>
          )}
          {page === "records" && <TestRecords state={state} />}
          {page === "notifications" && (
            <Card
              title={`새 소식 ${unread}개`}
              icon="bell"
              action={
                <button
                  className="button compact"
                  onClick={() =>
                    update((s) => {
                      s.notices.forEach((n) => {
                        n.read = true;
                      });
                    }, "모든 테스트 알림을 읽음으로 표시했어요.")
                  }
                >
                  모두 읽음
                </button>
              }
            >
              {state.notices.length ? (
                <div className="test-notice-list">
                  {state.notices.map((n) => (
                    <article key={n.id} className={n.read ? "read" : ""}>
                      <span className="test-notice-dot" />
                      <div>
                        <h3>{n.title}</h3>
                        <time>{stamp(n.at)}</time>
                      </div>
                      <button
                        className="test-text-button"
                        onClick={() =>
                          update((s) => {
                            s.notices.find((x) => x.id === n.id)!.read =
                              !n.read;
                          }, "알림 상태를 변경했어요.")
                        }
                      >
                        {n.read ? "안 읽음" : "읽음"}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty title="새 소식이 없어요." />
              )}
            </Card>
          )}
          {page === "account" && (
            <div className="test-two-columns">
              <Card title="테스트 프로필" icon="settings">
                <form
                  className="test-edit-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = String(
                      new FormData(e.currentTarget).get("profileName") || "",
                    ).trim();
                    update((s) => {
                      s.profileName = name;
                      audit(s, "테스트 보호자 이름을 저장했어요.", "account");
                    });
                  }}
                >
                  <Field
                    key={state.profileName}
                    label="테스트 보호자 이름"
                    name="profileName"
                    value={state.profileName}
                    maxLength={30}
                  />
                  <button className="button primary">프로필 저장</button>
                </form>
                <div className="test-account-status">
                  <span>이메일 인증</span>
                  <strong>테스트에서 생략</strong>
                  <span>보호자 확인</span>
                  <strong>테스트에서 생략</strong>
                  <span>저장 위치</span>
                  <strong>현재 브라우저</strong>
                </div>
              </Card>
              <Card title="데이터와 테스트 범위" icon="shield">
                <p className="section-description">
                  테스트 작업실은 실제 가족 계정과 연결되지 않아요. 다른
                  기기·브라우저와는 공유하지 않으며, 브라우저 데이터를 지우면
                  테스트 기록도 사라질 수 있어요.
                </p>
                <ul className="test-scope-list">
                  <li>
                    <Icon name="check" />
                    일정·등하원·반복 계획·글과 그림 대화
                  </li>
                  <li>
                    <Icon name="check" />
                    아이·보호자·기기·학원비·알림·기록
                  </li>
                  <li>
                    <Icon name="shield" />
                    위치·기기 연결·보호자 심사는 시뮬레이션
                  </li>
                  <li>
                    <Icon name="shield" />
                    실제 OAuth·이메일/SMS·푸시·결제는 별도 연동 테스트
                  </li>
                </ul>
                <button
                  className="button full danger-text"
                  onClick={() =>
                    ask(
                      "테스트 데이터 초기화",
                      "이 브라우저의 테스트 내용을 지우고 처음의 예시 데이터로 되돌려요. 실제 계정과 가족 정보에는 영향이 없어요.",
                      () =>
                        update(
                          (s) => Object.assign(s, seedTestState()),
                          "예시 데이터로 초기화했어요.",
                        ),
                    )
                  }
                >
                  테스트 데이터 초기화
                </button>
                <Link className="button full" to="/today">
                  운영 서비스로 돌아가기
                  <Icon name="arrow" />
                </Link>
              </Card>
            </div>
          )}
          {page === "child" && (
            <>
              <section className="test-child-welcome">
                <span className="badge soft">아이 역할 · 테스트</span>
                <h2>{nickname(childId)}, 오늘도 좋은 하루!</h2>
                <p>도착을 알리거나 가족에게 그림으로 마음을 전해 보세요.</p>
                <div className="test-child-actions">
                  <Link to="/test/daily">
                    <Icon name="arrival" />
                    <strong>도착했어요</strong>
                    <span>오늘 일정의 도착·출발 기록</span>
                  </Link>
                  <Link to="/test/chat">
                    <Icon name="chat" />
                    <strong>가족에게 말하기</strong>
                    <span>그림과 글로 보내는 마음</span>
                  </Link>
                  <Link to="/test/calendar">
                    <Icon name="calendar" />
                    <strong>내 일정 보기</strong>
                    <span>오늘부터 함께 챙기는 계획</span>
                  </Link>
                  <Link to="/test/location">
                    <Icon name="pin" />
                    <strong>내 위치 알리기</strong>
                    <span>가상 위치 전송 테스트</span>
                  </Link>
                </div>
              </section>
              <Card title="기준일의 일정" icon="bag">
                {eventRows(
                  events.filter((e) => e.childId === childId),
                  true,
                )}
              </Card>
            </>
          )}
        </Entrance>
        <footer className="page-footer test-footer">
          아이하루 · 통합 기능 테스트
          <span>예시 데이터 · 외부 전송 및 실제 결제 없음</span>
        </footer>
      </main>
      {editor && (
        <EditDialog
          key={editor.kind + editor.id}
          editor={editor}
          state={state}
          childId={childId}
          date={date}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      )}
      {confirm && (
        <Dialog title={confirm.title} onClose={() => setConfirm(null)}>
          <p className="test-confirm-description">{confirm.detail}</p>
          <footer className="test-dialog-actions">
            <button className="button" onClick={() => setConfirm(null)}>
              취소
            </button>
            <button
              className="button primary"
              onClick={() => {
                confirm.run();
                setConfirm(null);
              }}
            >
              확인
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
function MonthGrid({
  date,
  events,
  select,
}: {
  date: string;
  events: TestEvent[];
  select: (d: string) => void;
}) {
  const first = date.slice(0, 7) + "-01",
    offset = new Date(first + "T12:00:00Z").getUTCDay(),
    days = new Date(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)),
      0,
    ).getDate();
  return (
    <div className="test-month-grid">
      <div className="test-month-weekdays">
        {weekdays.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="test-month-days">
        {Array.from({ length: offset }, (_, i) => (
          <span key={"pad" + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = first.slice(0, 8) + String(i + 1).padStart(2, "0"),
            items = events.filter((e) => e.date === day);
          return (
            <button
              key={day}
              aria-label={`${Number(date.slice(5, 7))}월 ${i + 1}일, 테스트 일정 ${items.length}개`}
              aria-pressed={day === date}
              className={day === koreaDate() ? "today" : ""}
              onClick={() => select(day)}
            >
              <strong>{i + 1}</strong>
              <span>
                {items.slice(0, 2).map((e) => (
                  <i key={e.id}>{e.title}</i>
                ))}
                {items.length > 2 && <small>+{items.length - 2}</small>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
function TestChat({
  state,
  childId,
  nickname,
  update,
  erase,
}: {
  state: TestState;
  childId: string;
  nickname: string;
  update: (fn: (s: TestState) => void, message?: string) => boolean;
  erase: (kind: "messages", id: string, label: string) => void;
}) {
  const [actor, setActor] = useState<"guardian" | "child">("guardian"),
    [text, setText] = useState(""),
    [sticker, setSticker] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pane = bottom.current?.parentElement;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [state.messages.length, childId]);
  return (
    <div className="test-chat-layout">
      <Card title={`${nickname} 가족방 · 테스트`} icon="chat">
        <div className="test-message-list" aria-label="테스트 대화 내용">
          {state.messages
            .filter((m) => m.childId === childId)
            .map((m) => (
              <article
                key={m.id}
                className={"test-message " + (m.actor === actor ? "mine" : "")}
              >
                <small>
                  {m.actor === "guardian"
                    ? state.profileName
                    : nickname + " · 아이 역할"}
                </small>
                <div className="test-message-bubble">
                  {m.sticker && (
                    <img
                      src={`/stickers/v1/${m.sticker}.svg`}
                      alt={stickerNames[m.sticker]}
                      width="60"
                      height="60"
                    />
                  )}
                  {m.text && <p>{m.text}</p>}
                </div>
                <div className="test-message-meta">
                  <time>{stamp(m.at)}</time>
                  <button
                    onClick={() => erase("messages", m.id, "메시지")}
                    aria-label={
                      "메시지 삭제: " + (m.text || stickerNames[m.sticker])
                    }
                  >
                    삭제
                  </button>
                </div>
              </article>
            ))}
          {!state.messages.some((m) => m.childId === childId) && (
            <Empty title="첫 메시지를 보내 보세요." />
          )}
          <div ref={bottom} />
        </div>
      </Card>
      <Card title="마음을 전해요" icon="chat">
        <fieldset className="test-role-toggle">
          <legend>보내는 역할</legend>
          <button
            aria-pressed={actor === "guardian"}
            onClick={() => setActor("guardian")}
          >
            보호자
          </button>
          <button
            aria-pressed={actor === "child"}
            onClick={() => setActor("child")}
          >
            아이
          </button>
        </fieldset>
        <div className="test-sticker-picker" aria-label="테스트 그림 선택">
          {stickers.map((id) => (
            <button
              key={id}
              aria-pressed={sticker === id}
              onClick={() => setSticker(sticker === id ? "" : id)}
            >
              <img
                src={`/stickers/v1/${id}.svg`}
                alt=""
                width="40"
                height="40"
              />
              <span>{stickerNames[id]}</span>
            </button>
          ))}
        </div>
        <form
          className="test-edit-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (
              update(
                (s) => sendMessage(s, childId, actor, text, sticker),
                "메시지를 보냈어요.",
              )
            ) {
              setText("");
              setSticker("");
            }
          }}
        >
          <label htmlFor="test-message">하고 싶은 말</label>
          <textarea
            id="test-message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="가족에게 짧은 소식을 남겨요."
          />
          <small className="test-caption">
            {text.length}/500자 ·{" "}
            {sticker
              ? stickerNames[sticker] + " 그림 선택"
              : "그림을 함께 보낼 수 있어요."}
          </small>
          <button
            className="button primary full"
            disabled={!childId || (!text.trim() && !sticker)}
          >
            메시지 보내기
            <Icon name="arrow" />
          </button>
        </form>
        <p className="test-caption">
          역할을 바꿔 같은 브라우저에서 답장을 테스트해요. 실제 가족이나 외부
          메신저로 전송하지 않아요.
        </p>
      </Card>
    </div>
  );
}
function TestDevices({
  state,
  childId,
  nickname,
  update,
  erase,
}: {
  state: TestState;
  childId: string;
  nickname: (id: string) => string;
  update: (fn: (s: TestState) => void, message?: string) => boolean;
  erase: (kind: "devices", id: string, label: string) => void;
}) {
  const [code, setCode] = useState(""),
    [label, setLabel] = useState("아이 테스트 기기"),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(
    0,
    Math.ceil(((state.pairing?.expiresAt || 0) - now) / 1000),
  );
  return (
    <>
      <div className="test-two-columns">
        <Card title="1. 아이 기기에서 번호 받기" icon="device">
          <label htmlFor="test-device-label">테스트 기기 이름</label>
          <input
            id="test-device-label"
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button
            className="button primary full"
            onClick={() =>
              update(
                (s) => issuePairing(s, label),
                "테스트 연결 번호를 발급했어요.",
              )
            }
          >
            연결 번호 발급
          </button>
          {state.pairing && (
            <div className="test-pair-code">
              <span>테스트 연결 번호</span>
              <strong>{state.pairing.code}</strong>
              <small>
                {seconds
                  ? `${seconds}초 동안 유효해요.`
                  : "만료됐어요. 새 번호를 발급해 주세요."}
              </small>
            </div>
          )}
        </Card>
        <Card title="2. 보호자가 연결 확인" icon="shield">
          <form
            className="test-edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                update(
                  (s) => connectDevice(s, childId, code),
                  "기기 연결을 승인했어요.",
                )
              )
                setCode("");
            }}
          >
            <p className="section-description">
              선택한 <strong>{nickname(childId)}</strong>의 가상 기기로
              연결해요.
            </p>
            <label htmlFor="test-pair-input">발급한 6자리 번호</label>
            <input
              id="test-pair-input"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]{6}"
              value={code}
              maxLength={6}
              required
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button
              className="button primary full"
              disabled={!childId || code.length !== 6}
            >
              기기 연결 승인
            </button>
          </form>
          <p className="test-caption">
            실제 아이 기기를 인증하는 번호가 아니에요. 실제 기기 연결은 운영
            서비스에서 진행해 주세요.
          </p>
        </Card>
      </div>
      <Card title="연결된 테스트 기기" icon="device">
        {state.devices.length ? (
          <div className="test-simple-list">
            {state.devices.map((d) => (
              <article key={d.id}>
                <span className="test-list-icon">
                  <Icon name="device" />
                </span>
                <div>
                  <h3>{d.label}</h3>
                  <small>
                    {nickname(d.childId)} · {stamp(d.at)}
                  </small>
                </div>
                <button
                  className="button compact"
                  onClick={() => erase("devices", d.id, d.label)}
                >
                  연결 해제
                </button>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="아직 연결된 기기가 없어요." />
        )}
      </Card>
    </>
  );
}
function TestLocation({
  state,
  childId,
  nickname,
  update,
}: {
  state: TestState;
  childId: string;
  nickname: string;
  update: (fn: (s: TestState) => void, message?: string) => boolean;
}) {
  const [point, setPoint] = useState<"home" | "school" | "academy">("school"),
    current = state.positions.find((p) => p.childId === childId),
    points = {
      home: { label: "집", x: 20, y: 70 },
      school: { label: "학교", x: 52, y: 28 },
      academy: { label: "학원", x: 80, y: 62 },
    };
  function send() {
    update((s) => {
      if (!childId) throw new Error("테스트 아이를 먼저 등록해 주세요.");
      s.positions = s.positions.filter((p) => p.childId !== childId);
      s.positions.push({
        childId,
        point,
        at: new Date().toISOString(),
        sharing: true,
      });
      audit(s, `${nickname}의 가상 위치를 보냈어요.`, "location");
    }, "가상 위치를 보냈어요.");
  }
  return (
    <div className="test-two-columns">
      <Card title="위치 전송 시뮬레이션" icon="pin">
        <KakaoMap point={current?.sharing?current.point:point}/>
        <div className="test-location-status">
          <Icon name="pin" />
          <div>
            <strong>
              {current?.sharing
                ? `${nickname} · ${points[current.point].label}`
                : "공유한 위치가 없어요"}
            </strong>
            <p>
              {current?.sharing
                ? "마지막 전송 " + stamp(current.at)
                : "아이 역할에서 가상 위치를 보내 보세요."}
            </p>
          </div>
        </div>
      </Card>
      <Card title="아이 역할로 위치 보내기" icon="device">
        <label htmlFor="test-location-point">보낼 가상 위치</label>
        <select
          id="test-location-point"
          value={point}
          onChange={(e) => setPoint(e.target.value as typeof point)}
        >
          {Object.entries(points).map(([k, p]) => (
            <option key={k} value={k}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          className="button primary full"
          disabled={!childId}
          onClick={send}
        >
          가상 위치 보내기
        </button>
        <button
          className="button full"
          disabled={!current?.sharing}
          onClick={() =>
            update((s) => {
              s.positions = s.positions.filter((p) => p.childId !== childId);
              audit(s, "가상 위치 공유를 중지했어요.", "location");
            }, "가상 위치 공유를 중지했어요.")
          }
        >
          가상 위치 공유 중지
        </button>
        <div className="test-info-note">
          <Icon name="shield" />
          <p>
            위치 권한을 요청하거나 실제 좌표를 수집하지 않아요. 운영 위치 기능의
            카카오 지도에 예시 좌표를 표시해요. 실제 GPS 수집·가족 간 위치 전송은 별도 개발 대상이에요.
          </p>
        </div>
      </Card>
    </div>
  );
}
function TestRecords({ state }: { state: TestState }) {
  const [kind, setKind] = useState("all"),
    [query, setQuery] = useState(""),
    [day, setDay] = useState("");
  const logs = state.logs.filter(
    (l) =>
      (kind === "all" || kind === l.kind) &&
      l.text.includes(query) &&
      (!day || koreaDate(new Date(l.at)) === day),
  );
  return (
    <Card title={`활동 기록 ${logs.length}개`} icon="book">
      <div className="test-record-filters">
        <input
          type="date"
          aria-label="기록 날짜"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
        <select
          aria-label="기록 유형"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">모든 기록</option>
          {Object.entries(kindNames).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          aria-label="기록 검색"
          placeholder="기록 내용 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {logs.length ? (
        <div className="test-log-list">
          {logs.map((l) => (
            <article key={l.id}>
              <time>{stamp(l.at)}</time>
              <span className="badge soft">{kindNames[l.kind]}</span>
              <p>{l.text}</p>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="조건에 맞는 기록이 없어요." />
      )}
    </Card>
  );
}

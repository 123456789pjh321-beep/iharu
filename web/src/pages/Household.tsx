import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useApi } from "../api";
import { sessionSchema } from "../auth";
import {
  householdStatusSchema,
  type HouseholdStatus,
} from "../../../shared/household";
import { membersSchema } from "../../../shared/family";
import { AuthLayout, FormNotice } from "../components/AuthLayout";
import { ErrorState, Loading } from "../components/Common";
import { Icon } from "../components/Icon";
import { familyRequest } from "../family";
import { ChildManagement } from "./Family";
export function StartGuide({ compact = false, target="/start" }: { compact?: boolean; target?:string }) {
  return (
    <section
      className={"start-guide " + (compact ? "compact" : "")}
      aria-label="처음 시작 가이드"
    >
      <div className="guide-heading">
        <div>
          <span className="workspace-module">QUICK START</span>
          <h2>우리 가족, 이렇게 시작해요</h2>
          <p>보호자는 로그인, 아이는 연결 번호만 있으면 돼요.</p>
        </div>
        <Link className="button primary" to={target}>
          가족 연결 시작
          <Icon name="arrow" />
        </Link>
      </div>
      <ol className="guide-steps">
        <li>
          <b>01</b>
          <div>
            <strong>내 가족 만들기</strong>
            <span>처음 만든 보호자가 가족 관리자가 돼요.</span>
          </div>
        </li>
        <li>
          <b>02</b>
          <div>
            <strong>자녀 별명 추가</strong>
            <span>생년월일·이메일 없이 별명만 등록해요.</span>
          </div>
        </li>
        <li>
          <b>03</b>
          <div>
            <strong>아이 기기 연결</strong>
            <span>아이의 번호를 확인하고 보호자가 수락해요.</span>
          </div>
        </li>
      </ol>
    </section>
  );
}
export function HouseholdPage() {
 const {pathname}=useLocation();
  const session = useApi("/api/account/session", sessionSchema);
  if (session.loading)
    return (
      <AuthLayout wide>
        <Loading />
      </AuthLayout>
    );
  if (session.error)
    return (
      <AuthLayout wide>
        <ErrorState message={session.error} retry={session.retry} />
      </AuthLayout>
    );
  if (!session.data?.authenticated) return pathname==='/start'?<AuthLayout wide><div className="family-heading"><div><span className="eyebrow">START TOGETHER</span><h1>가족 연결, 세 단계면 충분해요</h1><p>누가 사용할 기기인지 먼저 골라 주세요.</p></div></div><div className="guide-role-cards"><div><Icon name="shield"/><strong>나는 보호자예요</strong><p>내 계정으로 로그인하고 가족을 만들어요. 자녀 별명을 추가하고 아이의 연결 요청을 수락해요.</p><Link className="button primary" to="/login">보호자 로그인·가입</Link></div><div><Icon name="device"/><strong>나는 아이예요</strong><p>이메일·비밀번호 없이 시작해요. 6자리 번호를 보호자에게 알려 주고, 내 이름을 확인하면 연결돼요.</p><Link className="button primary" to="/device/connect">아이 연결 시작</Link></div></div><StartGuide target="/login"/><section className="account-card"><h2>승인은 가족이 직접 해요</h2><p>가족을 만든 관리자가 다른 보호자의 참여 요청을 수락해요. 자녀를 등록한 보호자가 그 아이의 기기와 공유할 정보를 승인해요. 앱 운영자의 심사를 기다리지 않아요.</p><p>기관에서 법정 가족관계를 확인하는 인증과는 다른, 우리 가족끼리의 연결이에요.</p></section></AuthLayout>:<Navigate to="/login" replace />;
  return (
    <AuthLayout wide>
      <div className="family-heading">
        <div>
          <span className="eyebrow">FAMILY CONNECTION</span>
          <h1>우리 가족을 연결해요</h1>
          <p>가족 관리자가 초대와 기기 연결을 직접 승인해요.</p>
        </div>
        <Icon name="home" />
      </div>
      {session.data.assurance === "LOW" || !session.data.emailVerified ? (
        <>
          <StartGuide />
          <section className="account-card">
            <h2>보호자 계정 확인을 마쳐 주세요</h2>
            <p>
              아이는 이메일이 필요 없어요. 보호자 계정의 로그인·연락처 확인만
              이곳에서 마쳐 주세요.
            </p>
            <Link className="button primary" to="/account">
              내 계정 확인
            </Link>
          </section>
        </>
      ) : (
        <HouseholdWorkspace />
      )}
    </AuthLayout>
  );
}
function HouseholdWorkspace() {
  const status = useApi("/api/v1/household/status", householdStatusSchema);
  const [selected, setSelected] = useState(""),
    [selectedChild, setSelectedChild] = useState(""),
    [step, setStep] = useState<number | null>(null),
    [invite, setInvite] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [advanced, setAdvanced] = useState(false);
  const lock = useRef(false);
  const family =
    status.data?.families.find((f) => f.id === selected) ||
    status.data?.families[0];
  const child =
    family?.children.find((c) => c.id === selectedChild) || family?.children[0];
  const stage =
    step ??
    (!family
      ? 1
      : !family.children.length
        ? 2
        : !family.children.some((c) => c.deviceCount)
          ? 3
          : 4);
  async function act(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void act(async () => {
      const r = await familyRequest<{ id: string }>(
        "/api/v1/household/create",
        {
          name: String(data.get("name")),
          authorityConsent: data.get("authority") === "on",
        },
      );
      setSelected(r.id);
      setStep(2);
      status.retry();
    });
  }
  function addChild(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void act(async () => {
      const r = await familyRequest<{ id: string }>(
        "/api/v1/household/children",
        {
          familyId: family!.id,
          nickname: String(data.get("nickname")),
          guardianConsent: data.get("guardian") === "on",
          policyVersion: "household-1",
        },
      );
      setSelectedChild(r.id);
      setStep(3);
      status.retry();
      setMessage("자녀를 추가했어요. 이제 아이 기기를 연결해 보세요.");
    });
  }
  return (
    <>
      <details className="household-help"><summary>보호자와 아이는 어떻게 접속하나요?</summary>
      <StartGuide />
      <div className="guide-role-cards">
        <div>
          <Icon name="shield" />
          <strong>보호자</strong>
          <p>
            자신의 계정으로 로그인해요. 가족을 만든 사람이 초대 요청을 승인하고,
            자녀를 등록한 보호자가 아이 정보의 공유 범위를 정해요.
          </p>
        </div>
        <div>
          <Icon name="device" />
          <strong>아이</strong>
          <p>
            이메일·비밀번호를 만들지 않아요. 아이 기기의 연결 번호를 보호자가
            수락하면 내 하루에 접속해요. 연결된 기기에서는 다음에도 바로 열려요.
          </p>
        </div>
      </div>
      </details>
      <FormNotice error={error} message={message} />
      {error && (
        <Link className="button" to="/account/reauth">
          로그인한 지 오래됐다면 본인 확인 다시 하기
        </Link>
      )}
      {status.loading ? (
        <Loading label="가족 연결 단계를 확인하고 있어요" />
      ) : status.error ? (
        <ErrorState message={status.error} retry={status.retry} />
      ) : (
        <>
          {status.data!.pending.map((f) => (
            <section className="account-card" role="status" key={f.id}>
              <h2>{f.name} · 참여 승인 대기</h2>
              <p>
                이 가족을 만든 가족 관리자가 요청을 수락해요. 앱 운영자의 심사를
                기다리는 단계가 아니에요.
              </p>
              <button className="button" onClick={status.retry}>
                참여 상태 새로고침
              </button>
            </section>
          ))}
          <nav className="setup-progress" aria-label="가족 연결 단계">
            {["가족 만들기", "자녀 추가", "아이 기기 연결", "함께 사용"].map(
              (title, i) => (
                <button
                  key={title}
                  aria-current={stage === i + 1 ? "step" : undefined}
                  disabled={(i > 0 && !family) || (i > 1 && !child)}
                  onClick={() => setStep(i + 1)}
                >
                  <span>{i + 1}</span>
                  {title}
                </button>
              ),
            )}
          </nav>
          {status.data!.families.length > 0 && (
            <div className="family-selector">
              <label htmlFor="household-family">함께하는 가족</label>
              <select
                id="household-family"
                value={family?.id}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setStep(null);
                  setSelectedChild("");
                  setAdvanced(false);
                }}
              >
                {status.data!.families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!family || stage === 1 ? (
            <div className="household-columns">
              <section className="account-card">
                <span className="workspace-module">STEP 01</span>
                <h2>처음이라면 가족을 만들어요</h2>
                <p>
                  가족을 만들면 내가 가족 관리자가 돼요. 별도의 기관 심사를
                  신청하지 않아요.
                </p>
                <form className="auth-form" onSubmit={create}>
                  <label htmlFor="household-name">가족 이름</label>
                  <input
                    id="household-name"
                    name="name"
                    maxLength={40}
                    required
                    placeholder="예: 우리 가족"
                  />
                  <label className="check-option">
                    <input type="checkbox" name="authority" required />
                    <span>
                      나는 성인 보호자이며 이 가족의 초대·연결을 관리할 책임을
                      확인했어요.
                    </span>
                  </label>
                  <button className="button primary full" disabled={busy}>
                    새 가족 만들기
                  </button>
                </form>
              </section>
              <JoinFamily
                run={act}
                busy={busy}
                saved={() => {
                  status.retry();
                  setStep(null);
                  setMessage(
                    "참여를 요청했어요. 해당 가족 관리자의 수락을 기다려 주세요.",
                  );
                }}
              />
            </div>
          ) : (
            <>
              {stage === 2 && (
                <section className="account-card household-form">
                  <span className="workspace-module">STEP 02</span>
                  <h2>자녀는 별명만 추가해요</h2>
                  <p>
                    생년월일·아이 이메일·비밀번호는 받지 않아요. 직접 등록한
                    프로필이며 기관의 가족관계 인증을 의미하지 않아요.
                  </p>
                  {family.owner ? (
                    <form className="auth-form" onSubmit={addChild}>
                      <label htmlFor="household-child">자녀 별명</label>
                      <input
                        id="household-child"
                        name="nickname"
                        required
                        maxLength={24}
                        placeholder="예: 서준"
                      />
                      <label className="check-option">
                        <input type="checkbox" name="guardian" required />
                        <span>
                          나는 이 아이의 부모 또는 법정대리인이며,
                          별명·일정·대화 기록을 우리 가족 안에서 처리하는 데
                          동의해요. 위치 수집에는 동의하지 않으며, 프로필과 연결
                          기록은 자녀 관리에서 삭제할 수 있어요.
                        </span>
                      </label>
                      <button className="button primary full" disabled={busy}>
                        자녀 추가하고 다음
                      </button>
                    </form>
                  ) : (
                    <p>자녀 추가는 이 가족을 만든 관리자에게 요청해 주세요.</p>
                  )}
                </section>
              )}
              {stage === 3 && child && (
                <section className="account-card">
                  <span className="workspace-module">STEP 03</span>
                  <h2>아이 번호를 확인하고 수락해요</h2>
                  <ol className="connection-instructions">
                    <li>
                      아이 기기에서 <strong>myiharu.com/device/connect</strong>
                      를 열어요.
                    </li>
                    <li>
                      아이가 <strong>연결 번호 받기</strong>를 누르면 6자리
                      번호가 나와요.
                    </li>
                    <li>아래에서 자녀를 고른 뒤 번호를 확인하고 수락해요.</li>
                    <li>
                      아이가 자기 이름을 확인하고{" "}
                      <strong>내 기기로 연결하기</strong>를 눌러요.
                    </li>
                  </ol>
                  <label htmlFor="connect-child">연결할 자녀</label>
                  <select
                    id="connect-child"
                    value={child.id}
                    onChange={(e) => setSelectedChild(e.target.value)}
                  >
                    {family.children
                      .filter((c) => c.canManage)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nickname}
                        </option>
                      ))}
                  </select>
                  {child.canManage ? (
                    <PairChild
                      child={child}
                      done={() => {
                        status.retry();
                        setMessage("보호자가 수락했어요. 아이 기기에서 이름을 확인하고 연결을 마쳐 주세요.");
                        setStep(4);
                      }}
                    />
                  ) : (
                    <p>
                      이 자녀를 등록한 보호자에게 기기 연결을 요청해 주세요.
                    </p>
                  )}
                  <button
                    className="button full"
                    onClick={() => {
                      setStep(4);
                      status.retry();
                    }}
                  >
                    기기 연결은 나중에 하기
                  </button>
                </section>
              )}
              {stage === 4 && (
                <section className="account-card">
                  <span className="workspace-module">READY TO GO</span>
                  <h2>우리 가족의 하루를 시작해요</h2>
                  <p>
                    아이 기기가 없어도 보호자가 달력과 등하원을 먼저 사용할 수
                    있어요.
                  </p>
                  <div className="household-shortcuts">
                    <Link className="button primary" to="/today/calendar">
                      가족 달력 열기
                    </Link>
                    <Link className="button" to="/chat">
                      가족 대화 열기
                    </Link>
                  </div>
                </section>
              )}
              <section className="account-card">
                <div className="card-title">
                  <h2>함께 챙기는 자녀</h2><button className="button compact" onClick={status.retry}>연결 상태 새로고침</button>
                  {family.owner && (
                    <button
                      className="button compact"
                      onClick={() => setStep(2)}
                    >
                      자녀 추가
                    </button>
                  )}
                </div>
                <div className="household-child-list">
                  {family.children.map((c) => (
                    <article key={c.id}>
                      <span className="child-avatar">
                        <Icon name="sun" />
                      </span>
                      <div>
                        <h3>{c.nickname}</h3>
                        <p>
                          {c.deviceCount
                            ? `연결된 기기 ${c.deviceCount}대`
                            : "아직 아이 기기를 연결하지 않았어요"}{" "}
                          · {c.managed ? "보호자 직접 등록" : "기존 등록"}
                        </p>
                      </div>
                      {c.canManage && (
                        <button
                          className="button compact"
                          onClick={() => {
                            setSelectedChild(c.id);
                            setStep(3);
                          }}
                        >
                          기기 연결
                        </button>
                      )}
                      {c.canManage&&<button className="button compact" aria-label={`${c.nickname} 공유 설정`} onClick={()=>{setSelectedChild(c.id);setAdvanced(true);}}>공유 설정</button>}
                      {c.canManage && c.managed && (
                        <button
                          className="button compact danger-text"
                          onClick={() => {
                            if (
                              window.confirm(
                                `${c.nickname} 프로필과 일정·대화·기기 연결을 삭제할까요? 되돌릴 수 없어요.`,
                              )
                            )
                              void act(async () => {
                                await familyRequest(
                                  `/api/v1/household/children/${c.id}`,
                                  { expectedVersion: c.version },
                                  "DELETE",
                                );
                                setSelectedChild("");
                                setAdvanced(false);
                                status.retry();
                                setStep(null);
                                setMessage(
                                  "프로필과 연결된 데이터를 삭제했어요.",
                                );
                              });
                          }}
                        >
                          프로필 삭제
                        </button>
                      )}
                    </article>
                  ))}
                </div>
                {!family.children.length && (
                  <p>아직 자녀가 없어요. 위의 자녀 추가부터 시작해 주세요.</p>
                )}
                {child?.canManage && (
                  <>
                    <button
                      className="button full"
                      onClick={() => setAdvanced((v) => !v)}
                    >
                      {advanced
                        ? "상세 관리 닫기"
                        : "자녀별 공유 범위·기기 상세 관리"}
                    </button>
                    {advanced && (
                      <ChildManagement
                        key={child.id}
                        child={child}
                        refresh={status.retry}
                      />
                    )}
                  </>
                )}
              </section>
              <section className="account-card">
                <div className="card-title">
                  <h2>다른 보호자와 연결</h2>
                  <span className="badge soft">가족 관리자가 수락</span>
                </div>
                <p>
                  가족 코드를 전달하면 상대 보호자가 자기 계정으로 참여를
                  요청해요. 자녀 정보는 자녀를 등록한 보호자가 공유 범위를
                  지정한 뒤 보여요.
                </p>
                {family.owner && (
                  <>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const r = await familyRequest<{ code: string }>(
                            "/api/v1/household/invite",
                            { familyId: family.id },
                          );
                          setInvite(r.code);
                        })
                      }
                    >
                      가족 코드 만들기
                    </button>
                    {invite && (
                      <div className="household-code">
                        <label htmlFor="household-code">24시간 가족 코드</label>
                        <input
                          id="household-code"
                          readOnly
                          value={invite}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                        <button
                          className="button"
                          onClick={() =>
                            void act(async () => {
                              await navigator.clipboard.writeText(invite);
                              setMessage("가족 코드를 복사했어요.");
                            })
                          }
                        >
                          코드 복사
                        </button>
                        <small>
                          새 코드를 만들면 이전 미사용 코드는 만료돼요.
                        </small>
                      </div>
                    )}
                  </>
                )}
                <MemberRequests familyId={family.id} owner={family.owner} />
                <JoinFamily
                  run={act}
                  busy={busy}
                  saved={() => {
                    status.retry();
                    setMessage("참여 요청을 보냈어요.");
                  }}
                />
              </section>
            </>
          )}
          <details className="household-help">
            <summary>누가 승인하나요? · 연결 도움말</summary>
            <h3>가족 관리자와 자녀를 등록한 보호자의 역할</h3>
            <p>
              가족 관리자는 내가 만든 가족에 들어오는 보호자의 요청을 수락해요.
              자녀를 등록한 보호자는 해당 자녀의 기기와 정보 공유를 승인해요.
              아이는 자신의 기기에서 연결된 이름을 마지막으로 확인해요.
            </p>
            <p>
              이 과정은 가족끼리 연결을 승인하는 방식이며 기관의 법정 가족관계
              인증이 아니에요. 아이 프로필은 검색 목록에 공개되지 않아요.
            </p>
            <Link to="/device/connect">아이 기기에서 시작하기</Link>
          </details>
        </>
      )}
    </>
  );
}
function JoinFamily({
  run,
  busy,
  saved,
}: {
  run: (fn: () => Promise<void>) => Promise<void>;
  busy: boolean;
  saved: () => void;
}) {
  return (
    <section className="join-family">
      <h3>가족 코드를 받았나요?</h3>
      <p>상대방에게 받은 코드를 입력해 가족을 찾고 참여를 요청해요.</p>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          const code = String(new FormData(e.currentTarget).get("code"))
            .trim()
            .toUpperCase();
          void run(async () => {
            await familyRequest("/api/v1/household/join", { code });
            saved();
          });
        }}
      >
        <label htmlFor="join-household-code">받은 가족 코드</label>
        <input
          id="join-household-code"
          name="code"
          required
          maxLength={32}
          autoComplete="off"
          placeholder="IH-XXXX-XXXX-XXXX"
        />
        <button className="button full" disabled={busy}>
          코드로 가족 참여 요청
        </button>
      </form>
    </section>
  );
}
function MemberRequests({familyId,owner}:{familyId:string;owner:boolean}){
 const members=useApi(`/api/v1/families/${familyId}/members`,membersSchema),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 async function change(m:{id:string;version:number},approve:boolean){if(busy)return;setBusy(true);setError('');setNotice('');try{await familyRequest(`/api/v1/memberships/${m.id}/${approve?'approve':'revoke'}`,{expectedVersion:m.version});members.retry();setNotice(approve?'참여를 수락했어요. 위의 자녀에서 공유 설정을 눌러 허용할 정보를 골라 주세요.':'가족 참여와 공유 접근을 해제했어요.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="household-members"><div className="card-title"><h3>함께하는 보호자와 요청</h3><button className="button compact" onClick={members.retry}>요청 새로고침</button></div><FormNotice error={error} message={notice}/>{error&&<Link to="/account/reauth">본인 확인 다시 하기</Link>}{members.loading?<Loading/>:members.error?<ErrorState message={members.error} retry={members.retry}/>:members.data!.members.map(m=><div className="family-member" key={m.id}><div><strong>{m.name}</strong><small>{m.owner?'가족 관리자':m.status==='PENDING'?'참여 요청 도착':'함께하는 보호자'}</small></div>{owner&&m.status==='PENDING'&&<button className="button" disabled={busy} onClick={()=>void change(m,true)}>요청 수락</button>}{owner&&!m.owner&&<button className="button" disabled={busy} onClick={()=>{if(window.confirm(m.status==='PENDING'?'이 참여 요청을 거절할까요?':'이 보호자의 가족 참여와 공유 접근을 해제할까요?'))void change(m,false);}}>{m.status==='PENDING'?'요청 거절':'가족 연결 해제'}</button>}</div>)}</div>;
}
function PairChild({
  child,
  done,
}: {
  child: HouseholdStatus["families"][number]["children"][number];
  done: () => void;
}) {
  const [code, setCode] = useState(""),
    [resolved, setResolved] = useState<{
      id: string;
      version: number;
      label: string;
      expiresAt: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="household-pair">
      <FormNotice error={error} />
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () =>
            setResolved(
              await familyRequest("/api/v1/device-pairings/resolve", { code }),
            ),
          );
        }}
      >
        <label htmlFor="household-pair-code">아이 화면의 6자리 번호</label>
        <input
          id="household-pair-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, ""));
            setResolved(null);
          }}
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{6}"
          maxLength={6}
          required
        />
        <button className="button primary" disabled={busy || code.length !== 6}>
          연결 요청 확인
        </button>
      </form>
      {resolved && (
        <div className="pair-approval">
          <h3>{child.nickname}의 기기로 연결할까요?</h3>
          <p>아이 기기에 표시된 번호와 일치하는지 확인해 주세요.</p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await familyRequest(
                  `/api/v1/device-pairings/${resolved.id}/approve`,
                  { childId: child.id, expectedVersion: resolved.version },
                );
                setResolved(null);
                setCode("");
                done();
              })
            }
          >
            이 아이의 연결 요청 수락
          </button>
        </div>
      )}
    </div>
  );
}

import {useState,useEffect,useRef} from 'react';
import {Link,Navigate} from 'react-router-dom';
import {AuthLayout,FormNotice} from '../components/AuthLayout';
import {Icon} from '../components/Icon';
import {Loading,ErrorState} from '../components/Common';
import {useApi} from '../api';
import {sessionSchema} from '../auth';
import {childSessionSchema,pairingSchema,pairingStatusSchema,type Pairing,type PairingStatus} from '../../../shared/family';
import {ChildDailyContent} from './Daily';
import {familyRequest} from '../family';
const storageKey='iharu-pairing-progress';
// Only display metadata and an idempotency key survive a reload. Authentication
// proofs and device session tokens remain exclusively in HttpOnly cookies.
function restorePair():Pairing|null{try{return pairingSchema.parse(JSON.parse(sessionStorage.getItem(storageKey)||'null'));}catch{return null;}}
function savePair(pair:Pairing|null){try{if(pair)sessionStorage.setItem(storageKey,JSON.stringify(pair));else sessionStorage.removeItem(storageKey);}catch{/* Pairing still works when browser storage is disabled. */}}
export function DeviceConnectPage(){
 const childSession=useApi('/api/v1/child-session',childSessionSchema),guardian=useApi('/api/account/session',sessionSchema);
 const [pair,setPair]=useState<Pairing|null>(restorePair),[status,setStatus]=useState<PairingStatus|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[connected,setConnected]=useState(false),[remaining,setRemaining]=useState(0),[stopped,setStopped]=useState(false),[paused,setPaused]=useState(false);
 const locked=useRef(false),current=useRef(pair),checkAction=useRef<(automatic?:boolean)=>Promise<void>>(async()=>{});current.current=pair;
 function remember(next:Pairing|null){current.current=next;setPair(next);savePair(next);}
 useEffect(()=>{if(childSession.data){savePair(null);}},[childSession.data]);
 useEffect(()=>{if(!pair)return;const offset=pair.receivedAt-Date.parse(pair.serverNow);const update=()=>setRemaining(Math.max(0,Math.ceil((Date.parse(pair.expiresAt)-(Date.now()-offset))/1000)));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[pair]);
 async function act(fn:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError((e as Error).message);setPaused(true);if(['PAIRING_INVALID','PAIRING_RESTART'].includes((e as {code?:string}).code||'')){setStopped(true);setStatus(null);}}finally{locked.current=false;setBusy(false);}}
 async function start(){await act(async()=>{const result=await familyRequest('/api/v1/device-pairings',{label:'아이 기기'});const next=pairingSchema.parse({...result,exchangeKey:crypto.randomUUID(),receivedAt:Date.now()});remember(next);setStatus(null);setStopped(false);setPaused(false);});}
 async function check(automatic=false){const p=current.current;if(!p)return;await act(async()=>{const next=pairingStatusSchema.parse(await familyRequest(`/api/v1/device-pairings/${p.id}/status`,{}));if(current.current?.id!==p.id)return;setStatus(next);setPaused(false);remember({...p,expiresAt:next.expiresAt,serverNow:next.serverNow,receivedAt:Date.now()});if(next.status==='WAITING'&&!automatic)setMessage('보호자가 아직 확인하고 있어요. 잠깐만 기다려 주세요.');if(['EXPIRED','REVOKED'].includes(next.status)){setStopped(true);setMessage('번호가 만료됐거나 취소됐어요. 새 번호를 받아 주세요.');}});}
 checkAction.current=check;
 useEffect(()=>{
  if(!pair||childSession.loading||childSession.data||guardian.loading||guardian.data?.authenticated||stopped||paused||status?.child)return;
  void checkAction.current(true);
  const tick=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)void checkAction.current(true);},3000);
  const visible=()=>{if(document.visibilityState==='visible')void checkAction.current(true);};document.addEventListener('visibilitychange',visible);
  return()=>{clearInterval(tick);document.removeEventListener('visibilitychange',visible);};
 },[pair?.id,childSession.loading,childSession.data,guardian.loading,guardian.data?.authenticated,stopped,paused,Boolean(status?.child)]);
 async function connect(){if(!pair||!status?.child)return;await act(async()=>{await familyRequest(`/api/v1/device-pairings/${pair.id}/exchange`,{exchangeKey:pair.exchangeKey,childId:status.child!.id});remember(null);setConnected(true);});}
 async function cancel(){if(!pair)return;await act(async()=>{await familyRequest(`/api/v1/device-pairings/${pair.id}/cancel`,{});remember(null);setStatus(null);setStopped(false);setPaused(false);});}
 if(connected)return <Navigate to="/child/connected" replace/>;
 if(childSession.loading||guardian.loading)return <AuthLayout wide><Loading label="기기 연결을 확인하고 있어요"/></AuthLayout>;
 if(childSession.data)return <AuthLayout wide><div className="device-connect"><span className="badge green">이미 연결된 기기</span><h1>{childSession.data.nickname}의 기기예요</h1><p>{childSession.data.familyName}와 함께하고 있어요.</p><Link className="button primary full child-cta" to="/child/connected">내 하루로 들어가기</Link><Link className="button full child-cta" to={`/child/chat?child=${childSession.data.childId}`}>가족에게 말하기</Link><p>다른 아이에게 연결하려면 내 하루에서 기존 연결을 끝내 주세요.</p></div></AuthLayout>;
 if(guardian.data?.authenticated)return <AuthLayout wide><div className="device-connect"><h1>아이 기기에서 시작해 주세요</h1><p>지금은 보호자가 로그인한 화면이에요. 아이가 사용할 다른 기기에서 아이하루를 열고 연결 번호를 받아 주세요.</p><Link className="button primary full" to="/family">우리 가족에서 번호 확인</Link></div></AuthLayout>;
 if(guardian.error)return <AuthLayout wide><ErrorState message={guardian.error} retry={()=>{childSession.retry();guardian.retry();}}/></AuthLayout>;
 const target=status?.child,expired=stopped||remaining<=0;
 return <AuthLayout wide><div className="device-connect"><Link className="auth-back" to="/login">보호자 로그인</Link><span className="device-hero"><Icon name="device"/></span><span className="eyebrow">내 기기로 시작해요</span><h1>{target?'내 이름이 맞나요?':pair?'이 번호를 보여 주세요':'가족과 연결해 볼까요?'}</h1><p>{target?'보호자가 선택한 가족과 아이를 확인해 주세요.':pair?'보호자가 가족 화면에서 번호를 확인해 줄 거예요.':'이메일이나 회원가입 없이 시작해요. 연결 번호를 받아 보호자에게 알려 주세요.'}</p><FormNotice error={error||(childSession.errorCode!=='DEVICE_REQUIRED'?childSession.error:undefined)} message={message}/>
 {pair?<>{target?<section className="pair-approval" aria-label="연결할 아이 확인"><span className="badge green">보호자 확인 완료</span><h2>{target.nickname}</h2><p>{target.familyName}</p></section>:<div className="pairing-code" role="status" aria-label={`연결 번호 ${pair.code.split('').join(' ')}`}>{pair.code.slice(0,3)} <span>{pair.code.slice(3)}</span></div>}
 <p className="pairing-time">{expired?'이 번호는 더 이상 사용할 수 없어요':`${Math.floor(remaining/60)}분 ${String(remaining%60).padStart(2,'0')}초 안에 연결해 주세요`}</p>
 {target?<><button className="button primary full child-cta" disabled={busy||expired} onClick={connect}>내 기기로 연결하기 <Icon name="arrow"/></button><button className="button full child-cta" disabled={busy} onClick={cancel}>다른 아이예요 · 연결 취소</button></>:<button className="button primary full child-cta" disabled={busy||expired} onClick={()=>void check()}><Icon name="check"/>보호자 확인이 끝났어요</button>}
 <button className="button full child-cta" disabled={busy} onClick={start}>새 번호 받기 <Icon name="repeat"/></button><p className="account-caption">새 번호를 받으면 이전 번호는 사용할 수 없어요.<br/>화면을 보고 있는 동안 보호자 확인 결과를 알려 드려요.</p>
 </>:<><div className="connection-guide" aria-label="이메일 없이 연결하는 순서"><span><b>01</b>아이가 번호 요청</span><span><b>02</b>보호자가 확인·수락</span><span><b>03</b>내 이름 확인 후 연결</span></div><div className="device-steps"><span><Icon name="device"/>번호 받기</span><Icon name="arrow"/><span><Icon name="shield"/>보호자 확인</span></div><button className="button primary full child-cta" disabled={busy} onClick={start}>연결 번호 받기 <Icon name="arrow"/></button><Link className="button full" to="/child/connected">이미 연결한 기기로 들어가기</Link></>}
 </div></AuthLayout>;
}
export function ConnectedChildPage(){
 const session=useApi('/api/v1/child-session',childSessionSchema),[error,setError]=useState('');
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')session.refresh();};document.addEventListener('visibilitychange',refresh);let active=true;const timer=setInterval(()=>{if(document.visibilityState==='visible')void familyRequest('/api/v1/child-session',{},'GET').catch(e=>{if(active&&e.code==='DEVICE_REQUIRED')session.retry();});},15000);return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[session.retry,session.refresh]);
 if(session.loading)return <AuthLayout wide><Loading label="내 기기를 확인하고 있어요"/></AuthLayout>;
 if(session.error)return <AuthLayout wide><div className="device-connect"><span className="device-hero"><Icon name="device"/></span><h1>연결을 확인해 주세요</h1><p>보호자에게 기기 연결 상태를 확인해 달라고 해 주세요.</p><button className="button primary full child-cta" onClick={session.retry}>다시 확인하기</button><Link className="button full child-cta" to="/device/connect">기기 연결하기</Link></div></AuthLayout>;
 return <AuthLayout wide><div className="device-connect child-day-home"><span className="badge green">가족 연결 완료</span><h1>{session.data?.nickname}, 반가워요</h1><p>{session.data?.familyName}<br/>오늘의 일정과 할 일을 확인해요.</p><div className="child-ready-grid"><Link className="button primary child-cta" to={`/child/chat?child=${session.data!.childId}`}><Icon name="chat"/><strong>가족에게 말하기</strong></Link><Link className="button child-cta" to="/child/schedules"><Icon name="calendar"/><strong>내 일정 보기</strong></Link></div><ChildDailyContent childId={session.data!.childId} nickname={session.data!.nickname}/><FormNotice error={error}/><button className="button full" onClick={async()=>{try{await familyRequest('/api/v1/child-session/logout',{});savePair(null);window.location.assign('/device/connect');}catch(e){setError((e as Error).message);}}}>이 기기 연결 끝내기</button></div></AuthLayout>;
}


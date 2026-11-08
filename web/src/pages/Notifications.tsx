import {useEffect,useState} from 'react';
import {Link,Navigate} from 'react-router-dom';
import {z} from 'zod';
import {useApi} from '../api';
import {sessionSchema} from '../auth';
import {AuthLayout,FormNotice} from '../components/AuthLayout';
import {Loading,ErrorState} from '../components/Common';
const schema=z.object({data:z.object({items:z.array(z.object({id:z.uuid(),childId:z.uuid(),category:z.enum(['chat','daily']),kind:z.string(),createdAt:z.string(),readAt:z.string().nullable(),version:z.number()})),hasMore:z.boolean(),pushAvailable:z.boolean(),realtimeAvailable:z.boolean()})});
export function NotificationsPage(){
 const session=useApi('/api/account/session',sessionSchema);
 if(session.loading)return <AuthLayout wide><Loading/></AuthLayout>;
 if(session.error)return <AuthLayout wide><ErrorState message={session.error} retry={session.retry}/></AuthLayout>;
 if(!session.data?.authenticated)return <Navigate to="/login" replace/>;
 if(session.data.assurance==='LOW')return <Navigate to="/account" replace/>;
 return <AuthLayout wide><Link className="auth-back" to="/timetable">← 오늘로</Link><h1>가족의 새 소식</h1>{session.data.accessReady?<Inbox/>:<section className="family-welcome"><h2>가족 연결 후 소식을 모아드려요</h2><p>로그인은 완료됐어요. 계정 확인과 가족 연결이 끝나면 알림함을 사용할 수 있어요.</p><Link className="button primary" to="/family">가족 연결 상태 확인</Link></section>}</AuthLayout>;
}
function Inbox(){
 const [before,setBefore]=useState(''),[filter,setFilter]=useState('all'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const inbox=useApi('/api/v1/notifications'+(before?'?before='+before:''),schema);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')inbox.retry();};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);const timer=window.setInterval(refresh,60000);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[inbox.retry]);
 async function mark(id:string,version:number){setBusy(true);setError('');try{const r=await fetch(`/api/v1/notifications/${id}/read`,{method:'PUT',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({expectedVersion:version})});if(!r.ok)throw new Error('알림 상태가 바뀌었어요. 새로고침 후 확인해 주세요.');inbox.retry();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(inbox.errorCode==='AUTH_REQUIRED')return <Navigate to="/login" replace/>;
 const all=inbox.data?.data.items||[],items=all.filter(n=>filter==='all'||n.category===filter);
 return <><p>최근 30일의 소식을 확인해요. 알림 확인과 대화 읽음은 각각 기록해요.</p><p className="auth-notice">기기 Push 알림은 아직 연결되지 않았어요. 이 알림함에서 소식을 확인해 주세요.</p><nav className="family-nav" aria-label="현재 페이지 알림 종류">{[['all','전체'],['chat','대화'],['daily','하루 관리']].map(([id,label])=><button key={id} className="button" aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}<button className="button" onClick={inbox.retry}>새로고침</button></nav><FormNotice error={error}/>
 {inbox.loading?<Loading/>:inbox.error?<ErrorState message={inbox.error} retry={()=>{setBefore('');inbox.retry();}}/>:items.length?<ul className="notification-list">{items.map(n=><li className="account-card" key={n.id}><span className="badge soft">{n.readAt?'확인함':'새 소식'}</span><h2>{n.category==='chat'?'새 가족 메시지가 있어요':n.kind==='TASK_DUE'?'할 일 마감이 다가와요':n.kind==='MISSING_ARRIVAL'?'등하원 기록을 확인해 주세요':'하루 관리에 새 소식이 있어요'}</h2><time>{new Date(n.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</time><div className="card-actions"><Link className="button primary" to={n.category==='chat'?`/chat?child=${n.childId}`:'/timetable'}>현재 상태 확인</Link>{!n.readAt&&<button className="button" disabled={busy} onClick={()=>void mark(n.id,n.version)}>확인 표시</button>}</div></li>)}</ul>:<p role="status">이 페이지에는 해당 소식이 없어요.</p>}
 <div className="card-actions">{before&&<button className="button" onClick={()=>setBefore('')}>최신 소식</button>}{inbox.data?.data.hasMore&&<button className="button" disabled={inbox.loading} onClick={()=>setBefore(all[all.length-1].id)}>이전 소식</button>}</div></>;
}


import {WorkspaceTutorial} from '../components/WorkspaceTutorial';
import {useCallback,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {AuthLayout} from '../components/AuthLayout';
import {Icon} from '../components/Icon';
import {Loading} from '../components/Common';
import {workspaceRequest} from '../workspace-api';
import {applicationKey,bindPushProfile,deviceSubscription,pushSupported} from '../push-device';
import '../notification-settings.css';

type Settings={profileId:string;calendarChanges:boolean;calendarReminders:boolean;chat:boolean;reminderMinutes:number;preview:boolean;deviceEnabled:boolean;deviceCount:number;pushAvailable:boolean;publicKey:string|null};
const minutes=[{value:0,label:'일정 시작 시각'},{value:5,label:'5분 전'},{value:10,label:'10분 전'},{value:30,label:'30분 전'},{value:60,label:'1시간 전'},{value:1440,label:'1일 전'},{value:10080,label:'1주 전'}];
export function NotificationSettings(){
 const [settings,setSettings]=useState<Settings|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[permission,setPermission]=useState<NotificationPermission|'unsupported'>(()=>pushSupported()?Notification.permission:'unsupported');
 const load=useCallback(async()=>{try{const subscription=await deviceSubscription();const next=await workspaceRequest<Settings>('push.settings',subscription?{endpoint:subscription.endpoint}:{});setSettings(next);bindPushProfile(next.profileId);setPermission(pushSupported()?Notification.permission:'unsupported');setError('');}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();const refresh=()=>{if(document.visibilityState==='visible')void load();};document.addEventListener('visibilitychange',refresh);return()=>document.removeEventListener('visibilitychange',refresh);},[load]);
 async function run(action:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await action();}catch(e){setError((e as Error).message||'알림 연결을 확인하지 못했어요. 다시 시도해 주세요.');}finally{setBusy(false);}}
 async function enable(){
  if(!settings?.publicKey||!pushSupported())return;
  // Request at the start of the click handler so mobile browsers preserve user activation.
  const permissionRequest=Notification.requestPermission();
  await run(async()=>{
   const granted=await permissionRequest;setPermission(granted);if(granted!=='granted')throw new Error('알림이 허용되지 않았어요. 기기 또는 브라우저 설정에서 아이하루 알림을 허용해 주세요.');
   const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});await navigator.serviceWorker.ready;
   let subscription=await registration.pushManager.getSubscription();
   if(subscription){const current=subscription.options.applicationServerKey,expected=applicationKey(settings.publicKey!);if(!current||new Uint8Array(current).some((n,i)=>n!==expected[i])||current.byteLength!==expected.length){await subscription.unsubscribe();subscription=null;}}
   subscription??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(settings.publicKey!)});
   const value=subscription.toJSON();
   try{const next=await workspaceRequest<Settings>('push.subscribe',{endpoint:subscription.endpoint,p256dh:value.keys?.p256dh,auth:value.keys?.auth});setSettings(next);bindPushProfile(next.profileId);setMessage('이 기기의 알림을 연결했어요. 시험 알림으로 수신을 확인해 주세요.');}catch(e){await subscription.unsubscribe().catch(()=>false);throw e;}
  });
 }
 async function disable(){await run(async()=>{const subscription=await deviceSubscription();if(subscription){await workspaceRequest('push.unsubscribe',{endpoint:subscription.endpoint});await subscription.unsubscribe();}const registration=await navigator.serviceWorker.getRegistration('/');for(const n of await registration?.getNotifications()||[])n.close();await load();setMessage('이 기기의 알림을 껐어요. 다른 기기의 설정은 유지돼요.');});}
 async function save(patch:Partial<Settings>){
  if(!settings)return;const previous=settings,value={...settings,...patch};setSettings(value);
  await run(async()=>{try{const subscription=await deviceSubscription();const next=await workspaceRequest<Settings>('push.settings.save',{calendarChanges:value.calendarChanges,calendarReminders:value.calendarReminders,chat:value.chat,reminderMinutes:value.reminderMinutes,preview:value.preview,...(subscription?{endpoint:subscription.endpoint}:{})});setSettings(next);setMessage('알림설정을 저장했어요.');}catch(e){setSettings(previous);throw e;}});
 }

 const enabled=settings?.deviceEnabled&&permission==='granted';
 return <AuthLayout wide>{settings&&<WorkspaceTutorial profileId={settings.profileId}/>}<div className="notification-settings"><div className="workspace-page-heading"><div><p className="eyebrow">필요한 소식만, 놓치지 않도록</p><h1>알림설정</h1><p>가족 달력과 대화의 새 소식을 받아보세요.</p></div><span className="notification-heading-icon"><Icon name="bell"/></span></div>
 {error&&<div role="alert" className="notification-notice error">{error}</div>}{message&&<div role="status" className="notification-notice">{message}</div>}
 {loading?<Loading label="알림설정을 불러오고 있어요"/>:!settings?<section className="account-card"><p>로그인한 뒤 알림을 설정할 수 있어요.</p><Link className="button primary" to="/login">로그인</Link><button className="button" onClick={()=>void load()}>다시 확인</button></section>:<>
 <section className="notification-device account-card" aria-labelledby="device-push-title"><div className="notification-section-heading"><Icon name="bell"/><div><h2 id="device-push-title">이 기기 알림</h2><p>{enabled?'기기 알림이 연결되어 있어요.':'기기마다 한 번씩 알림을 연결해 주세요.'}</p></div><span className={'notification-state '+(enabled?'on':'')}>{enabled?'연결됨':'연결 안 됨'}</span></div>
 <p>앱을 보고 있지 않을 때도 소식을 받을 수 있어요. 현재 계정에 연결된 기기 {settings.deviceCount}개</p>
 {permission==='unsupported'?<p className="notification-help">이 환경에서는 기기 알림을 지원하지 않아요. Android Chrome 또는 최신 아이하루 앱을 이용해 주세요. iPhone·iPad는 홈 화면에 추가한 앱에서 설정해 주세요.</p>:!settings.pushAvailable?<p className="notification-help">기기 알림 연결을 준비하고 있어요. 아래 수신 설정은 먼저 저장할 수 있어요.</p>:<div className="notification-actions"><button type="button" className="button primary" disabled={busy} onClick={()=>void(enabled?disable():enable())}>{busy?'처리 중…':enabled?'이 기기 알림 끄기':'이 기기 알림 켜기'}</button><button type="button" className="button" disabled={busy||!enabled} onClick={()=>void run(async()=>{const subscription=await deviceSubscription();if(!subscription)throw new Error('기기 알림을 다시 연결해 주세요.');await workspaceRequest('push.test',{endpoint:subscription.endpoint});setMessage('시험 알림을 요청했어요. 기기의 알림창을 확인해 주세요.');})}>시험 알림 보내기</button></div>}
 {permission==='denied'&&<p className="notification-help">알림이 차단되어 있어요. Android 설정 → 앱 → 아이하루 → 알림을 허용한 뒤 다시 연결해 주세요. 브라우저에서는 사이트 설정의 알림 권한을 확인해 주세요.</p>}
 </section>
 <fieldset className="notification-options" disabled={busy}><legend className="sr-only">수신할 알림</legend><section className="account-card"><div className="notification-section-heading"><Icon name="calendar"/><div><h2>달력</h2><p>가족 행사와 기념일을 함께 챙겨요.</p></div></div>
 <label className="notification-option"><span><strong>일정 등록·변경 알림</strong><small>가족이 일정을 등록·수정·삭제하면 알려드려요.</small></span><input type="checkbox" role="switch" checked={settings.calendarChanges} onChange={e=>void save({calendarChanges:e.target.checked})}/></label>
 <label className="notification-option"><span><strong>일정 미리 알림</strong><small>반복 일정을 포함해 시작 전에 알려드려요.</small></span><input type="checkbox" role="switch" checked={settings.calendarReminders} onChange={e=>void save({calendarReminders:e.target.checked})}/></label>
 <label className="notification-option"><span><strong>미리 알림 시간</strong><small>종일 일정은 오전 9시 기준 · 한국 시간</small></span><select aria-label="달력 미리 알림 시간" disabled={!settings.calendarReminders} value={settings.reminderMinutes} onChange={e=>void save({reminderMinutes:Number(e.target.value)})}>{minutes.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
 </section><section className="account-card"><div className="notification-section-heading"><Icon name="chat"/><div><h2>대화</h2><p>가족이 전하는 새로운 이야기</p></div></div><label className="notification-option"><span><strong>새 대화 알림</strong><small>가족의 새 메시지를 알려드려요. 이미 확인한 대화는 발송 전에 제외해요.</small></span><input type="checkbox" role="switch" checked={settings.chat} onChange={e=>void save({chat:e.target.checked})}/></label></section>
 <section className="account-card"><label className="notification-option"><span><strong>알림에 내용 미리 보기</strong><small>켠 경우 일정 제목·대화 내용이 기기 알림과 잠금화면에 표시될 수 있어요.</small></span><input type="checkbox" role="switch" checked={settings.preview} onChange={e=>void save({preview:e.target.checked})}/></label></section></fieldset>
 <p className="notification-footnote">수신 항목은 계정의 모든 연결 기기에 적용돼요. 시간표·학원비·메모는 푸시 알림을 보내지 않아요. 로그아웃하거나 로그인이 만료되면 다시 로그인하고 기기 알림을 연결해 주세요. 기기의 절전·방해금지·네트워크 상태에 따라 수신이 지연될 수 있어요.</p>
 </> }</div></AuthLayout>;
}

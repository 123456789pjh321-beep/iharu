import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {AuthLayout,FormNotice} from '../components/AuthLayout';
import {Loading} from '../components/Common';
import {useSharedSession} from '../components/WorkspaceGate';

const packageId='com.myiharu.app';

export function AndroidWidgetLink(){
 const session=useSharedSession(),[params]=useSearchParams();
 const challenge=params.get('challenge')||'',valid=/^[A-Za-z0-9_-]{43}$/.test(challenge);
 const [showTitles,setShowTitles]=useState(false),[grant,setGrant]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const account=session.data;
 const next='/android/widgets?challenge='+encodeURIComponent(challenge);
 useEffect(()=>{if(!grant)return;const timer=window.setTimeout(()=>setGrant(''),120_000);return()=>window.clearTimeout(timer);},[grant]);
 async function link(){
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/v1/android-widget/link',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge,showTitles}),
   });
   if(!response.ok)throw Error(response.status===401?'로그인 후 다시 연결해 주세요.':'연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
   const data=await response.json();
   if(typeof data.grant!=='string'||!/^[A-Za-z0-9_-]{60,700}$/.test(data.grant))throw Error('연결 정보를 확인할 수 없어요.');
   setGrant(data.grant);
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 return <AuthLayout><div className="auth-title"><h1>안드로이드 위젯 연결</h1></div>
  {!valid?<p>홈 화면의 아이하루 위젯 설정에서 연결을 시작해 주세요.</p>
   :session.loading?<Loading/>
   :session.error?<FormNotice error={session.error}/>
   :!account?.authenticated||account.assurance!=='HIGH'||!account.emailVerified?<Link className="button primary" to={'/login?next='+encodeURIComponent(next)}>로그인하고 연결</Link>
   :<div className="auth-form">
    <p>이 기기의 홈 화면에서 달력과 주간 시간표를 확인합니다. 연결이 만료되면 위젯 설정에서 다시 연결할 수 있어요.</p>
    {grant?<a className="button primary" href={'intent://connect#Intent;scheme=iharu-widget;package='+packageId+';S.grant='+grant+';end'}>아이하루 위젯에 연결</a>:<>
     <label className="check-option"><input type="checkbox" checked={showTitles} disabled={busy} onChange={e=>setShowTitles(e.target.checked)}/><span>시간표 위젯에 일정 제목 표시</span></label>
     <button type="button" className="button primary" disabled={busy} onClick={()=>void link()}>연결 준비</button>
    </>}
    <FormNotice error={error}/>
   </div>}
 </AuthLayout>;
}

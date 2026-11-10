import {useEffect,useId,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {authPost,methodsSchema,methodNames,startSocial} from '../auth';
import {useApi} from '../api';
import {FormNotice} from './AuthLayout';
import {Loading,ErrorState} from './Common';
type Props={returnTo:string;verified:()=>void;redirecting:()=>void;disabled?:boolean};
/** Reconfirm with an already linked method. No API key or pending write survives OAuth. */
export function AdminReauthentication({returnTo,verified,redirecting,disabled=false}:Props){
 const titleId=useId();
 const methods=useApi('/api/account/methods',methodsSchema),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),socialPending=useRef(false);
 useEffect(()=>{const restore=(event:PageTransitionEvent)=>{if(event.persisted&&socialPending.current){socialPending.current=false;lock.current=false;setBusy(false);}};window.addEventListener('pageshow',restore);return()=>window.removeEventListener('pageshow',restore);},[]);
 async function confirm(event:FormEvent){event.preventDefault();if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');try{await authPost('/api/account/reauthenticate',{password});setPassword('');verified();}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 async function social(provider:string){if(lock.current||disabled)return;lock.current=true;socialPending.current=true;setBusy(true);setError('');setPassword('');redirecting();try{await startSocial(provider,false,true,returnTo);}catch(e){socialPending.current=false;lock.current=false;setBusy(false);setError((e as Error).message);}}
 if(methods.loading)return <Loading label="연결된 본인 확인 방법을 확인하고 있어요"/>;
 if(methods.error)return <ErrorState message={methods.error} retry={methods.retry}/>;
 const linked=methods.data?.methods.filter(m=>m.canReauthenticate!==false)||[],hasPassword=linked.some(m=>m.provider==='credential'),socialMethods=[...new Set(linked.map(m=>m.provider).filter(p=>['google','kakao','naver'].includes(p)))];
 return <section className="admin-reauth-panel" aria-labelledby={titleId}><h3 id={titleId}>로그인한 계정으로 본인 확인</h3><p>연결된 로그인 방법으로 확인해 주세요. 구글·카카오·네이버만 사용하는 계정에는 아이하루 비밀번호가 필요하지 않아요.</p><FormNotice error={error}/>
 <div className="admin-reauth-social">{socialMethods.map(provider=><button type="button" key={provider} className="button" disabled={disabled||busy} onClick={()=>void social(provider)}>{methodNames[provider]}로 본인 확인</button>)}</div>
 {socialMethods.length>0&&<p className="account-caption">같은 관리자 계정을 선택해 주세요. 소셜 인증 후 이 설정으로 돌아오며, API 키는 안전을 위해 다시 입력해야 해요. 입력한 키나 변경 작업을 구글 등에 전달하거나 자동 적용하지 않아요.</p>}
 {hasPassword&&<form className="auth-form" onSubmit={confirm}><label className="form-field">아이하루 비밀번호<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={128} autoComplete="current-password" disabled={disabled||busy}/></label><button className="button" type="submit" disabled={disabled||busy}>{busy?'확인 중…':'비밀번호로 본인 확인'}</button></form>}
 {!hasPassword&&!socialMethods.length&&<p>이 화면에서 사용할 본인 확인 방법을 찾지 못했어요. <Link to={'/login?reauth=1&next='+encodeURIComponent(returnTo)}>같은 계정으로 다시 로그인</Link>한 뒤 이어가 주세요.</p>}
 </section>;
}

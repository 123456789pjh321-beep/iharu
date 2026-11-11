import {useEffect,useState,type FormEvent} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {AuthLayout,FormNotice,LoginActions,PasswordField} from '../components/AuthLayout';
import {Icon} from '../components/Icon';
import {workspaceRequest} from '../workspace-api';
import type {WorkspaceMe} from '../../../shared/workspace';
import {entryReturnPath} from '../../../shared/entry-intent';
export function LoginRoleTabs({child=false,signup=false}:{child?:boolean;signup?:boolean}){const next=entryReturnPath(new URLSearchParams(useLocation().search).get('next')),suffix='&next='+encodeURIComponent(next);return <nav className="auth-role-tabs" aria-label={signup?'회원가입 대상':'로그인 대상'}><Link to={(signup?'/signup?role=parent':'/login?role=parent')+suffix} aria-current={!child?'page':undefined}><Icon name="shield"/>일반사용자</Link><Link to={(signup?'/signup?role=child':'/login?role=child')+suffix} aria-current={child?'page':undefined}><Icon name="sun"/>어린이</Link></nav>;}
export function ChildAccountPage({inline=false,returnTo,onAuthenticated,onBusy}:{inline?:boolean;returnTo?:string;onAuthenticated?:()=>Promise<void>;onBusy?:(busy:boolean)=>void}={}){
 const location=useLocation(),signup=!inline&&location.pathname==='/signup',navigate=useNavigate(),next=entryReturnPath(returnTo||new URLSearchParams(location.search).get('next'));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[parentHere,setParentHere]=useState(false);
 useEffect(()=>{let alive=true;workspaceRequest<WorkspaceMe>('me').then(me=>{if(!alive)return;if(me.role==='CHILD'&&!inline)navigate(next,{replace:true});else if(me.role==='PARENT')setParentHere(true);}).catch(()=>{});return()=>{alive=false;};},[navigate,next,inline]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;
  const data=new FormData(e.currentTarget);setBusy(true);onBusy?.(true);setError('');
  try{
   await workspaceRequest('child.login',{loginId:String(data.get('loginId')).trim(),password:data.get('password')});
   if(onAuthenticated)await onAuthenticated();else navigate(next,{replace:true});
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);onBusy?.(false);}
 }
 if(signup)return <AuthLayout><div className="auth-title"><h1>어린이 회원가입</h1><p>보호자가 보낸 아이하루 초대 링크를 카카오톡이나 문자에서 열어 주세요. 링크에서 내 아이디와 암호를 만들 수 있어요.</p></div><Link className="button full" to={'/login?role=child&next='+encodeURIComponent(next)}>이미 가입했어요 · 어린이 로그인</Link></AuthLayout>;
 return <AuthLayout><FormNotice error={error}/>{parentHere&&<p className="auth-notice" role="status">일반사용자가 로그인한 기기예요. 어린이 기기에서 로그인해 주세요.</p>}
  <form className="auth-form child-account-form auth-login-form" onSubmit={submit}><fieldset disabled={busy||parentHere}><legend className="sr-only">로그인</legend>
   <div className="form-field"><label htmlFor="child-login-id">아이디</label><input id="child-login-id" name="loginId" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={4} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9_]{3,19}" placeholder="아이디를 입력해 주세요"/></div>
   <PasswordField minimum={1}/><LoginActions busy={busy} child next={next}/>
  </fieldset></form>
 </AuthLayout>;
}

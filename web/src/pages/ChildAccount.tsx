import {useEffect,useState,type FormEvent} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {AuthLayout,FormNotice,PasswordField} from '../components/AuthLayout';
import {Icon} from '../components/Icon';
import {workspaceRequest} from '../workspace-api';
import type {WorkspaceMe} from '../../../shared/workspace';
export function LoginRoleTabs({child=false}:{child?:boolean}){return <nav className="auth-role-tabs" aria-label="로그인 대상"><Link to="/login" aria-current={!child?'page':undefined}><Icon name="shield"/>이메일·플랫폼</Link><Link to="/login?role=child" aria-current={child?'page':undefined}><Icon name="sun"/>아이디</Link></nav>;}
export function ChildAccountPage(){
 const signup=useLocation().pathname==='/signup',navigate=useNavigate();
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[parentHere,setParentHere]=useState(false);
 useEffect(()=>{let alive=true;workspaceRequest<WorkspaceMe>('me').then(me=>{if(!alive)return;if(me.role==='CHILD')navigate('/today',{replace:true});else setParentHere(true);}).catch(()=>{});return()=>{alive=false;};},[navigate]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;const data=new FormData(e.currentTarget);setBusy(true);setError('');try{await workspaceRequest(signup?'child.signup':'child.login',{loginId:String(data.get('loginId')).trim(),password:data.get('password'),...(signup?{name:String(data.get('name')).trim(),code:String(data.get('code')).trim()}:{} )});navigate('/today'+(signup?'?joined=1':''),{replace:true});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <AuthLayout><LoginRoleTabs child/>{signup&&<div className="auth-title"><h1>회원가입</h1></div>}<FormNotice error={error}/>{parentHere&&<p className="auth-notice" role="status">보호자가 로그인한 기기예요. 자녀 기기에서 가입·로그인해 주세요.</p>}
 <form className="auth-form child-account-form" onSubmit={submit}><fieldset disabled={busy||parentHere}><legend className="sr-only">아이디 {signup?'회원가입':'로그인'}</legend><div className="form-field"><label htmlFor="child-login-id">아이디</label><input id="child-login-id" name="loginId" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={4} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9_]{3,19}" placeholder="영문·숫자·밑줄, 4~20자"/></div>{signup&&<div className="form-field"><label htmlFor="child-display-name">이름</label><input id="child-display-name" name="name" autoComplete="name" required maxLength={24} placeholder="예: 서준"/></div>}<PasswordField fresh={signup} minimum={signup?8:1}/>{signup&&<div className="form-field"><label htmlFor="parent-approval-number">부모 승인번호</label><input id="parent-approval-number" name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="부모가 발급한 6자리 번호"/><small>부모가 로그인한 뒤 가족 관리에서 발급해요. 가입하면 그 부모의 가족으로 바로 연결돼요.</small></div>}<button className="button primary full" type="submit">{busy?'확인하고 있어요':signup?'가입하고 가족 연결':'로그인'}</button></fieldset></form>
 {!signup?<Link className="button full signup-under-login" to="/signup?role=child">회원가입</Link>:<Link className="auth-back" to="/login?role=child">이미 가입했어요 · 로그인 <Icon name="arrow"/></Link>}
 </AuthLayout>;
}

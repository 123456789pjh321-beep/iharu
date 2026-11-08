import {useEffect,useState,type FormEvent} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {AuthLayout,FormNotice,LoginActions,PasswordField} from '../components/AuthLayout';
import {Icon} from '../components/Icon';
import {workspaceRequest} from '../workspace-api';
import type {WorkspaceMe} from '../../../shared/workspace';
export function LoginRoleTabs({child=false,signup=false}:{child?:boolean;signup?:boolean}){return <nav className="auth-role-tabs" aria-label={signup?'회원가입 대상':'로그인 대상'}><Link to={signup?'/signup?role=parent':'/login'} aria-current={!child?'page':undefined}><Icon name="shield"/>학부모</Link><Link to={signup?'/signup?role=child':'/login?role=child'} aria-current={child?'page':undefined}><Icon name="sun"/>자녀</Link></nav>;}
export function ChildAccountPage(){
 const signup=useLocation().pathname==='/signup',navigate=useNavigate();
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[parentHere,setParentHere]=useState(false);
 useEffect(()=>{let alive=true;workspaceRequest<WorkspaceMe>('me').then(me=>{if(!alive)return;if(me.role==='CHILD')navigate('/timetable',{replace:true});else setParentHere(true);}).catch(()=>{});return()=>{alive=false;};},[navigate]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;const data=new FormData(e.currentTarget);setBusy(true);setError('');try{await workspaceRequest(signup?'child.signup':'child.login',{loginId:String(data.get('loginId')).trim(),password:data.get('password'),...(signup?{name:String(data.get('name')).trim(),code:String(data.get('code')).trim()}:{} )});navigate('/timetable'+(signup?'?joined=1':''),{replace:true});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <AuthLayout>{signup&&<div className="auth-title"><h1>자녀 회원가입</h1><p>내 아이디와 부모가 발급한 승인번호로 가입해요.</p></div>}<FormNotice error={error}/>{parentHere&&<p className="auth-notice" role="status">보호자가 로그인한 기기예요. 자녀 기기에서 가입·로그인해 주세요.</p>}
 <form className={`auth-form child-account-form ${signup?'':'auth-login-form'}`} onSubmit={submit}><fieldset disabled={busy||parentHere}><legend className="sr-only">{signup?'회원가입':'로그인'}</legend><div className="form-field"><label htmlFor="child-login-id">아이디</label><input id="child-login-id" name="loginId" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={4} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9_]{3,19}" placeholder={signup?'영문·숫자·밑줄, 4~20자':'아이디를 입력해 주세요'}/></div>{signup&&<div className="form-field"><label htmlFor="child-display-name">이름</label><input id="child-display-name" name="name" autoComplete="name" required maxLength={24} placeholder="예: 서준"/></div>}<PasswordField fresh={signup} minimum={signup?8:1}/>{signup&&<div className="form-field"><label htmlFor="parent-approval-number">부모 승인번호</label><input id="parent-approval-number" name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="부모가 발급한 6자리 번호"/><small>부모가 로그인한 뒤 가족 관리에서 발급해요. 가입하면 그 부모의 가족으로 바로 연결돼요.</small></div>}{signup?<button className="button primary full" type="submit">{busy?'확인하고 있어요':'가입하고 가족 연결'}</button>:<LoginActions busy={busy} child/>}</fieldset></form>
 {signup&&<Link className="auth-back" to="/login?role=child">이미 가입했어요 · 로그인 <Icon name="arrow"/></Link>}
 </AuthLayout>;
}

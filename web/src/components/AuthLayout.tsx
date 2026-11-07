import {WorkspaceTabs} from './WorkspaceTabs';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {WorkspaceBrand,WorkspaceNavigation} from './WorkspaceNavigation';
import { Icon } from './Icon';
import {DisplaySettings,Entrance,FamilyArtwork} from './Experience';

export function AuthLayout({ children, wide:requestedWide = false,personalChild=false }: { children: ReactNode; wide?: boolean;personalChild?:boolean }) {
  const { pathname } = useLocation();
  const wide=requestedWide||['/account','/family','/device','/child','/phone'].some(p=>pathname.startsWith(p));
  const [large, setLarge] = useState(() => { try { return localStorage.getItem('iharu:large-type') === 'true'; } catch { return false; } });
  useEffect(() => { document.documentElement.classList.toggle('large-type',large); try { localStorage.setItem('iharu:large-type',String(large)); } catch { /* optional preference */ } }, [large]);
  useEffect(() => { document.title = `${pathname.startsWith('/family')?'우리 가족':pathname.startsWith('/device')||pathname.startsWith('/child')?'아이 기기':'로그인과 계정'} · 아이하루`; document.getElementById('auth-main')?.scrollTo(0,0); document.getElementById('auth-main')?.focus({preventScroll:true}); }, [pathname]);
  return <div className={`auth-app ${wide?'workspace-page':'entry-page'}`}><a className="skip-link" href="#auth-main">본문 바로가기</a>
    <header className="auth-header"><WorkspaceBrand/><span className="auth-header-caption">가족의 하루를 잇다</span><div className="auth-display-actions"><DisplaySettings/><button className="font-toggle" aria-label="큰 글씨" aria-pressed={large} onClick={()=>setLarge(v=>!v)}><Icon name="type"/><span>큰 글씨</span></button></div></header>
    {!wide&&<div className="test-entry-banner"><span>기능을 먼저 살펴보세요</span><Link to="/test/today">인증 없이 기능 테스트<Icon name="arrow"/></Link></div>}
    {wide&&<WorkspaceNavigation personalChild={personalChild} childMode={!personalChild&&(pathname.startsWith('/child')||pathname.startsWith('/device'))}/> }
    <main id="auth-main" tabIndex={-1} className={`auth-main ${wide?'auth-wide':''}`}>
      {!wide && <aside className="auth-intro"><span className="eyebrow">가족의 하루를 잇다</span><h1>서로의 하루에<br/>조금 더 가까이.</h1><p>챙겨야 할 일정도, 전하고 싶은 마음도.<br/>가족이 함께하는 하루를 시작하세요.</p><FamilyArtwork/><div className="auth-trust"><Icon name="shield"/><span>자녀 정보는 보호자의 번호 확인과 동의 후 연결해요.</span></div></aside>}
      <Entrance key={pathname} className="auth-panel">{wide&&["/account","/phone"].some(p=>pathname.startsWith(p))&&<WorkspaceTabs group="family"/>}{children}</Entrance>
    </main><footer className="auth-footer">아이하루 · 가족의 하루를 잇다 <Link to="/login?role=child">자녀 로그인</Link></footer>
  </div>;
}
export function PasswordField({ label='비밀번호', name='password', fresh=false,minimum }: { label?:string; name?:string; fresh?:boolean;minimum?:number }) {
  const [visible,setVisible] = useState(false);
  return <div className="form-field"><label htmlFor={name}>{label}</label><div className="password-field"><input id={name} name={name} type={visible?'text':'password'} minLength={minimum??(fresh?12:1)} maxLength={128} required autoComplete={fresh?'new-password':'current-password'} aria-describedby={fresh?`${name}-hint`:undefined}/><button type="button" aria-pressed={visible} onClick={()=>setVisible(v=>!v)} aria-label={visible?'비밀번호 숨기기':'비밀번호 표시'}>{visible?'숨기기':'표시'}</button></div>{fresh&&<small id={`${name}-hint`}>{minimum??12}~128자로 입력해 주세요. 붙여넣기도 가능해요.</small>}</div>;
}
export function FormNotice({ error, message }: { error?:string; message?:string }) {
  return <>{error&&<div className="auth-notice error" role="alert">{error}</div>}{message&&<div className="auth-notice" role="status">{message}</div>}</>;
}



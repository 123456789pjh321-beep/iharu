import {useId,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {Icon} from './Icon';
import '../public-header.css';

const links=[['/service','서비스'],['/guide','활용방법'],['/notices','공지사항'],['/blog','블로그']];

export function PublicBrand(){
 return <Link className="market-brand" to="/service" aria-label="아이하루 서비스 소개"><span><Icon name="sun"/></span><strong>아이하루<small>FAMILY WORKSPACE</small></strong></Link>;
}

/** One header for introduction pages and account entry, including mobile navigation. */
export function PublicHeader(){
 const {pathname}=useLocation(),navId=useId(),toggle=useRef<HTMLButtonElement>(null);
 const [openPath,setOpenPath]=useState<string|null>(null),open=openPath===pathname;
 const close=()=>setOpenPath(null);
 return <header className="market-header" onKeyDown={event=>{if(event.key==='Escape'&&open){close();toggle.current?.focus();}}}>
  <div className="market-container">
   <PublicBrand/>
   <nav id={navId} className={'market-nav'+(open?' open':'')} aria-label="아이하루 소개 메뉴" onClick={close}>
    {links.map(([to,label])=><Link key={to} to={to} aria-current={pathname===to||pathname.startsWith(to+'/')?'page':undefined}>{label}</Link>)}
   </nav>
   <div className="market-header-actions">
    <Link to="/login" className="market-login" aria-current={pathname==='/login'?'page':undefined} onClick={close}>로그인</Link>
    <Link to="/signup" className="market-signup" aria-current={pathname==='/signup'?'page':undefined} onClick={close}>시작하기 <Icon name="arrow"/></Link>
    <button ref={toggle} type="button" className="market-menu-button" aria-label={open?'소개 메뉴 닫기':'소개 메뉴 열기'} aria-expanded={open} aria-controls={navId} onClick={()=>setOpenPath(open?null:pathname)}><Icon name={open?'close':'menu'}/></button>
   </div>
  </div>
 </header>;
}

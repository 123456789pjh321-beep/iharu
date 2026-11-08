import {createContext,useContext,useLayoutEffect,useRef} from 'react';
import {Link,Outlet,useLocation} from 'react-router-dom';
import {PublicHeader} from './PublicHeader';
import '../public-frame.css';

const PublicFrameContext=createContext(false);
export const useInPublicFrame=()=>useContext(PublicFrameContext);
export function PublicFooter(){return <footer className="public-footer"><span>아이하루 · 가족의 하루를 잇다</span><nav aria-label="공통 하단 메뉴"><Link to="/service">서비스 소개</Link><Link to="/guide">활용방법</Link><Link to="/notices">공지사항</Link><Link to="/blog">블로그</Link><Link to="/legal/terms">이용약관</Link><Link to="/legal/privacy">개인정보처리방침</Link><Link to="/privacy">개인정보 관리</Link></nav></footer>;}

/** Route changes replace only the middle pane; header and footer stay mounted. */
export function PublicFrame(){
 const {pathname,search,hash}=useLocation(),content=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{if(!hash)content.current?.scrollTo({top:0,behavior:'instant'});},[pathname,search,hash]);
 return <PublicFrameContext.Provider value><div className="public-frame"><PublicHeader/><div className="public-content" ref={content}><Outlet/></div><PublicFooter/></div></PublicFrameContext.Provider>;
}

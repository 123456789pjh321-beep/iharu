import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Link,Outlet,useLocation} from 'react-router-dom';
import {PublicHeader} from './PublicHeader';
import '../public-frame.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '../public-theme.css';

const PublicFrameContext=createContext(false);
export const useInPublicFrame=()=>useContext(PublicFrameContext);
export function PublicFooter({motion,toggleMotion,reduced}:{motion:boolean;toggleMotion:()=>void;reduced:boolean}){return <footer className="public-footer"><span>아이하루 · 그룹의 하루를 잇다</span><nav aria-label="공통 하단 메뉴"><Link to="/service">서비스 소개</Link><Link to="/guide">활용방법</Link><Link to="/notices">공지사항</Link><Link to="/blog">블로그</Link><Link to="/legal/terms">이용약관</Link><Link to="/legal/privacy">개인정보처리방침</Link><Link to="/privacy">개인정보 관리</Link></nav><button className="public-motion" type="button" aria-label="화면 움직임" aria-pressed={motion} disabled={reduced} title={reduced?'기기의 움직임 줄이기 설정을 따르고 있어요':undefined} onClick={toggleMotion}><i aria-hidden="true"/>움직임 {motion?'켜짐':'꺼짐'}</button></footer>;}

/** Route changes replace only the middle pane; header and footer stay mounted. */
export function PublicFrame(){
 const {pathname,search,hash}=useLocation(),content=useRef<HTMLDivElement>(null);
 const [paused,setPaused]=useState(()=>{try{return localStorage.getItem('iharu-public-motion')==='off';}catch{return false;}});
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 const toggleMotion=()=>{const next=!paused;setPaused(next);try{localStorage.setItem('iharu-public-motion',next?'off':'on');}catch{/* The preference still works when storage is unavailable. */}};
 useLayoutEffect(()=>{if(!hash)content.current?.scrollTo({top:0,behavior:'instant'});},[pathname,search,hash]);
 return <PublicFrameContext.Provider value><div className="public-frame" data-motion={!paused&&!reduced?'on':'off'}><PublicHeader/><div className="public-content" ref={content}><Outlet/></div><PublicFooter motion={!paused&&!reduced} toggleMotion={toggleMotion} reduced={reduced}/></div></PublicFrameContext.Provider>;
}

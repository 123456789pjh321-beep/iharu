import {createContext,useContext,useLayoutEffect,useState,type ReactNode} from 'react';
import {LazyMotion,domAnimation,MotionConfig,m} from 'motion/react';
import {Icon} from './Icon';
type Preferences={theme:'light'|'dark';quiet:boolean;font:'noto'};
const defaults:Preferences={theme:'light',quiet:false,font:'noto'};
const Context=createContext<{preferences:Preferences;setPreference:(p:Partial<Preferences>)=>void}>({preferences:defaults,setPreference:()=>{}});
function readPreferences():Preferences{try{const p=JSON.parse(localStorage.getItem('iharu:appearance')||'null');return {theme:p?.theme==='dark'?'dark':'light',quiet:p?.quiet===true,font:'noto'};}catch{return defaults;}}
export function ExperienceProvider({children}:{children:ReactNode}){
 const [preferences,setPreferences]=useState(readPreferences);
 useLayoutEffect(()=>{document.documentElement.dataset.theme=preferences.theme;document.documentElement.dataset.motion=preferences.quiet?'reduced':'full';document.documentElement.dataset.font='noto';document.documentElement.classList.remove('large-type');try{localStorage.setItem('iharu:appearance',JSON.stringify({...preferences,font:'noto'}));localStorage.removeItem('iharu:large-type');}catch{/* Optional display preferences. */}},[preferences]);
 return <Context.Provider value={{preferences,setPreference:p=>setPreferences(current=>({...current,...p}))}}><LazyMotion features={domAnimation} strict><MotionConfig reducedMotion={preferences.quiet?'always':'user'} transition={{duration:.28,ease:[.22,1,.36,1]}}>{children}</MotionConfig></LazyMotion></Context.Provider>;
}
export function useExperience(){return useContext(Context);}
export function DisplaySettings(){
 const {preferences,setPreference}=useContext(Context);
 return <div className="theme-toggle" role="group" aria-label="화면 밝기"><button type="button" aria-pressed={preferences.theme==='light'} onClick={()=>setPreference({theme:'light'})}><Icon name="sun"/><span>밝게</span></button><button type="button" aria-pressed={preferences.theme==='dark'} onClick={()=>setPreference({theme:'dark'})}><Icon name="moon"/><span>어둡게</span></button></div>;
}
/** Enter-only: no exit delay or route remount. */
export function Entrance({children,className=''}:{children:ReactNode;className?:string}){return <m.div className={className} initial={false} animate={{opacity:1}}>{children}</m.div>;}
export function FamilyArtwork(){return <div className="family-artwork" aria-hidden="true"><div className="art-orbit art-orbit-one"/><div className="art-orbit art-orbit-two"/><div className="art-calendar"><div className="art-card-label"><Icon name="calendar"/><span>함께 챙기는 일정</span><span className="art-dot"/></div><div className="art-calendar-days">{['월','화','수','목','금'].map((d,i)=><span key={d} className={i===2?'selected':''}><small>{d}</small><i/></span>)}</div><div className="art-schedule-line"><b/><span/><i/></div><div className="art-schedule-line second"><b/><span/><i/></div></div><div className="art-message"><span className="art-message-icon"><Icon name="chat"/></span><div><strong>그림으로 전하는 마음</strong><span>짧은 소식도, 가족과 함께</span></div><Icon name="check"/></div><div className="art-family-badge"><Icon name="home"/><span>가족의 하루를 잇다</span></div><span className="art-spark spark-one">✦</span><span className="art-spark spark-two">✧</span></div>}

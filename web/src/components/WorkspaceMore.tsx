import {Link} from 'react-router-dom';
import type {WorkspaceMe} from '../../../shared/workspace';
import {hasMenuUpdate,menuForPath} from '../../../shared/workspace-updates';
import {Icon,type IconName} from './Icon';
import {DisplaySettings,useExperience} from './Experience';
import {useOptionalWorkspaceGate} from './WorkspaceGate';
import {GroupInviteShareButton} from './GroupInviteShare';
import {BriefingLocationSettings} from './BriefingLocation';
import {useRef,useState} from 'react';
import {WorkspaceToolbar} from './WorkspaceToolbar';
function GuideArtwork({group=false}:{group?:boolean}){
 return <svg className="more-guide-artwork" viewBox="0 0 160 106" aria-hidden="true"><path d="M6 72c-9-17 7-31 22-24 2-19 30-24 39-8 16-7 33 4 30 19h24c25 0 27 29 7 29H22C8 88 3 82 6 72Z" fill="var(--guide-cloud)"/><rect x="48" y="10" width="60" height="90" rx="9" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2.5"/><path d="M65 10h26l-3 6H68Z" fill="var(--ink)"/><rect x="58" y="30" width="40" height="12" rx="3" fill="var(--mint)"/>{[0,1,2,3,4,5,6,7,8].map(n=><rect key={n} x={60+n%3*12} y={50+Math.floor(n/3)*12} width="6" height="5" rx="1" fill={n===4?'var(--primary)':'var(--guide-line)'}/>)}<circle cx="32" cy="67" r="10" fill="var(--guide-person)"/><path d="M18 103V86c0-14 27-15 27 0v17" fill="var(--guide-accent)"/><path d="m43 85 13-12" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round"/><circle cx="128" cy="73" r="9" fill="var(--guide-person)"/><path d="M116 104V90c0-13 25-13 25 0v14" fill={group?'var(--guide-accent)':'var(--guide-line)'}/><path d="m117 89-12-11" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round"/></svg>;
}
function MoreGuides(){
 const strip=useRef<HTMLDivElement>(null),[active,setActive]=useState(0);
 const guides=[{to:'/help',title:'빠른 시작 가이드',text:'아이하루를 함께 시작해요'},{to:'/family',title:'우리 그룹 연결하기',text:'가족과 일정을 공유해요'}];
 return <div className="more-guide-area"><div ref={strip} className="more-guide-strip" aria-label="아이하루 시작 안내" onScroll={e=>{const node=e.currentTarget;if(node.clientWidth)setActive(Math.round(node.scrollLeft/node.clientWidth));}}>{guides.map((guide,n)=><Link className="more-guide-banner" to={guide.to} key={guide.to}><GuideArtwork group={n===1}/><span><strong>{guide.title}</strong><small>{guide.text}</small></span></Link>)}</div><div className="more-guide-pages" role="group" aria-label="시작 안내 페이지">{guides.map((guide,n)=><button type="button" key={guide.to} aria-label={guide.title+' 보기'} aria-pressed={active===n} onClick={()=>{const node=strip.current;if(node)node.scrollTo({left:n*node.clientWidth,behavior:'auto'});}}><span/></button>)}</div></div>;
}
export function WorkspaceMore({me}:{me:WorkspaceMe|null}){
 const gate=useOptionalWorkspaceGate();
 const shortcuts:{to:string;label:string;icon:IconName}[]=[
  {to:'/help',label:'사용 가이드',icon:'book'},{to:'/family',label:'그룹관리',icon:'users'},{to:'/settings',label:'설정',icon:'settings'},
  {to:'/more/notices',label:'공지사항',icon:'calendar'},{to:'/notification-settings',label:'알림',icon:'bell'},
  gate?.adminAllowed?{to:'/admin',label:'시스템관리',icon:'shield'}:{to:'/more/blog',label:'블로그',icon:'sun'},
 ];
 return <><WorkspaceToolbar title="더보기">{me&&<GroupInviteShareButton/>}</WorkspaceToolbar><section className="more-screen" aria-label="더보기">
  <MoreGuides/>
  <nav className="more-shortcuts" aria-label="더보기 메뉴">{shortcuts.map(item=><Link key={item.to} to={item.to}><span><Icon name={item.icon}/>{hasMenuUpdate(gate?.updates||null,menuForPath(item.to))&&<i className="more-update-dot" aria-label="새 업데이트"/>}</span><strong>{item.label}</strong></Link>)}</nav>
  <div className="more-section"><h2>계정</h2><div className="more-group"><Link to="/account" className="more-account"><span className="more-avatar"><Icon name="users"/></span><span><strong>{me?.name||'로그인하고 함께해요'}</strong><small>{me?'아이하루 계정'+(me.family?' · '+me.family.name:''):'내 계정과 그룹 정보를 확인하세요.'}</small></span></Link><Link to="/account" className="more-row">계정 관리<Icon name="chevron"/></Link></div><div className="more-group more-privacy-group"><Link to="/privacy" className="more-row">개인정보 관리<Icon name="chevron"/></Link></div><p className="more-account-note">내 정보와 그룹의 공유 범위를 확인하세요.</p></div>
  <div className="more-section"><h2>아이하루 정보</h2><div className="more-group">{[{to:'/more/service',label:'서비스 소개'},{to:'/legal/terms',label:'이용약관'},{to:'/legal/privacy',label:'개인정보처리방침'},{to:'/account-deletion',label:'계정 삭제 요청'}].map(item=><Link key={item.to} to={item.to} className="more-row">{item.label}<Icon name="chevron"/></Link>)}</div></div>
  <p className="more-signature">iHaru · 그룹의 하루를 잇다</p>
 </section></>;
}
export function WorkspaceSettings(){
 const {preferences,setPreference}=useExperience();
 const gate=useOptionalWorkspaceGate();
 return <section className="more-screen settings-screen" aria-labelledby="settings-title"><div className="settings-heading"><Link to="/more" className="icon-button" aria-label="더보기로 돌아가기"><Icon name="arrow" className="flip"/></Link><h1 id="settings-title">설정</h1><GroupInviteShareButton/></div>
  <div className="more-section"><h2>화면</h2><div className="more-group"><div className="settings-row"><div><strong>화면 밝기</strong><p>편안하게 볼 수 있는 화면을 선택해요.</p></div><DisplaySettings/></div><div className="settings-row"><div><strong id="quiet-label">움직임 줄이기</strong><p id="quiet-help">전환 효과를 줄이고 바로 이동해요.</p></div><button type="button" role="switch" aria-checked={preferences.quiet} aria-labelledby="quiet-label" aria-describedby="quiet-help" className="setting-switch" onClick={()=>setPreference({quiet:!preferences.quiet})}><span/></button></div></div><p className="settings-note">화면 설정은 이 기기에 저장됩니다. 기기의 ‘동작 줄이기’ 설정도 함께 적용돼요.</p></div>
  <BriefingLocationSettings/>
  {gate?.access.identity?.role!=='CHILD'&&<div className="more-section"><h2>AI 브리핑</h2><div className="more-group"><Link className="more-row" to="/briefing?settings=1"><span><Icon name="settings"/>브리핑 설정</span><Icon name="chevron"/></Link><Link className="more-row" to="/briefing?view=saved"><span><Icon name="bookmark"/>보관한 소식</span><Icon name="chevron"/></Link></div></div>}
  <div className="more-section"><h2>알림과 도움말</h2><div className="more-group"><Link className="more-row" to="/notification-settings"><span><Icon name="bell"/>알림설정</span><Icon name="chevron"/></Link><Link className="more-row" to="/help"><span><Icon name="book"/>사용 가이드</span><Icon name="chevron"/></Link></div></div>
 </section>;
}

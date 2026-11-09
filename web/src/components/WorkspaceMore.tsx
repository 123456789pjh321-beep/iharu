import {Link} from 'react-router-dom';
import type {WorkspaceMe} from '../../../shared/workspace';
import {hasMenuUpdate,menuForPath} from '../../../shared/workspace-updates';
import {Icon,type IconName} from './Icon';
import {DisplaySettings,useExperience} from './Experience';
import {useOptionalWorkspaceGate} from './WorkspaceGate';
const shortcuts:{to:string;label:string;icon:IconName}[]=[
 {to:'/family',label:'그룹 관리',icon:'users'},{to:'/notification-settings',label:'알림설정',icon:'bell'},{to:'/settings',label:'설정',icon:'settings'},
 {to:'/help',label:'사용 가이드',icon:'book'},{to:'/more/notices',label:'공지사항',icon:'calendar'},{to:'/more/blog',label:'블로그',icon:'sun'},
];
export function WorkspaceMore({me}:{me:WorkspaceMe|null}){
 const gate=useOptionalWorkspaceGate();
 return <section className="more-screen" aria-labelledby="more-title"><h1 id="more-title">더보기</h1>
  <Link className="more-guide-banner" to="/help"><span className="more-banner-art" aria-hidden="true"><Icon name="home"/><i/><i/></span><span><small>그룹의 하루를 잇는 작은 습관</small><strong>함께 쓰면 더 편한 아이하루</strong><span>사용 가이드 살펴보기 <Icon name="arrow"/></span></span></Link>
  <nav className="more-shortcuts" aria-label="더보기 메뉴">{shortcuts.map(item=><Link key={item.to} to={item.to}><span><Icon name={item.icon}/>{hasMenuUpdate(gate?.updates||null,menuForPath(item.to))&&<i className="more-update-dot" aria-label="새 업데이트"/>}</span><strong>{item.label}</strong></Link>)}</nav>
  <div className="more-section"><h2>계정과 그룹</h2><div className="more-group"><Link to="/account" className="more-account"><span className="more-avatar"><Icon name="users"/></span><span><strong>{me?.name||'로그인하고 우리 그룹과 함께해요'}</strong><small>{me?(me.role==='CHILD'?'어린이 계정':'일반사용자 계정')+(me.family?' · '+me.family.name:''):'내 계정과 그룹 정보는 로그인 후 확인해요.'}</small></span><Icon name="chevron"/></Link><Link to="/account" className="more-row">계정 관리<Icon name="chevron"/></Link><Link to="/privacy" className="more-row">개인정보 관리<Icon name="chevron"/></Link></div></div>
  <div className="more-section"><h2>아이하루 정보</h2><div className="more-group">{[{to:'/more/service',label:'서비스 소개'},{to:'/legal/terms',label:'이용약관'},{to:'/legal/privacy',label:'개인정보처리방침'},...(gate?.adminAllowed?[{to:'/admin',label:'시스템 관리'}]:[])].map(item=><Link key={item.to} to={item.to} className="more-row">{item.label}<Icon name="chevron"/></Link>)}</div></div>
  <p className="more-signature">iHaru · 그룹의 하루를 잇다</p>
 </section>;
}
export function WorkspaceSettings(){
 const {preferences,setPreference}=useExperience();
 return <section className="more-screen settings-screen" aria-labelledby="settings-title"><div className="settings-heading"><Link to="/more" className="icon-button" aria-label="더보기로 돌아가기"><Icon name="arrow" className="flip"/></Link><h1 id="settings-title">설정</h1></div>
  <div className="more-section"><h2>화면</h2><div className="more-group"><div className="settings-row"><div><strong>화면 밝기</strong><p>편안하게 볼 수 있는 화면을 선택해요.</p></div><DisplaySettings/></div><div className="settings-row"><div><strong id="quiet-label">움직임 줄이기</strong><p id="quiet-help">전환 효과를 줄이고 바로 이동해요.</p></div><button type="button" role="switch" aria-checked={preferences.quiet} aria-labelledby="quiet-label" aria-describedby="quiet-help" className="setting-switch" onClick={()=>setPreference({quiet:!preferences.quiet})}><span/></button></div></div><p className="settings-note">화면 설정은 이 기기에 저장됩니다. 기기의 ‘동작 줄이기’ 설정도 함께 적용돼요.</p></div>
  <div className="more-section"><h2>알림과 도움말</h2><div className="more-group"><Link className="more-row" to="/notification-settings"><span><Icon name="bell"/>알림설정</span><Icon name="chevron"/></Link><Link className="more-row" to="/help"><span><Icon name="book"/>사용 가이드</span><Icon name="chevron"/></Link></div></div>
 </section>;
}

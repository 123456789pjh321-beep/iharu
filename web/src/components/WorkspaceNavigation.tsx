import {hasMenuUpdate,menuForPath} from '../../../shared/workspace-updates';
import {useEffect,useId,useRef} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useOptionalWorkspaceGate} from './WorkspaceGate';
import {Icon,type IconName} from './Icon';
import {BrandWordmark} from './BrandWordmark';
const links:{to:string;label:string;icon:IconName}[]=[
 {to:'/timetable',label:'시간표',icon:'clock'},
 {to:'/today/calendar',label:'달력',icon:'calendar'},
 {to:'/chat',label:'대화',icon:'chat'},
 {to:'/briefing',label:'AI 브리핑',icon:'sparkles'},
 {to:'/tuition',label:'가계부',icon:'wallet'},

 {to:'/notification-settings',label:'알림설정',icon:'bell'},
 {to:'/family',label:'그룹 관리',icon:'users'},
 {to:'/account',label:'내 계정',icon:'settings'},
 {to:'/privacy',label:'개인정보 관리',icon:'shield'},
 {to:'/legal/privacy',label:'개인정보처리방침',icon:'book'},
];
export function WorkspaceBrand({testMode=false,iconOnly=false}:{testMode?:boolean;iconOnly?:boolean}){return <Link to={testMode?'/test/today':'/timetable'} className={'brand workspace-brand workspace-wordmark'+(iconOnly?' compact-wordmark':'')} aria-label="아이하루"><BrandWordmark/></Link>;}
export function WorkspaceNavigation({childMode=false,testMode=false,personalChild=false}:{childMode?:boolean;testMode?:boolean;personalChild?:boolean}){
 const {pathname}=useLocation(),gate=useOptionalWorkspaceGate();
 personalChild=personalChild||gate?.workspaceRole==='CHILD';
 const dialog=useRef<HTMLDialogElement>(null),more=useRef<HTMLButtonElement>(null),dialogId=useId();
 useEffect(()=>{dialog.current?.close();},[pathname]);
 const testLinks:{to:string;label:string;icon:IconName}[]=[{to:'today',label:'오늘',icon:'home'},{to:'calendar',label:'달력',icon:'calendar'},{to:'daily',label:'등하원',icon:'bag'},{to:'repeats',label:'반복 일정',icon:'repeat'},{to:'chat',label:'대화',icon:'chat'},{to:'family',label:'관리',icon:'shield'},{to:'devices',label:'기기 연결',icon:'device'},{to:'location',label:'위치',icon:'pin'},{to:'fees',label:'가계부',icon:'wallet'},{to:'records',label:'메모',icon:'book'},{to:'notifications',label:'새 소식',icon:'bell'},{to:'account',label:'내 계정',icon:'settings'}];
 const standardLinks=gate?.adminAllowed?[...links,{to:'/admin',label:'관리',icon:'shield' as const}]:links;
 const items=testMode?testLinks.map(l=>({...l,to:'/test/'+l.to})):childMode?[{to:'/child/connected',label:'내 하루',icon:'home' as const},{to:'/child/schedules',label:'내 일정',icon:'calendar' as const},{to:'/child/chat',label:'대화',icon:'chat' as const}]:personalChild?links.filter(l=>!['/tuition','/briefing'].includes(l.to)).map(l=>({...l,to:l.to==='/chat'?'/child/chat':l.to})):standardLinks;
 const current=(to:string)=>testMode?pathname===to:to==='/account'?pathname.startsWith('/account')||pathname==='/settings':to==='/today/calendar'?pathname.includes('calendar')||pathname.includes('repeats'):to==='/child/chat'?pathname==='/chat'||pathname.startsWith('/child/chat'):pathname.startsWith(to);
 const hasUpdate=(to:string)=>!testMode&&!childMode&&hasMenuUpdate(gate?.updates||null,menuForPath(to));
 const updateDescription=dialogId+'-updates';
 const renderItem=(item:typeof items[number],close=false)=><Link key={item.to} to={item.to} onClick={close?()=>dialog.current?.close():undefined} className={current(item.to)?'active':''} aria-current={current(item.to)?'page':undefined} aria-describedby={hasUpdate(item.to)?updateDescription:undefined}><span className="rail-icon"><Icon name={item.icon}/>{hasUpdate(item.to)&&<span className="workspace-nav-update" aria-hidden="true"/>}</span><span>{item.label}</span>{current(item.to)&&<span className="rail-active-dot" aria-hidden="true"/>}</Link>;
 const primary=childMode&&!testMode?items:items.filter(item=>['/timetable','/today/calendar','/chat','/child/chat','/briefing','/tuition','/test/today','/test/calendar','/test/chat','/test/location'].includes(item.to));
 primary.sort((a,b)=>{const order=testMode?['오늘','달력','대화','위치']:['시간표','달력','대화','AI 브리핑','가계부'];return order.indexOf(a.label)-order.indexOf(b.label);});
 const extraUpdate=items.some(item=>!primary.includes(item)&&hasUpdate(item.to));
 const extraActive=!primary.some(item=>current(item.to));
 return <>
 <span id={updateDescription} className="sr-only">새 업데이트가 있어요</span>
 <nav className="workspace-mobile-nav" aria-label="모바일 주 메뉴">{primary.map(item=>renderItem(item))}{!testMode&&!childMode?<Link to="/more" className={extraActive?'active':''} aria-current={extraActive?'page':undefined} aria-describedby={extraUpdate?updateDescription:undefined}><span className="rail-icon"><Icon name="menu"/>{extraUpdate&&<span className="workspace-nav-update" aria-hidden="true"/>}</span><span>더보기</span></Link>:primary.length<items.length&&<button ref={more} type="button" className={extraActive?'active':''} aria-haspopup="dialog" aria-controls={dialogId} aria-describedby={extraUpdate?updateDescription:undefined} onClick={()=>dialog.current?.showModal()}><span className="rail-icon"><Icon name="menu"/>{extraUpdate&&<span className="workspace-nav-update" aria-hidden="true"/>}</span><span>더보기</span></button>}</nav>
 {testMode&&<dialog ref={dialog} id={dialogId} className="workspace-menu-dialog" aria-labelledby={dialogId+'-title'} onKeyDown={e=>{if(e.key!=='Tab')return;const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'));const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}} onCancel={()=>more.current?.focus()} onClick={e=>{if(e.target===e.currentTarget){dialog.current?.close();more.current?.focus();}}}>
 <div className="workspace-menu-heading"><div><h2 id={dialogId+'-title'}>전체 메뉴</h2></div><button type="button" className="icon-button" aria-label="전체 메뉴 닫기" onClick={()=>{dialog.current?.close();more.current?.focus();}}><Icon name="close"/></button></div>
 <nav className="workspace-menu-grid" aria-label="전체 메뉴">{items.filter(item=>!primary.includes(item)).filter(item=>item.to!=='/tuition'||!gate||gate.workspaceRole==='PARENT'||gate.session.data?.authenticated).map(item=>renderItem(item,true))}</nav></dialog>}</>;
}

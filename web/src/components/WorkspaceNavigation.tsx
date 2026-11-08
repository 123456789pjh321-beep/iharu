import {useEffect,useId,useRef} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useOptionalWorkspaceGate} from './WorkspaceGate';
import {Icon,type IconName} from './Icon';
const links:{to:string;label:string;icon:IconName}[]=[
 {to:'/timetable',label:'시간표',icon:'clock'},
 {to:'/today/calendar',label:'달력',icon:'calendar'},
 {to:'/chat',label:'대화',icon:'chat'},
 {to:'/tuition',label:'학원비',icon:'wallet'},

 {to:'/records',label:'메모',icon:'book'},
 {to:'/family',label:'가족 관리',icon:'users'},
 {to:'/account',label:'내 계정',icon:'settings'},
 {to:'/privacy',label:'개인정보 관리',icon:'shield'},
 {to:'/legal/privacy',label:'개인정보처리방침',icon:'book'},
];
export function WorkspaceBrand({testMode=false}:{testMode?:boolean}){return <Link to={testMode?'/test/today':'/timetable'} className="brand workspace-brand" aria-label="아이하루"><span className="brandmark"><Icon name="sun"/></span><span>아이하루<small>FAMILY WORKSPACE</small></span></Link>;}
export function WorkspaceNavigation({childMode=false,testMode=false,personalChild=false}:{childMode?:boolean;testMode?:boolean;personalChild?:boolean}){
 const {pathname}=useLocation(),gate=useOptionalWorkspaceGate();
 personalChild=personalChild||gate?.workspaceRole==='CHILD';
 const dialog=useRef<HTMLDialogElement>(null),more=useRef<HTMLButtonElement>(null),dialogId=useId();
 useEffect(()=>{dialog.current?.close();},[pathname]);
 const testLinks:{to:string;label:string;icon:IconName}[]=[{to:'today',label:'오늘',icon:'home'},{to:'calendar',label:'달력',icon:'calendar'},{to:'daily',label:'등하원',icon:'bag'},{to:'repeats',label:'반복 일정',icon:'repeat'},{to:'chat',label:'대화',icon:'chat'},{to:'family',label:'관리',icon:'shield'},{to:'devices',label:'기기 연결',icon:'device'},{to:'location',label:'위치',icon:'pin'},{to:'fees',label:'학원비',icon:'wallet'},{to:'records',label:'메모',icon:'book'},{to:'notifications',label:'새 소식',icon:'bell'},{to:'account',label:'내 계정',icon:'settings'}];
 const standardLinks=gate?.adminAllowed?[...links,{to:'/admin',label:'관리',icon:'shield' as const}]:links;
 const items=testMode?testLinks.map(l=>({...l,to:'/test/'+l.to})):childMode?[{to:'/child/connected',label:'내 하루',icon:'home' as const},{to:'/child/schedules',label:'내 일정',icon:'calendar' as const},{to:'/child/chat',label:'대화',icon:'chat' as const}]:personalChild?links.filter(l=>l.to!=='/tuition').map(l=>({...l,to:l.to==='/chat'?'/child/chat':l.to})):standardLinks;
 const current=(to:string)=>testMode?pathname===to:to==='/account'?pathname.startsWith('/account')||pathname==='/settings':to==='/today/calendar'?pathname.includes('calendar')||pathname.includes('repeats'):to==='/child/chat'?pathname==='/chat'||pathname.startsWith('/child/chat'):pathname.startsWith(to);
 const renderItem=(item:typeof items[number],close=false)=><Link key={item.to} to={item.to} onClick={close?()=>dialog.current?.close():undefined} className={current(item.to)?'active':''} aria-current={current(item.to)?'page':undefined}><span className="rail-icon"><Icon name={item.icon}/></span><span>{item.label}</span>{current(item.to)&&<span className="rail-active-dot" aria-hidden="true"/>}</Link>;
 const primary=childMode&&!testMode?items:items.filter(item=>['/timetable','/today/calendar','/chat','/child/chat','/tuition','/test/today','/test/calendar','/test/chat','/test/location'].includes(item.to));
 primary.sort((a,b)=>{const order=testMode?['오늘','달력','대화','위치']:['시간표','달력','대화','학원비'];return order.indexOf(a.label)-order.indexOf(b.label);});
 const extraActive=items.some(item=>current(item.to)&&!primary.includes(item));
 return <>
 <nav className="workspace-mobile-nav" aria-label="모바일 주 메뉴">{primary.map(item=>renderItem(item))}{primary.length<items.length&&<button ref={more} type="button" className={extraActive?'active':''} aria-haspopup="dialog" aria-controls={dialogId} onClick={()=>dialog.current?.showModal()}><span className="rail-icon"><Icon name="menu"/></span><span>더보기</span></button>}</nav>
 <dialog ref={dialog} id={dialogId} className="workspace-menu-dialog" aria-labelledby={dialogId+'-title'} onKeyDown={e=>{if(e.key!=='Tab')return;const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'));const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}} onCancel={()=>more.current?.focus()} onClick={e=>{if(e.target===e.currentTarget){dialog.current?.close();more.current?.focus();}}}>
 <div className="workspace-menu-heading"><div><h2 id={dialogId+'-title'}>전체 메뉴</h2></div><button type="button" className="icon-button" aria-label="전체 메뉴 닫기" onClick={()=>{dialog.current?.close();more.current?.focus();}}><Icon name="close"/></button></div>
 <nav className="workspace-menu-grid" aria-label="전체 메뉴">{items.filter(item=>item.to!=='/tuition'||!gate||gate.workspaceRole==='PARENT'||gate.session.data?.authenticated).map(item=>renderItem(item,true))}</nav></dialog></>;
}

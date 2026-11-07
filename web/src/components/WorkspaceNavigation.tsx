import {Link,useLocation} from 'react-router-dom';
import {Icon,type IconName} from './Icon';
const links:{to:string;label:string;icon:IconName}[]=[
 {to:'/today',label:'오늘',icon:'home'},
 {to:'/calendar',label:'가족 달력',icon:'calendar'},
 {to:'/location',label:'아이 위치',icon:'pin'},
 {to:'/chat',label:'가족 대화',icon:'chat'},
 {to:'/records',label:'하루 기록',icon:'book'},
 {to:'/family',label:'가족 관리',icon:'shield'},
 {to:'/account',label:'내 계정',icon:'settings'},
];
export function WorkspaceBrand({testMode=false}:{testMode?:boolean}){return <Link to={testMode?'/test/today':'/today'} className="brand workspace-brand" aria-label="아이하루"><span className="brandmark"><Icon name="sun"/></span><span>아이하루<small>FAMILY WORKSPACE</small></span></Link>;}
export function WorkspaceNavigation({childMode=false,testMode=false}:{childMode?:boolean;testMode?:boolean}){
 const {pathname}=useLocation();
 const testLinks:{to:string;label:string;icon:IconName}[]=[{to:'today',label:'오늘',icon:'home'},{to:'calendar',label:'가족 달력',icon:'calendar'},{to:'daily',label:'등하원',icon:'bag'},{to:'repeats',label:'반복 일정',icon:'repeat'},{to:'chat',label:'가족 대화',icon:'chat'},{to:'family',label:'가족 관리',icon:'shield'},{to:'devices',label:'기기 연결',icon:'device'},{to:'location',label:'아이 위치',icon:'pin'},{to:'fees',label:'학원비',icon:'wallet'},{to:'records',label:'하루 기록',icon:'book'},{to:'notifications',label:'새 소식',icon:'bell'},{to:'account',label:'내 계정',icon:'settings'}];
 const items=testMode?testLinks.map(l=>({...l,to:'/test/'+l.to})):childMode?[{to:'/child/connected',label:'내 하루',icon:'home' as const},{to:'/child/schedules',label:'내 일정',icon:'calendar' as const},{to:'/child/chat',label:'가족 대화',icon:'chat' as const}]:links;
 const current=(to:string)=>testMode?pathname===to:to==='/today'?pathname==='/today'||pathname==='/':to==='/account'?pathname.startsWith('/account')||pathname==='/settings':to==='/calendar'?pathname.includes('calendar')||pathname.includes('repeats'):pathname.startsWith(to);
 const content=items.map(item=><Link key={item.to} to={item.to} className={current(item.to)?'active':''} aria-current={current(item.to)?'page':undefined}><span className="rail-icon"><Icon name={item.icon}/></span><span>{item.label}</span>{current(item.to)&&<span className="rail-active-dot" aria-hidden="true"/>}</Link>);
 return <><aside className="workspace-rail"><span className="rail-label">WORKSPACE</span><nav aria-label="주 메뉴">{content}</nav><div className="rail-footer"><span className="rail-status-dot"/>가족과 함께</div></aside><nav className="workspace-mobile-nav" aria-label="모바일 주 메뉴">{content}</nav></>;
}

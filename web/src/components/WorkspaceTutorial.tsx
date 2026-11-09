import {useEffect,useId,useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {Icon} from './Icon';
import {workspaceGuide} from './workspaceGuides';
import {WorkspaceHeaderAction} from './WorkspaceHeaderAction';

export function WorkspaceTutorial(props:{profileId?:string;child?:boolean}){
 const {pathname}=useLocation();
 return <MenuTutorial key={pathname+':'+(props.profileId||'')+':'+!!props.child} {...props}/>;
}
function MenuTutorial({profileId,child=false}:{profileId?:string;child?:boolean}){
 const {pathname,search}=useLocation(),navigate=useNavigate(),id=useId(),dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const guide=workspaceGuide(pathname,child),storageKey=profileId?'iharu:tutorial:v2:'+profileId+':'+guide.id:null;
 const [welcoming,setWelcoming]=useState(()=>{try{return !!storageKey&&localStorage.getItem(storageKey)!=='done';}catch{return true;}}),[open,setOpen]=useState(false),[step,setStep]=useState(0);
 const shown=guide.steps,current=shown[step];
 const requested=new URLSearchParams(search).get('guide')==='1';
 useEffect(()=>{if(requested){setStep(0);setOpen(true);}},[requested]);
 useEffect(()=>{if(!open)return;const node=dialog.current;if(!node)return;node.showModal();return()=>node.close();},[open]);
 useEffect(()=>{if(open)heading.current?.focus({preventScroll:true});},[open,step]);
 function remember(){try{if(storageKey)localStorage.setItem(storageKey,'done');}catch{/* Help remains available when browser storage is disabled. */}setWelcoming(false);}
 function close(completed=false){if(completed)remember();setOpen(false);if(requested){const params=new URLSearchParams(search);params.delete('guide');navigate({pathname,search:params.toString()},{replace:true});}requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}));}
 return <>
  <WorkspaceHeaderAction><button ref={trigger} type="button" className="workspace-header-guide" data-new={welcoming||undefined} title={welcoming?'이 메뉴의 사용 안내를 확인해 보세요':'사용 안내'} onClick={()=>{setStep(0);setOpen(true);}}><Icon name="book"/>사용 안내</button></WorkspaceHeaderAction>
  {open&&<dialog ref={dialog} className="workspace-guide-dialog" aria-labelledby={id+'-title'} aria-describedby={id+'-description'} onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
   <header><span>{guide.label} 사용 안내 · {step+1}/{shown.length}</span><button type="button" className="icon-button" aria-label="사용 안내 닫기" onClick={()=>close()}><Icon name="close"/></button></header>
   <div className="guide-progress" aria-label={`안내 ${shown.length}단계 중 ${step+1}단계`}>{shown.map((s,index)=><span key={s.title} className={index<=step?'done':''}/>)}</div>
   <div className="guide-scene" aria-hidden="true"><span><Icon name={current.icon}/></span><div>{current.tips.map((_,index)=><i key={index}><Icon name="check"/><b/></i>)}</div></div>
   <h2 ref={heading} tabIndex={-1} id={id+'-title'}>{current.title}</h2><p id={id+'-description'}>{current.description}</p>
   <ol>{current.tips.map(tip=><li key={tip}>{tip}</li>)}</ol>
   <footer><button type="button" className="button quiet" disabled={step===0} onClick={()=>setStep(s=>s-1)}>이전</button><button type="button" className="button primary" onClick={()=>step===shown.length-1?close(true):setStep(s=>s+1)}>{step===shown.length-1?'사용 안내 완료':'다음'}</button></footer>
  </dialog>}
 </>;
}

import {useEffect,useId,useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {Icon,type IconName} from './Icon';

const steps:{title:string;icon:IconName;description:string;tips:string[]}[]=[
 {title:'우리 가족부터 연결해요',icon:'users',description:'전체메뉴 → 가족 관리에서 가족을 연결하면 서로의 하루를 함께 볼 수 있어요.',tips:['보호자는 가족 관리에서 6자리 승인번호를 발급해요.','자녀는 가입할 때 승인번호를 입력해요. 다른 보호자도 자신의 계정으로 가족에 합류할 수 있어요.']},
 {title:'매주 반복되는 하루는 시간표에',icon:'clock',description:'학교와 학원처럼 매주 반복되는 일정을 등록해요. 오전 8시부터 밤 10시까지 한눈에 확인할 수 있어요.',tips:['요일 아래의 빈 시간 칸을 누르면 일정을 추가해요.','위쪽 이름 버튼으로 여러 명을 선택하고, 첫 화면으로 저장하면 다음에도 같은 조합이 열려요.']},
 {title:'특별한 약속은 달력에',icon:'calendar',description:'날짜를 누르면 그날의 일정을 확인하고 새로운 약속을 추가할 수 있어요. 이름 필터는 시간표와 같이 여러 명을 선택해 저장할 수 있어요.',tips:['월간·주간·일간 보기로 바꿔서 확인해요.','일정을 여러 날에 등록하려면 시작일과 종료일을 지정해요. 등록한 일정을 누르면 수정하거나 상세를 볼 수 있어요.']},
 {title:'가족에게 짧게 전해요',icon:'chat',description:'대화에서 글이나 작은 그림 메시지로 가족과 소통해요.',tips:['입력창 옆 웃는 얼굴 버튼을 누르면 그림을 고를 수 있어요.','그림이나 글을 확인하고 보내기 버튼을 눌러요. 그림 선택창은 필요할 때만 열어 두세요.']},
 {title:'학원비는 달력과 가계부로',icon:'wallet',description:'학원비 달력에서 납부일과 금액을 확인하고 날짜별 내역을 모아 보세요.',tips:['학원비 추가에서 납부일·금액·결제자를 등록해요. 매월 납부도 설정할 수 있어요.','이름 필터에서 여러 명을 골라 첫 화면으로 저장해요. 달력 날짜로 일별 내역을, 내역 보기로 월 전체 가계부를 확인해요.']},
];

export function WorkspaceTutorial({profileId,child=false}:{profileId:string;child?:boolean}){
 const {pathname,search}=useLocation(),navigate=useNavigate(),id=useId(),dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const storageKey='iharu:tutorial:v1:'+profileId;
 const [welcoming,setWelcoming]=useState(()=>{try{return localStorage.getItem(storageKey)!=='done';}catch{return true;}}),[open,setOpen]=useState(false),[step,setStep]=useState(0);
 const shown=child?steps.filter(s=>s.icon!=='wallet'):steps,current=shown[step];
 const requested=new URLSearchParams(search).get('guide')==='1';
 useEffect(()=>{if(requested){setStep(0);setOpen(true);}},[requested]);
 useEffect(()=>{if(!open)return;const node=dialog.current;if(!node)return;node.showModal();return()=>node.close();},[open]);
 useEffect(()=>{if(open)heading.current?.focus({preventScroll:true});},[open,step]);
 function remember(){try{localStorage.setItem(storageKey,'done');}catch{/* Help remains available when browser storage is disabled. */}setWelcoming(false);}
 function close(completed=false){if(completed)remember();setOpen(false);if(requested){const params=new URLSearchParams(search);params.delete('guide');navigate({pathname,search:params.toString()},{replace:true});}requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}));}
 return <>
  <aside className={'workspace-guide'+(welcoming?' welcome':'')} aria-label="사용 안내">
   {welcoming?<><span className="workspace-guide-symbol"><Icon name="sun"/></span><div><strong>아이하루, 이렇게 시작해요</strong><p>시간표부터 가족 대화까지, 1분이면 익숙해져요.</p></div><button ref={trigger} type="button" className="button compact primary" onClick={()=>{setStep(0);setOpen(true);}}>사용 안내 시작</button><button type="button" className="icon-button" aria-label="사용 안내 나중에 보기" onClick={remember}><Icon name="close"/></button></>:<button ref={trigger} type="button" className="workspace-guide-replay" onClick={()=>{setStep(0);setOpen(true);}}><Icon name="book"/>사용 안내</button>}
  </aside>
  {open&&<dialog ref={dialog} className="workspace-guide-dialog" aria-labelledby={id+'-title'} aria-describedby={id+'-description'} onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
   <header><span>아이하루 사용 안내 · {step+1}/{shown.length}</span><button type="button" className="icon-button" aria-label="사용 안내 닫기" onClick={()=>close()}><Icon name="close"/></button></header>
   <div className="guide-progress" aria-label={`안내 ${shown.length}단계 중 ${step+1}단계`}>{shown.map((s,index)=><span key={s.title} className={index<=step?'done':''}/>)}</div>
   <div className="guide-scene" aria-hidden="true"><span><Icon name={current.icon}/></span><div>{current.tips.map((_,index)=><i key={index}><Icon name="check"/><b/></i>)}</div></div>
   <h2 ref={heading} tabIndex={-1} id={id+'-title'}>{current.title}</h2><p id={id+'-description'}>{current.description}</p>
   <ol>{current.tips.map(tip=><li key={tip}>{tip}</li>)}</ol>
   <footer><button type="button" className="button quiet" disabled={step===0} onClick={()=>setStep(s=>s-1)}>이전</button><button type="button" className="button primary" onClick={()=>step===shown.length-1?close(true):setStep(s=>s+1)}>{step===shown.length-1?'사용 안내 완료':'다음'}</button></footer>
  </dialog>}
 </>;
}

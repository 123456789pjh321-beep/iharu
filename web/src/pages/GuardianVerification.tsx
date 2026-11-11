import {useState,type FormEvent} from 'react';
import {Link,Navigate} from 'react-router-dom';
import {useApi} from '../api';
import {sessionSchema} from '../auth';
import {familyRequest} from '../family';
import {AuthLayout,FormNotice} from '../components/AuthLayout';
import {Loading,ErrorState} from '../components/Common';
import {applicationsSchema,guardianStateLabel,type GuardianApplication} from '../../../shared/guardian-verification';
const base='/api/v1/guardian-verification';
export function GuardianVerificationPage({review=false}:{review?:boolean}){
 const session=useApi('/api/account/session',sessionSchema);
 if(session.loading)return <AuthLayout wide><Loading label="일반사용자 계정을 확인하고 있어요"/></AuthLayout>;
 if(session.error)return <AuthLayout wide><ErrorState message={session.error} retry={session.retry}/></AuthLayout>;
 if(!session.data?.authenticated)return <Navigate to="/login" replace/>;
 return <AuthLayout wide><Link to="/family">← 우리 그룹</Link><p className="eyebrow">아이와 함께하기 위한 확인</p><h1>{review?'일반사용자 확인 심사':'일반사용자 확인 신청'}</h1><p>로그인과 이메일 인증은 아이와의 관계 확인과 별개예요.</p><VerificationWorkspace review={review}/></AuthLayout>;
}
function VerificationWorkspace({review}:{review:boolean}){
 const list=useApi(`${base}/${review?'queue':'list'}`,applicationsSchema);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;const form=e.currentTarget,data=new FormData(form);setBusy(true);setError('');setMessage('');
  try{await familyRequest(`${base}/submit`,{requestKey,targetLabel:data.get('targetLabel'),relationship:data.get('relationship')});setRequestKey(crypto.randomUUID());form.reset();setMessage('신청이 접수됐어요. 아래에서 진행 상태와 결과를 확인해 주세요.');list.retry();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 if(list.loading)return <Loading label="신청 상태를 확인하고 있어요"/>;
 if(list.errorCode==='AUTH_REQUIRED')return <Navigate to="/login" replace/>;
 if(list.errorCode==='ACCESS_NOT_READY')return <section className="account-card"><h2>이메일 인증 후 신청할 수 있어요</h2><p>일반사용자 계정으로 로그인하고 연락받을 이메일을 확인해 주세요.</p><Link className="button primary" to="/account">내 계정 확인</Link></section>;
 if(list.error)return <><ErrorState message={list.error} retry={list.retry}/><Link className="button" to="/account/reauth">본인 인증 다시 하기</Link></>;
 return <>
 {!review&&<section className="account-card"><h2>신청 전에 확인해 주세요</h2><ol><li>실명 대신 아이를 구분할 이름으로 신청해 주세요. 예: 첫째, 둘째.</li><li>담당자가 신청인과 아이의 관계를 확인한 뒤 심사해요.</li><li>결과와 반려 사유는 이 화면에서 확인할 수 있어요.</li></ol>
 <p className="auth-notice">주민등록번호·증명서 원본·아이의 생년월일을 이 화면에 입력하지 마세요. 서류 접수 경로와 확인 기준은 운영 안내가 마련된 뒤 별도로 안내해요.</p>
 {!list.data!.reviewAvailable&&<p role="status" className="auth-notice">신청 접수는 가능하지만 담당 심사자가 아직 지정되지 않았어요. 담당자 지정과 증빙 확인 안내 후 심사가 진행돼요.</p>}
 <p>접수·심사는 신청 후 14일, 승인은 승인 후 30일 동안 유효해요. 만료되면 다시 신청해 주세요. 어린이 초대를 준비 중이라면 관계를 법정대리인으로 선택해 주세요. 데이터 삭제 기능 준비와 등록용 대상 확인이 끝나면 그룹 관리에서 어린이 초대 링크를 만들 수 있어요.</p>
 <form className="auth-form" onSubmit={submit}><fieldset disabled={busy}><legend>새 신청</legend><div className="form-field"><label htmlFor="guardian-target">아이 구분 이름</label><input id="guardian-target" name="targetLabel" maxLength={24} required placeholder="예: 첫째"/></div><div className="form-field"><label htmlFor="guardian-relationship">아이와의 관계</label><select id="guardian-relationship" name="relationship"><option value="PARENT">부모</option><option value="LEGAL_GUARDIAN">법정대리인 (법정대리인인 부모 포함)</option></select></div><button className="button primary full" disabled={busy}>{busy?'접수하고 있어요…':'일반사용자 확인 신청'}</button></fieldset></form>
 <FormNotice error={error} message={message}/>{error&&<Link to="/account/reauth">본인 인증 다시 하기</Link>}
 </section>}
 <section className="account-card"><div className="card-title"><h2>{review?'심사 대기 신청':'내 신청 내역'}</h2><button className="button compact" onClick={list.retry}>상태 새로고침</button></div>
 {!list.data!.applications.length&&<p>{review?'심사 대기 중인 신청이 없어요.':'아직 신청한 내역이 없어요.'}</p>}
 <div className="guardian-applications">{list.data!.applications.map(item=><article className="guardian-application" key={`${item.id}-${item.version}`}><h3>{item.targetLabel} <span className={`badge ${item.state==='APPROVED'?'green':'neutral'}`}>{guardianStateLabel[item.state]}</span></h3><p>{item.relationship==='PARENT'?'부모':'법정대리인'} · 신청일 {date(item.createdAt)}</p>{review&&<p className="guardian-reference">신청 계정: {item.applicantEmail}</p>}<p className="guardian-reference">접수번호 {item.id}</p>
 <p>{item.state==='RECEIVED'?'접수됐어요. 담당자의 확인을 기다려 주세요.':item.state==='REVIEWING'?'담당자가 아이와의 관계를 확인하고 있어요.':item.state==='APPROVED'?'관계 확인이 승인됐어요. 우리 그룹 화면에서 다음 단계를 확인해 주세요.':item.state==='REJECTED'?'아래 사유를 확인하고 내용을 보완해 다시 신청해 주세요.':'유효 기간이 지났어요. 새로 신청해 주세요.'}</p>
 {item.reason&&<p className="auth-notice"><strong>반려 사유</strong><br/>{item.reason}</p>}<p>유효 기간: {date(item.expiresAt)}</p>
 {review&&item.canReview&&(item.state==='APPROVED'?<BirthDateReview item={item} enabled={list.data!.registrationEnabled} refresh={list.retry}/>:<ReviewForm item={item} refresh={list.retry}/>)} {!review&&item.state==='APPROVED'&&<Link className="button primary" to="/family">그룹 연결 계속하기</Link>} {review&&!item.canReview&&<p>다른 담당자가 심사 중이거나 본인의 신청이라 처리할 수 없어요.</p>}
 </article>)}</div>
 {!review&&list.data!.reviewer&&<Link className="button" to="/family/verification/review">담당 신청 심사</Link>}
 </section><Link to="/account/reauth">신청·심사 전 본인 인증 다시 하기</Link>
 </>;
}
function date(value:string){return new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});}
function ReviewForm({item,refresh}:{item:GuardianApplication;refresh:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(body:object){if(busy)return;setBusy(true);setError('');try{await familyRequest(`${base}/review`,{id:item.id,expectedVersion:item.version,...body});refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(item.state==='RECEIVED')return <><button className="button" disabled={busy} onClick={()=>save({state:'REVIEWING'})}>심사 시작</button><FormNotice error={error}/></>;
 return <><p className="guardian-reference">확인 대상 번호: {item.targetId}</p><p>기관의 승인된 증빙 확인 절차로 신청인의 신원·법정 관계·해당 대상 일치를 확인한 경우에만 승인하세요. 아래 확인 체크만으로 증빙이 대체되지 않습니다.</p>
 <form className="auth-form" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);void save({state:'APPROVED',targetId:item.targetId,evidenceRef:d.get('evidenceRef'),subjectRef:d.get('subjectRef'),evidenceChecked:d.get('evidenceChecked')==='on'});}}><fieldset disabled={busy}><legend>확인 기록으로 승인</legend><div className="form-field"><label htmlFor={`evidence-${item.id}`}>증빙 심사 기록 번호</label><input id={`evidence-${item.id}`} name="evidenceRef" required pattern="[A-Za-z0-9:_\-]{8,120}" minLength={8} maxLength={120}/></div><div className="form-field"><label htmlFor={`subject-${item.id}`}>확인된 대상 참조 번호</label><input id={`subject-${item.id}`} name="subjectRef" required pattern="[A-Za-z0-9:_\-]{8,120}" minLength={8} maxLength={120}/></div><p>기관 내부의 조회 가능한 비식별 참조 번호만 입력하세요. 주민번호나 증명서 내용을 입력하지 마세요.</p><label className="check-option"><input type="checkbox" name="evidenceChecked" required/><span>기록에서 신청인과 위 대상의 법정 관계를 실제로 확인했습니다.</span></label><button className="button primary">승인</button></fieldset></form>
 <form className="auth-form" onSubmit={e=>{e.preventDefault();void save({state:'REJECTED',reason:new FormData(e.currentTarget).get('reason')});}}><fieldset disabled={busy}><legend>반려</legend><div className="form-field"><label htmlFor={`reason-${item.id}`}>신청인에게 안내할 반려 사유</label><textarea id={`reason-${item.id}`} name="reason" required minLength={5} maxLength={500}/></div><button className="button">사유를 안내하고 반려</button></fieldset></form><FormNotice error={error}/></>;
}


function BirthDateReview({item,enabled,refresh}:{item:GuardianApplication;enabled:boolean;refresh:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!enabled)return <p role="status">아이 정보 삭제 기능 준비 후 등록용 생년월일 확인을 진행할 수 있어요.</p>;
 return <form className="auth-form" onSubmit={e=>{e.preventDefault();if(busy)return;const data=new FormData(e.currentTarget);setBusy(true);setError('');void familyRequest(`${base}/birth-date`,{id:item.id,expectedVersion:item.version,targetId:item.targetId,birthDate:data.get('birthDate'),evidenceChecked:data.get('evidenceChecked')==='on'}).then(refresh).catch(e=>setError((e as Error).message)).finally(()=>setBusy(false));}}><fieldset disabled={busy}><legend>승인된 대상의 등록 정보 확인</legend><p>기존 심사 기록에서 해당 대상의 생년월일을 대조해 주세요. 신청자가 입력한 날짜만으로 승인하지 마세요.</p><label htmlFor={`birth-${item.id}`}>증빙에서 확인한 생년월일</label><input id={`birth-${item.id}`} name="birthDate" type="date" required/><label className="check-option"><input name="evidenceChecked" type="checkbox" required/><span>승인한 대상과 생년월일이 심사 기록에 일치합니다.</span></label><button className="button primary">등록 정보 확인 완료</button></fieldset><FormNotice error={error}/></form>;
}


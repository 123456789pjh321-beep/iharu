import {useEffect,useState,type FormEvent} from 'react';
import {Link,useLocation,useParams} from 'react-router-dom';
import {AuthLayout,FormNotice} from '../components/AuthLayout';
import {Loading} from '../components/Common';
import {legalRequest} from '../legal-api';
import {privacyKinds,type LegalPublication,type LegalState} from '../../../shared/legal';
import {accountDeletionRequestPath} from '../../../shared/entry-intent';
import '../legal.css';
import {LocationUseNotice} from '../components/BriefingLocation';

export function AccountDeletionPage(){
 const loginPath='/login?next='+encodeURIComponent(accountDeletionRequestPath);
 return <AuthLayout wide><section className="account-card legal-page" aria-labelledby="account-deletion-title">
  <h1 id="account-deletion-title">아이하루 계정 및 데이터 삭제 요청</h1>
  <p>이 웹페이지에서 아이하루 계정과 연결된 개인정보의 삭제를 요청할 수 있습니다.</p>
  <ol>
   <li>삭제할 아이하루 계정으로 로그인합니다.</li>
   <li>개인정보 관리에서 ‘삭제·회원 탈퇴 요청’을 선택하고 요청을 접수합니다.</li>
   <li>같은 화면의 처리 내역에서 진행 상태와 운영자의 답변을 확인합니다.</li>
  </ol>
  <p>운영자는 본인 또는 대리인 여부를 확인한 뒤 계정 정보, 등록한 자료와 그룹 공유 자료의 삭제 범위를 검토합니다. 별도로 보관할 법적 근거가 있는 정보는 처리 결과에서 사유와 기간을 안내합니다.</p>
  <Link className="button primary" to={loginPath}>계정 삭제 요청 계속하기</Link>
  <nav className="legal-links" aria-label="계정 도움말">
   <Link to="/legal/privacy">개인정보처리방침</Link>
   <Link to={'/forgot-password?next='+encodeURIComponent(accountDeletionRequestPath)}>암호 찾기</Link>
  </nav>
 </section></AuthLayout>;
}
export function LegalDocument({publication,section='privacy'}:{publication:LegalPublication;section?:string}){const d=publication.document;return <article className="legal-document"><h1>{section==='terms'?'이용약관':section==='children'?'어린이를 위한 개인정보 안내':'개인정보처리방침'}</h1><p className="account-caption">버전 {publication.version} · 게시 {new Date(publication.publishedAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</p><dl className="legal-operator"><dt>운영자</dt><dd>{d.operatorName}</dd><dt>개인정보 보호책임자</dt><dd>{d.privacyOfficer}</dd><dt>문의</dt><dd><a href={'mailto:'+d.contactEmail}>{d.contactEmail}</a></dd>{d.address&&<><dt>주소</dt><dd>{d.address}</dd></>}{d.businessNumber&&<><dt>사업자 등록번호</dt><dd>{d.businessNumber}</dd></>}</dl><div className="legal-prose">{section==='terms'?d.terms:section==='children'?d.children:d.privacy}</div>{section==='privacy'&&<>{[['처리 위탁',d.processors],['국외 이전',d.transfers],['보유 기간과 파기',d.retention]].map(([heading,content])=><section key={heading}><h2>{heading}</h2><div className="legal-prose">{content}</div></section>)}</>}</article>;}
export function LegalPage(){const {section}=useParams(),[publication,setPublication]=useState<LegalPublication|null>(null),[loaded,setLoaded]=useState(false),[error,setError]=useState('');useEffect(()=>{let active=true;setLoaded(false);setError('');fetch('/api/v1/legal/public',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('고지를 불러오지 못했습니다.');return r.json();}).then(d=>{if(active)setPublication(d.publication);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoaded(true);});return()=>{active=false;};},[section]);return <AuthLayout wide><section className="account-card legal-page"><nav className="legal-links"><Link to="/legal/terms">이용약관</Link><Link to="/legal/privacy">개인정보처리방침</Link><Link to="/legal/children">어린이 안내</Link><Link to="/privacy">개인정보 관리</Link></nav>{section!=='terms'&&<section aria-label="이 기기의 선택 위치 사용"><h2>이 기기의 선택 위치 사용</h2><LocationUseNotice/><Link to="/settings#location-settings">위치 설정 확인</Link></section>}{error?<FormNotice error={error}/>:!loaded?<Loading/>:publication?<LegalDocument publication={publication} section={section}/>:<><h1>서비스 이용·개인정보 안내</h1><p>운영자 정보와 법적 고지를 정비하고 있습니다. 확정된 문서는 이곳에 게시됩니다.</p><p>위치는 선택 허용 시 이 기기에서만 일시적으로 확인하며 서버에 저장하지 않습니다. 광고 추적은 하지 않습니다. 개인정보 관련 요청은 로그인 후 개인정보 관리에서 접수할 수 있습니다.</p><Link className="button" to="/privacy">개인정보 관리</Link></>}</section></AuthLayout>;}
export function PrivacyPage(){const {pathname,search}=useLocation(),defaultRequestKind=pathname+search===accountDeletionRequestPath?'DELETE':'ACCESS';const [state,setState]=useState<LegalState|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);useEffect(()=>{let active=true;legalRequest<LegalState>('state').then(d=>{if(active){setState(d);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[revision]);async function perform(action:()=>Promise<unknown>,message:string){setBusy(true);setError('');try{await action();setNotice(message);setRevision(n=>n+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function request(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget,data=new FormData(form);await perform(async()=>{await legalRequest('request.create',{kind:data.get('kind'),detail:data.get('detail')});form.reset();},'요청을 접수했습니다. 아래에서 처리 상태와 답변을 확인해 주세요.');}
 const loginPath=defaultRequestKind==='DELETE'?'/login?next='+encodeURIComponent(accountDeletionRequestPath):'/login';
 return <AuthLayout wide><section className="account-card legal-page"><h1>개인정보 관리</h1><FormNotice error={error} message={notice}/>{!state?error?<><Link className="button" to={loginPath}>로그인</Link><button className="button" onClick={()=>setRevision(n=>n+1)}>다시 불러오기</button></>:<Loading/>:<>
 {state.publication&&state.role==='PARENT'&&!state.accepted&&<form className="auth-form legal-consent" onSubmit={e=>{e.preventDefault();void perform(()=>legalRequest('accept',{publicationId:state.publication!.id,terms:true,privacy:true,adult:true}),'현재 버전 확인을 기록했습니다.');}}><h2>서비스 이용 확인</h2><p>문서를 읽은 뒤 직접 선택해 주세요. 이 확인은 아동의 법정대리인 동의 확인을 대신하지 않습니다.</p><label className="check-option"><input type="checkbox" required/><span><Link to="/legal/terms" target="_blank">이용약관</Link>에 동의합니다.</span></label><label className="check-option"><input type="checkbox" required/><span><Link to="/legal/privacy" target="_blank">개인정보처리방침</Link>의 항목·목적·보유 기간과 권리 행사 방법을 확인했습니다.</span></label><label className="check-option"><input type="checkbox" required/><span>성인 계정으로 이용합니다.</span></label><button className="button primary" disabled={busy}>확인하고 기록</button></form>}
 <nav className="legal-links"><Link to="/legal/terms">이용약관</Link><Link to="/legal/privacy">개인정보처리방침</Link><Link to="/legal/children">어린이 안내</Link></nav>
 {state.consents.length>0&&<details><summary>나의 문서 확인 기록</summary>{state.consents.map((c,i)=><p key={i}>버전 {c.version} · {new Date(c.acceptedAt).toLocaleString('ko-KR')} {c.withdrawnAt?'· 철회 요청 기록':''}</p>)}</details>}
 <form className="auth-form" onSubmit={request}><h2>개인정보 권리 행사·문의</h2><p>주민등록번호·비밀번호·신분증·건강정보는 입력하지 마세요. 추가 확인이 필요한 경우 운영자가 별도 절차를 안내합니다.</p><fieldset disabled={busy}><legend className="sr-only">개인정보 요청</legend><label className="form-field">요청 종류<select key={defaultRequestKind} name="kind" defaultValue={defaultRequestKind}>{Object.entries(privacyKinds).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label className="form-field">요청 내용<textarea name="detail" rows={4} required minLength={3} maxLength={2000}/></label><p className="account-caption">접수만으로 회원 탈퇴나 데이터 삭제가 완료되지는 않습니다. 본인·대리인 확인과 보관 근거 검토 후 결과를 안내합니다.</p><button className="button primary">요청 접수</button></fieldset></form>
 <h2>처리 내역</h2>{state.requests.length?state.requests.map(r=><article className="privacy-request" key={r.id}><strong>{privacyKinds[r.kind as keyof typeof privacyKinds]} · {({RECEIVED:'접수',REVIEWING:'검토 중',COMPLETED:'처리 완료',REJECTED:'처리 불가'})[r.status]}</strong><small>{new Date(r.createdAt).toLocaleString('ko-KR')}</small><p>{r.detail}</p>{r.response&&<div className="auth-notice">{r.response}</div>}<small>접수 번호 {r.id}</small></article>):<p>접수한 요청이 없습니다.</p>}
 </>}<Link className="button" to="/timetable">시간표로 돌아가기</Link></section></AuthLayout>;
}

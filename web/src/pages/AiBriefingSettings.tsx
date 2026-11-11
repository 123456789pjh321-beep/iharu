import {BriefingOperations} from '../components/BriefingOperations';
import {BriefingReports} from '../components/BriefingReports';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {AiSettings} from '../../../shared/ai-settings';
import {adminRequest} from '../admin-api';
import {AdminReauthentication} from '../components/AdminReauthentication';
import {FormNotice} from '../components/AuthLayout';
import {Loading,ErrorState} from '../components/Common';
import {Icon} from '../components/Icon';
const date=(value:string|null)=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'아직 없음';
const checkText={OK:'연결 확인됨',AUTH:'API 키 또는 권한 확인 필요',LIMIT:'사용 한도 또는 요청 제한 확인 필요',UNAVAILABLE:'연결을 다시 확인해 주세요'};
export function AiBriefingSettings({revision}:{revision:number}){
 const [settings,setSettings]=useState<AiSettings|null>(null),[load,setLoad]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[apiKey,setApiKey]=useState(''),[reauth,setReauth]=useState(false),[busy,setBusy]=useState(false),[remove,setRemove]=useState(false);
 const lock=useRef(false),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{let active=true;setError('');adminRequest<AiSettings>('ai.read').then(s=>{if(active)setSettings(s);}).catch(e=>{if(active){setSettings(null);setError((e as Error).message);}});return()=>{active=false;};},[revision,load]);
 useEffect(()=>{if(remove)dialog.current?.showModal();else dialog.current?.close();},[remove]);
 async function perform(op:'ai.save'|'ai.remove'|'ai.check'){
  if(!settings||lock.current||reauth)return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{const result=await adminRequest<AiSettings&{modelCount?:number}>(op,op==='ai.check'?{}:{version:settings.version,...(op==='ai.save'?{apiKey}:{})});setSettings(result);if(op!=='ai.check')setApiKey('');if(op==='ai.remove')setRemove(false);if(op==='ai.check'&&result.lastCheck!=='OK')setError(checkText[result.lastCheck||'UNAVAILABLE']);else setNotice(op==='ai.save'?'API 키를 암호화해 저장했어요.':op==='ai.remove'?'아이하루에 저장된 API 키를 삭제했어요.':'OpenAI 연결을 확인했어요. 모델 목록 접근 권한을 확인했으며 AI 답변을 생성하지 않았어요.');}
  catch(e){setError((e as Error).message);if((e as {code?:string}).code==='REAUTH_REQUIRED')setReauth(true);if((e as {code?:string}).code==='VERSION_CONFLICT')setLoad(v=>v+1);}finally{lock.current=false;setBusy(false);}
 }
 if(!settings)return error?<ErrorState message={error} retry={()=>setLoad(v=>v+1)}/>:<Loading label="AI 연동 설정을 확인하고 있어요"/>;
 const confirmed=()=>{setReauth(false);setError('');setNotice('본인 확인을 마쳤어요. 등록·교체 또는 삭제 버튼을 다시 눌러 적용해 주세요.');};
 const clearBeforeSocial=()=>{setApiKey('');setError('');setNotice('');};
 const submit=(event:FormEvent)=>{event.preventDefault();void perform('ai.save');};
 return <section className="admin-panel ai-briefing-settings" aria-labelledby="ai-settings-title"><header><div><h2 id="ai-settings-title">AI 브리핑 설정</h2><p>AI 브리핑에서 사용하는 OpenAI 연결과 자동 게시를 관리합니다.</p></div><span className={'admin-tag '+(settings.configured?'elevated':'')}>{settings.configured?'키 등록됨':'키 미등록'}</span></header>
 <FormNotice error={remove?'':error} message={notice}/>{reauth&&!remove&&<AdminReauthentication returnTo="/admin?section=ai" verified={confirmed} redirecting={clearBeforeSocial} disabled={busy}/>}<dl className="admin-member-facts"><div><dt>저장 방식</dt><dd>AES-256-GCM 암호화</dd></div><div><dt>서버 암호화 준비</dt><dd>{settings.encryptionReady?'준비 완료':'서버 설정 필요'}</dd></div><div><dt>등록 키</dt><dd>{settings.configured?'암호화 보관 · 식별 코드 '+settings.fingerprint:'등록된 키 없음'}</dd></div><div><dt>마지막 변경</dt><dd>{date(settings.updatedAt)}</dd></div><div><dt>연결 상태</dt><dd>{settings.lastCheck?checkText[settings.lastCheck]:'아직 확인하지 않음'}</dd></div><div><dt>마지막 연결 확인</dt><dd>{date(settings.lastCheckedAt)}</dd></div></dl>
 <form className="auth-form" onSubmit={submit}><fieldset disabled={busy||!settings.encryptionReady}><legend>{settings.configured?'API 키 교체':'API 키 등록'}</legend><label className="form-field">OpenAI API 키<input type="password" name="openai-api-key" aria-label="OpenAI API 키" value={apiKey} onChange={e=>setApiKey(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} minLength={20} maxLength={512} required placeholder="sk-…"/></label><p className="account-caption">등록한 키 원문은 다시 표시되지 않습니다. 이 입력란은 저장 시 비워지며 브라우저 저장소에 보관하지 않습니다.</p><button type="submit" className="button primary" disabled={reauth}>{busy?'처리 중…':settings.configured?'암호화해 교체':'암호화해 등록'}</button></fieldset></form>
 <div className="ai-settings-actions"><button type="button" className="button" disabled={busy||reauth||!settings.configured||!settings.encryptionReady} onClick={()=>void perform('ai.check')}><Icon name="repeat"/>연결 확인</button><button type="button" className="button danger" disabled={busy||!settings.configured} onClick={()=>{setRemove(true);setError('');}}>등록 키 삭제</button></div><p className="admin-footnote">키는 최고관리자만 관리할 수 있으며 등록·교체·삭제·연결 확인 이력이 기록됩니다. 연결 확인은 OpenAI의 모델 목록을 조회합니다. 연결 확인은 위치나 일정 자료를 보내지 않습니다. 자동 브리핑은 사용자가 별도로 동의한 일정의 시설·장소와 기준 지역만 분석합니다.</p>
 <BriefingOperations beforeSocial={clearBeforeSocial}/>
 <BriefingReports beforeSocial={clearBeforeSocial}/>
 <dialog ref={dialog} className="personal-editor" aria-labelledby="ai-key-remove-title" onCancel={event=>{event.preventDefault();if(!busy)setRemove(false);}}><header><h2 id="ai-key-remove-title">등록한 API 키를 삭제할까요?</h2></header><p>아이하루의 암호화된 등록 키를 삭제합니다. OpenAI에서 발급된 키 자체를 폐기하려면 OpenAI 설정에서 처리해 주세요.</p><FormNotice error={error} message={notice}/>{reauth&&remove&&<AdminReauthentication returnTo="/admin?section=ai" verified={confirmed} redirecting={clearBeforeSocial} disabled={busy}/>}<footer><button type="button" className="button" disabled={busy} onClick={()=>setRemove(false)}>취소</button><button type="button" className="button danger" disabled={busy||reauth} onClick={()=>void perform('ai.remove')}>삭제</button></footer></dialog>
 </section>;
}

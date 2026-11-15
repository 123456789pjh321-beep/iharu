import {useEffect,useRef,useState} from 'react';
import {mediaPermissionError,type MemoAttachmentInput} from '../../../../shared/memo-capture';
import {prepareAttachment,recordingMime,releaseStream} from './media';
import {Icon} from '../Icon';
export function MemoRecorder({onAdd,onClose,onActive}:{onAdd:(file:MemoAttachmentInput)=>Promise<void>;onClose:()=>void;onActive:(active:boolean)=>void}){
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),live=useRef(true),starting=useRef(false),discard=useRef(false),started=useRef(0),elapsed=useRef(0),bytes=useRef(0),chunks=useRef<Blob[]>([]);
 const [state,setState]=useState<'idle'|'asking'|'recording'|'paused'|'saving'>('idle'),[seconds,setSeconds]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pendingAudio,setPendingAudio]=useState<MemoAttachmentInput|null>(null);
 const addRef=useRef(onAdd),activeRef=useRef(onActive);addRef.current=onAdd;activeRef.current=onActive;
 useEffect(()=>{live.current=true;return()=>{live.current=false;discard.current=true;const r=recorder.current;if(r&&r.state!=='inactive')r.stop();releaseStream(stream.current);activeRef.current(false);};},[]);
 useEffect(()=>{onActive(state!=='idle'||pendingAudio!==null);},[state,pendingAudio,onActive]);
 function pause(){const r=recorder.current;if(r?.state==='recording'){elapsed.current+=Date.now()-started.current;r.pause();setState('paused');}}
 function resume(){const r=recorder.current;if(r?.state==='paused'){started.current=Date.now();r.resume();setState('recording');setNotice('');}}
 function stop(){const r=recorder.current;if(r&&r.state!=='inactive'){setState('saving');r.stop();releaseStream(stream.current);}}
 useEffect(()=>{const hidden=()=>{if(document.hidden){const r=recorder.current;if(r?.state==='recording'){elapsed.current+=Date.now()-started.current;r.pause();setState('paused');setNotice('화면을 벗어나 녹음을 일시정지했어요. 계속 녹음하려면 재개를 눌러 주세요.');}}};document.addEventListener('visibilitychange',hidden);const timer=setInterval(()=>{const r=recorder.current;if(r?.state==='recording'){const value=Math.floor((elapsed.current+Date.now()-started.current)/1000);setSeconds(value);if(value>=300){setNotice('5분 녹음을 마쳐 첨부했어요.');stop();}}},250);return()=>{document.removeEventListener('visibilitychange',hidden);clearInterval(timer);};},[]);
 async function start(){
  if(starting.current||recorder.current?.state==='recording')return;
  if(pendingAudio&&!window.confirm('첨부하지 않은 녹음을 지우고 다시 녹음할까요?'))return;
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('이 기기는 녹음을 지원하지 않아요. 녹음 앱의 오디오 파일을 첨부해 주세요.');return;}
  starting.current=true;discard.current=false;setPendingAudio(null);setError('');setState('asking');
  try{
   const next=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   if(!live.current||discard.current){releaseStream(next);return;}stream.current=next;
   const mimeType=recordingMime(),r=new MediaRecorder(next,{...(mimeType?{mimeType}:{}),audioBitsPerSecond:32000});recorder.current=r;chunks.current=[];bytes.current=0;elapsed.current=0;started.current=Date.now();setSeconds(0);
   r.ondataavailable=e=>{if(e.data.size){chunks.current.push(e.data);bytes.current+=e.data.size;if(bytes.current>1_700_000&&r.state!=='inactive')stop();}};
   r.onerror=()=>{setError('녹음이 중단됐어요. 저장된 부분을 확인하거나 다시 녹음해 주세요.');stop();};
   r.onstop=async()=>{releaseStream(next);if(!live.current||discard.current)return;try{
    const mime=r.mimeType.split(';')[0],ext=mime==='audio/mp4'?'m4a':mime==='audio/ogg'?'ogg':'webm';
    const file=new File(chunks.current,`음성메모-${Date.now()}.${ext}`,{type:mime});if(file.size<16)throw new Error('녹음 내용이 없어요. 잠시 녹음한 뒤 완료해 주세요.');
    const ready=await prepareAttachment(file,'AUDIO');if(!live.current||discard.current)return;setPendingAudio(ready);await addRef.current(ready);setPendingAudio(null);if(live.current)setNotice('녹음을 첨부했어요. 아래에서 들어볼 수 있어요.');
   }catch(e){if(live.current)setError((e as Error).message);}finally{if(live.current){setState('idle');recorder.current=null;}}};
   r.start(1000);setState('recording');
  }catch(e){releaseStream(stream.current);if(live.current){setError(mediaPermissionError(e,'마이크'));setState('idle');}}finally{starting.current=false;}
 }
 async function retry(){if(!pendingAudio)return;setState('saving');setError('');try{await addRef.current(pendingAudio);setPendingAudio(null);setNotice('녹음을 첨부했어요.');}catch(e){setError((e as Error).message);}finally{if(live.current)setState('idle');}}
 function cancel(){if((state==='recording'||state==='paused'||pendingAudio)&&!window.confirm('첨부하지 않은 녹음을 지우고 닫을까요?'))return;discard.current=true;onClose();}
 return <section className="memo-capture-panel" aria-label="음성 녹음"><div className="memo-section-heading"><strong><Icon name="mic"/> 녹음기</strong><button type="button" className="icon-button" aria-label="녹음기 닫기" onClick={cancel}><Icon name="close"/></button></div>
 <p className="memo-hint">녹음 시작을 누르면 마이크 권한을 요청해요. 최대 5분 · 화면을 벗어나면 일시정지돼요.</p>
 <div className="memo-recorder-time" data-recording={state==='recording'}><span/>{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</div>
 <div className="memo-capture-actions">{state==='idle'?<button type="button" className="button primary" onClick={()=>void start()}>녹음 시작</button>:state==='asking'?<span role="status">마이크 권한을 확인해 주세요…</span>:state==='saving'?<span role="status">녹음 준비 중…</span>:<><button type="button" className="button" onClick={state==='paused'?resume:pause}>{state==='paused'?'녹음 재개':'일시정지'}</button><button type="button" className="button primary" onClick={stop}>녹음 완료</button></>}</div>
 {pendingAudio&&state==='idle'&&<button type="button" className="button" onClick={()=>void retry()}>녹음 첨부 다시 시도</button>}
 {notice&&<p className="memo-hint" role="status">{notice}</p>}{error&&<p className="memo-error" role="alert">{error}</p>}</section>;
}

import {useEffect,useRef,useState} from 'react';
import {mediaPermissionError} from '../../../../shared/memo-capture';
import {canvasFile,imageCanvas,releaseStream} from './media';
import {Icon} from '../Icon';
export function MemoCamera({scan,onFile,onClose,onActive}:{scan:boolean;onFile:(file:File)=>Promise<void>;onClose:()=>void;onActive:(active:boolean)=>void}){
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),live=useRef(true),generation=useRef(0),picker=useRef<HTMLInputElement>(null),source=useRef<HTMLCanvasElement|null>(null),preview=useRef<HTMLCanvasElement>(null);
 const [state,setState]=useState<'idle'|'asking'|'live'|'review'|'saving'>('idle'),[error,setError]=useState(''),[rotation,setRotation]=useState(0),[crop,setCrop]=useState(0),[mono,setMono]=useState(true);
 const activeRef=useRef(onActive);activeRef.current=onActive;
 useEffect(()=>{live.current=true;return()=>{live.current=false;generation.current++;releaseStream(stream.current);activeRef.current(false);};},[]);
 useEffect(()=>{onActive(state!=='idle');},[state,onActive]);
 useEffect(()=>{const hide=()=>{if(document.hidden){generation.current++;releaseStream(stream.current);stream.current=null;setState(s=>s==='live'||s==='asking'?'idle':s);}};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);},[]);
 useEffect(()=>{if(state!=='review'||!preview.current||!source.current)return;const raw=source.current,c=preview.current;
 const x=Math.round(raw.width*crop/100),y=Math.round(raw.height*crop/100),w=raw.width-x*2,h=raw.height-y*2,swap=rotation%180!==0;
 c.width=swap?h:w;c.height=swap?w:h;const ctx=c.getContext('2d');if(!ctx)return;
 ctx.translate(c.width/2,c.height/2);ctx.rotate(rotation*Math.PI/180);ctx.filter=scan&&mono?'grayscale(1) contrast(1.45) brightness(1.08)':'none';ctx.drawImage(raw,x,y,w,h,-w/2,-h/2,w,h);
 },[state,rotation,crop,mono,scan]);
 async function start(){if(state==='asking'||state==='live')return;setError('');if(!navigator.mediaDevices?.getUserMedia){setError('이 기기는 카메라 미리보기를 지원하지 않아요. 아래 사진 선택으로 촬영하거나 불러와 주세요.');return;}
 const ticket=++generation.current;setState('asking');try{const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1600},height:{ideal:1200}},audio:false});
 if(!live.current||ticket!==generation.current){releaseStream(next);return;}stream.current=next;setState('live');requestAnimationFrame(()=>{if(video.current){video.current.srcObject=next;void video.current.play().catch(()=>{if(live.current){releaseStream(next);setError('카메라 영상을 재생하지 못했어요. 사진 선택을 이용해 주세요.');setState('idle');}});}});
 }catch(e){if(live.current&&ticket===generation.current){setState('idle');setError(mediaPermissionError(e,'카메라'));}}}
 async function selected(file:File){setError('');setState('saving');try{const c=await imageCanvas(file);if(!live.current)return;source.current=c;setRotation(0);setCrop(0);setState('review');}catch(e){if(live.current){setError((e as Error).message);setState('idle');}}}
 async function take(){const v=video.current;if(!v?.videoWidth||!v.videoHeight){setError('카메라가 준비되면 촬영해 주세요.');return;}
 const c=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(v.videoWidth,v.videoHeight));c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);c.getContext('2d')?.drawImage(v,0,0,c.width,c.height);releaseStream(stream.current);stream.current=null;source.current=c;setRotation(0);setCrop(0);setState('review');}
 async function add(){if(!preview.current||state==='saving')return;setState('saving');setError('');try{await onFile(await canvasFile(preview.current,(scan?'문서스캔-':'사진-')+Date.now()+'.jpg'));if(live.current)onClose();}catch(e){if(live.current){setError((e as Error).message);setState('review');}}}
 return <section className="memo-capture-panel" aria-label={scan?'문서 스캔':'카메라 촬영'}><div className="memo-section-heading"><strong><Icon name={scan?'scan':'camera'}/> {scan?'문서 스캔':'카메라'}</strong><button type="button" className="icon-button" aria-label="카메라 닫기" onClick={()=>{if(state!=='review'||window.confirm('첨부하지 않은 촬영 결과를 지우고 닫을까요?'))onClose();}} disabled={state==='saving'}><Icon name="close"/></button></div>
 <p className="memo-hint">{scan?'문서를 반듯하게 촬영하고 여백·회전·흑백 보정을 조절해요.':'카메라 켜기를 누르면 권한을 요청해요. 촬영 후 확인하고 첨부해요.'}</p>
 {state==='live'&&<video ref={video} className="memo-camera-video" autoPlay muted playsInline aria-label="카메라 미리보기"/>}
 {(state==='review'||state==='saving')&&<canvas ref={preview} className="memo-scan-preview" aria-label="촬영 결과 미리보기"/>}
 {state==='review'&&<div className="memo-scan-controls"><button type="button" className="button compact" onClick={()=>setRotation(r=>(r+90)%360)}>90° 회전</button>{scan&&<><label>여백 자르기 {crop}%<input type="range" aria-label="스캔 여백 자르기" min="0" max="25" value={crop} onChange={e=>setCrop(Number(e.target.value))}/></label><button type="button" className="button compact" aria-pressed={mono} onClick={()=>setMono(!mono)}>{mono?'흑백 보정 켜짐':'원본 색상'}</button></>}</div>}
 <div className="memo-capture-actions">{state==='idle'&&<button type="button" className="button primary" onClick={()=>void start()}>카메라 켜기</button>}{state==='asking'&&<span role="status">카메라 권한을 확인해 주세요…</span>}{state==='live'&&<button type="button" className="button primary" onClick={()=>void take()}>촬영</button>}{state==='review'&&<><button type="button" className="button" onClick={()=>setState('idle')}>다시 촬영</button><button type="button" className="button primary" onClick={()=>void add()}>{scan?'스캔 첨부':'사진 첨부'}</button></>}
 {state==='idle'&&<button type="button" className="button" onClick={()=>picker.current?.click()}>사진 선택</button>}<input ref={picker} aria-label="촬영 사진 선택" type="file" hidden accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void selected(file);}}/></div>{error&&<p role="alert" className="memo-error">{error}</p>}</section>;
}

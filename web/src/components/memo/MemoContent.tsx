import {Fragment,useEffect,useRef,useState,type ReactNode} from 'react';
import {Bold,Italic,Heading2,List,Quote,Highlighter,Eye,SquarePen,Link as LinkIcon} from 'lucide-react';
import type {ChecklistItem,MemoAttachmentInput} from '../../../../shared/memo-capture';
import {workspaceRequest} from '../../workspace-api';
import {dataBlob} from './media';
import {Icon} from '../Icon';
// Deliberately bounded Markdown: no raw HTML, embeds, remote image loads or executable URLs.
function inline(text:string):ReactNode[]{
 const parts=text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|==[^=\n]+==|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g);
 return parts.map((part,i)=>{
  if(part.startsWith('**')&&part.endsWith('**'))return <strong key={i}>{part.slice(2,-2)}</strong>;
  if(part.startsWith('*')&&part.endsWith('*'))return <em key={i}>{part.slice(1,-1)}</em>;
  if(part.startsWith('==')&&part.endsWith('=='))return <mark key={i}>{part.slice(2,-2)}</mark>;
  const match=/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
  if(match){try{const url=new URL(match[2]);if(url.protocol==='https:'||url.protocol==='http:')return <a key={i} href={url.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{match[1]}</a>;}catch{}}
  return <Fragment key={i}>{part}</Fragment>;
 });
}
export function MemoBody({body,format}:{body:string;format?:'PLAIN'|'MARKDOWN'}){
 if(format!=='MARKDOWN')return <p className="memo-body">{body}</p>;
 return <div className="memo-body memo-rich-body">{body.split('\n').map((line,i)=>line.startsWith('## ')?<h4 key={i}>{inline(line.slice(3))}</h4>:line.startsWith('> ')?<blockquote key={i}>{inline(line.slice(2))}</blockquote>:line.startsWith('- ')?<div className="memo-bullet" key={i}><span aria-hidden="true">•</span><span>{inline(line.slice(2))}</span></div>:<p key={i}>{line?inline(line):<br/>}</p>)}</div>;
}
export function MemoWriting({body,format,onChange}:{body:string;format?:'PLAIN'|'MARKDOWN';onChange:(body:string,format:'PLAIN'|'MARKDOWN')=>void}){
 const input=useRef<HTMLTextAreaElement>(null),[preview,setPreview]=useState(false);
 function apply(before:string,after='',fallback='내용'){
  const node=input.current,start=node?.selectionStart??body.length,end=node?.selectionEnd??body.length,selected=body.slice(start,end)||fallback;
  const text=body.slice(0,start)+before+selected+after+body.slice(end);if(text.length>10000)return;
  setPreview(false);onChange(text,'MARKDOWN');requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(start+before.length,start+before.length+selected.length);});
 }
 const actions=[{label:'굵게',icon:Bold,before:'**',after:'**'},{label:'기울임',icon:Italic,before:'*',after:'*'},{label:'소제목',icon:Heading2,before:'\n## ',after:''},{label:'글머리 목록',icon:List,before:'\n- ',after:''},{label:'인용',icon:Quote,before:'\n> ',after:''},{label:'강조',icon:Highlighter,before:'==',after:'=='}];
 return <section className="memo-writing" aria-label="글 편집기"><div className="memo-writing-toolbar" role="group" aria-label="글 서식">
 {actions.map(a=><button type="button" key={a.label} title={a.label} aria-label={a.label} onClick={()=>apply(a.before,a.after)}><a.icon size={17}/></button>)}
 <button type="button" aria-label="링크 삽입" title="링크 삽입" onClick={()=>apply('[','](https://)','링크 이름')}><LinkIcon size={17}/></button>
 <button type="button" aria-pressed={preview} className="memo-preview-toggle" onClick={()=>setPreview(!preview)}>{preview?<SquarePen size={16}/>:<Eye size={16}/>} {preview?'편집':'미리보기'}</button></div>
 {preview?<div className="memo-writing-preview" aria-label="글 미리보기"><MemoBody body={body||'아직 작성한 내용이 없어요.'} format={format}/></div>:<label><span className="sr-only">글</span><textarea ref={input} aria-label="글" value={body} onChange={e=>onChange(e.target.value,format||'PLAIN')} maxLength={10000} rows={6} placeholder="오늘의 순간을 자유롭게 남겨요. 서식 버튼으로 글을 정리할 수 있어요."/></label>}
 <div className="memo-word-count">{body.length.toLocaleString()} / 10,000</div></section>;
}
export function MemoChecklist({items,onChange}:{items:ChecklistItem[];onChange?:(items:ChecklistItem[])=>void}){
 return <section className="memo-checklist" aria-label="체크리스트"><div className="memo-section-heading"><strong>체크리스트</strong><span>{items.filter(i=>i.done).length}/{items.length} 완료</span></div>
 {items.map((item,index)=><div className="memo-check-row" key={item.id}><input type="checkbox" aria-label={item.text+' 완료'} checked={item.done} disabled={!onChange} onChange={e=>onChange?.(items.map(i=>i.id===item.id?{...i,done:e.target.checked}:i))}/>
 {onChange?<><input aria-label={'할 일 '+(index+1)} value={item.text} maxLength={240} onChange={e=>onChange(items.map(i=>i.id===item.id?{...i,text:e.target.value}:i))}/><button type="button" className="icon-button" aria-label={'할 일 '+(index+1)+' 삭제'} onClick={()=>onChange(items.filter(i=>i.id!==item.id))}><Icon name="close"/></button></>:<span className={item.done?'is-done':''}>{item.text}</span>}</div>)}
 {onChange&&<button type="button" className="button compact" disabled={items.length>=50} onClick={()=>onChange([...items,{id:crypto.randomUUID(),text:'',done:false}])}><Icon name="plus"/>할 일 추가</button>}</section>;
}
export function MemoAttachmentCard({attachment,spaceId,onRemove}:{attachment:MemoAttachmentInput;spaceId?:string|null;onRemove?:()=>void}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false),live=useRef(true),objectUrl=useRef('');
 useEffect(()=>{live.current=true;return()=>{live.current=false;URL.revokeObjectURL(objectUrl.current);};},[attachment]);
 async function open(){if(loading||url)return;setLoading(true);setError('');try{
  const result='data' in attachment?attachment:await workspaceRequest<{data:string;mime:string}>('memos.attachment',{id:attachment.id},spaceId);
  if(!live.current)return;const next=URL.createObjectURL(dataBlob(result.data,result.mime));objectUrl.current=next;setUrl(next);
 }catch(e){if(live.current)setError((e as Error).message);}finally{if(live.current)setLoading(false);}}
 const audio=attachment.mime.startsWith('audio/'),picture=attachment.mime.startsWith('image/');
 return <article className="memo-attachment-card" aria-label={attachment.name}><div className="memo-attachment-summary"><Icon name={audio?'mic':picture?'image':'file'}/><div><strong>{attachment.name}</strong><small>{({FILE:'파일',AUDIO:'오디오',SCAN:'문서 스캔',SKETCH:'스케치'})[attachment.kind]} · {(attachment.size/1000).toFixed(0)}KB</small></div>{onRemove&&<button type="button" className="icon-button" aria-label={attachment.name+' 삭제'} onClick={onRemove}><Icon name="close"/></button>}</div>
 {url?<>{audio&&<audio controls preload="metadata" src={url} aria-label={attachment.name+' 재생'}/ >}{picture&&<img src={url} alt={attachment.name}/>}<a className="button compact" download={attachment.name} href={url}>파일 내려받기</a></>:<button type="button" className="button compact" disabled={loading} onClick={()=>void open()}>{loading?'불러오는 중…':audio?'녹음 듣기':picture?'이미지 보기':'파일 열기'}</button>}{error&&<p role="alert" className="memo-error">{error}</p>}</article>;
}

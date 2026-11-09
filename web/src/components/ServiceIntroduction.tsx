import {useEffect,useState} from 'react';
import {serviceIntroDefault,type ServiceIntroPublication} from '../../../shared/legal';
import '../legal.css';

export function ServiceIntroduction({publicPage=false}:{publicPage?:boolean}){
 const [publication,setPublication]=useState<ServiceIntroPublication|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();setError('');fetch('/api/v1/legal/service',{cache:'no-store',credentials:'same-origin',signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('최신 서비스 소개를 불러오지 못했습니다.');return response.json();}).then(result=>setPublication(result.publication)).catch(err=>{if(!controller.signal.aborted)setError((err as Error).message);});return()=>controller.abort();},[revision]);
 const document=publication?.document||serviceIntroDefault;
 return <article className={'service-introduction'+(publicPage?' market-container':' workspace-article')} aria-label="서비스 소개 본문"><h2>{document.title}</h2>{publication&&<p className="account-caption">업데이트 {new Date(publication.publishedAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</p>}<div className="legal-prose">{document.body}</div>{error&&<p role="alert">{error} <button type="button" className="button compact" onClick={()=>setRevision(n=>n+1)}>다시 불러오기</button></p>}</article>;
}

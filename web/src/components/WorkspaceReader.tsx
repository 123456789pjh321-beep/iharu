import {useEffect} from 'react';
import {Link,useLocation,useParams,useSearchParams} from 'react-router-dom';
import {publicPosts} from '../../../shared/public-content';
import {Icon} from './Icon';
import {UserGuideContent} from './PublicUserGuide';
import {ServiceIntroduction} from './ServiceIntroduction';
import {MorePageHeading} from './MorePageHeading';
import '../workspace-reader.css';

export function WorkspaceReader({mode,child=false}:{mode:'guide'|'notices'|'blog'|'service';child?:boolean}){
 const {slug}=useParams(),{pathname,search,hash}=useLocation(),[params,setParams]=useSearchParams();
 const label=mode==='service'?'서비스 소개':mode==='guide'?'사용 가이드':mode==='notices'?'공지사항':'블로그',listPath='/more/'+mode;
 const posts=publicPosts.filter(post=>post.section===mode),post=posts.find(post=>post.slug===slug);
 const query=params.get('q')||'',category=params.get('category')||'전체',categories=['전체',...new Set(posts.map(post=>post.category))];
 const shown=posts.filter(post=>(category==='전체'||post.category===category)&&[post.title,post.summary,...post.sections.flatMap(part=>[part.heading,...part.paragraphs])].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const update=(key:string,value:string)=>setParams(previous=>{const next=new URLSearchParams(previous);if(value&&value!=='전체')next.set(key,value);else next.delete(key);return next;},{replace:true});
 useEffect(()=>{
  const frame=requestAnimationFrame(()=>{document.title=(post?.title||label)+' · 아이하루';if(hash)document.getElementById(hash.slice(1))?.scrollIntoView({block:'start'});else{document.getElementById('auth-main')?.scrollTo(0,0);document.getElementById('reader-title')?.focus({preventScroll:true});}});
  return()=>cancelAnimationFrame(frame);
 },[pathname,hash,post?.title,label]);
 return <section className="workspace-reader" aria-labelledby="reader-title">
  <MorePageHeading title={post?.title||label} id="reader-title" backTo={slug?listPath+search:'/more'} backLabel={slug?label+' 목록으로 돌아가기':'더보기로 돌아가기'}/>
  {mode==='service'?<ServiceIntroduction/>:mode==='guide'?<UserGuideContent plain child={child}/>:slug?post?<article className="workspace-article"><div className="reader-post-meta"><span>{post.category}</span><time dateTime={post.date}>{post.date.replaceAll('-','. ')}</time></div><p className="reader-summary">{post.summary}</p>{post.sections.map((part,index)=><section key={part.heading} id={'part-'+index}><h2>{part.heading}</h2>{part.paragraphs.map(text=><p key={text}>{text}</p>)}{part.steps&&<ol>{part.steps.map(text=><li key={text}>{text}</li>)}</ol>}</section>)}<footer className="reader-article-links"><Link to={post.guide.replace('/guide','/help')}>관련 사용 가이드<Icon name="chevron"/></Link></footer></article>:<div className="reader-empty"><h2>글을 찾을 수 없어요.</h2><Link to={listPath}>목록 보기</Link></div>:<>
   <div className="reader-filters"><label className="reader-search"><Icon name="search"/><span className="sr-only">글 검색</span><input type="search" value={query} placeholder="글 검색" onChange={event=>update('q',event.target.value)} maxLength={100}/></label><div className="reader-categories" role="group" aria-label="글 분류">{categories.map(item=><button type="button" key={item} aria-pressed={category===item} onClick={()=>update('category',item)}>{item}</button>)}</div></div>
   <p className="reader-count" role="status">{shown.length}개의 글</p>{shown.length?<div className="reader-post-list">{shown.map(post=><article key={post.slug}><div className="reader-post-meta"><span>{post.category}</span><time dateTime={post.date}>{post.date.replaceAll('-','. ')}</time></div><h2><Link to={listPath+'/'+post.slug+search}>{post.title}</Link></h2><p>{post.summary}</p></article>)}</div>:<div className="reader-empty"><h2>찾는 글이 없어요.</h2><button type="button" className="button" onClick={()=>setParams({},{replace:true})}>전체 글 보기</button></div>}
  </>}
 </section>;
}

import {useWorkspaceGate} from '../components/WorkspaceGate';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {briefingConsentVersion,briefingInstagramChannels,briefingRegionKeyword,briefingRegions,instagramPostLink,suggestBriefingRegion,type BriefingPreferences} from '../../../shared/briefing';
import {briefingRequest} from '../briefing-api';
import {briefingInstagramHighlights} from '../briefing-instagram';
import {briefingCategoryNames,briefingPosterContent,type BriefingItem,type BriefingFeed,type BriefingPost} from '../briefing-poster';
import {briefingCollectionStatus,createBriefingSample} from '../briefing-preview';
import {Icon} from '../components/Icon';
import {useBriefingLocation} from '../components/BriefingLocation';
import {Loading,ErrorState} from '../components/Common';
import {FormNotice} from '../components/AuthLayout';
import {usePullToRefresh} from '../components/usePullToRefresh';
import {useHorizontalCarousel} from '../components/useHorizontalCarousel';
import '../briefing.css';
const timestamp=(date:string|null)=>date?new Date(date).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}):'아직 확인 전';
const relativeTime=(value:string)=>{const minutes=Math.max(0,Math.floor((Date.now()-Date.parse(value))/60000));return minutes<1?'방금 전':minutes<60?minutes+'분 전':minutes<1440?Math.floor(minutes/60)+'시간 전':minutes<10080?Math.floor(minutes/1440)+'일 전':timestamp(value);};
function visibleBriefingPosts(feed:BriefingFeed,saved:boolean){
 return feed.posts.flatMap(post=>{
  const items=post.items.filter(item=>item.editorialType!=='INSTAGRAM'||saved||post.region===feed.preferences.region&&item.validUntil>=feed.serverDay);
  return items.length?[{...post,items}]:[];
 });
}
const photos={FACILITY:{file:'facility',alt:'도서관 외관 주제 사진',credit:'Photos of Korea',url:'https://unsplash.com/photos/g3QB0sjh8p0'},NOTICE:{file:'library',alt:'밝은 독서 공간 주제 사진',credit:'Clay Banks',url:'https://unsplash.com/photos/z_DkoUqgx6M'},EVENT:{file:'park',alt:'초록 공원 주제 사진',credit:'Erdélyi Gergely',url:'https://unsplash.com/photos/av1Jn654PHs'},SAFETY:{file:'park',alt:'생활 지역을 보여주는 공원 주제 사진',credit:'Erdélyi Gergely',url:'https://unsplash.com/photos/av1Jn654PHs'},LOCAL:{file:'park',alt:'지역 소식을 위한 공원 주제 사진',credit:'Erdélyi Gergely',url:'https://unsplash.com/photos/av1Jn654PHs'},WEATHER:{file:'park',alt:'날씨 예보를 위한 야외 주제 사진',credit:'Erdélyi Gergely',url:'https://unsplash.com/photos/av1Jn654PHs'},FOOD:{file:'food',alt:'텐푸라와 밥이 담긴 음식 주제 사진',credit:'Liang Chuang',url:'https://unsplash.com/photos/a-japanese-meal-with-tempura-rice-and-soup-fZ5qgJXTWAM'},DATE:{file:'park',alt:'데이트·나들이 소개를 위한 공원 주제 사진',credit:'Erdélyi Gergely',url:'https://unsplash.com/photos/av1Jn654PHs'},PLACE:{file:'facility',alt:'지역 시설 소개를 위한 건물 주제 사진',credit:'Photos of Korea',url:'https://unsplash.com/photos/g3QB0sjh8p0'},NEWS:{file:'library',alt:'지역 뉴스 소개를 위한 공간 주제 사진',credit:'Clay Banks',url:'https://unsplash.com/photos/z_DkoUqgx6M'}};
export default function BriefingPage(){
 const {markUpdatesRead}=useWorkspaceGate();
 const [params,setParams]=useSearchParams(),saved=params.get('view')==='saved',settings=params.get('settings')==='1';
 const [feed,setFeed]=useState<BriefingFeed|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0),[more,setMore]=useState(false);
 const setSettings=(open:boolean)=>setParams(previous=>{const next=new URLSearchParams(previous);if(open)next.set('settings','1');else next.delete('settings');return next;},{replace:!open});
 const requestGeneration=useRef(0);
 const readFeed=useCallback(async()=>{const generation=++requestGeneration.current;setLoading(true);setMore(false);setError('');try{const data=await briefingRequest<BriefingFeed>('read',{saved});if(generation===requestGeneration.current){setFeed(data);void markUpdatesRead(data.updateReceipt);}}catch(e){if(generation===requestGeneration.current)setError((e as Error).message);}finally{if(generation===requestGeneration.current)setLoading(false);}},[saved,markUpdatesRead]);
 useEffect(()=>{void readFeed();return()=>{requestGeneration.current++;};},[readFeed,revision]);
 const pull=usePullToRefresh(readFeed,!!feed&&!loading&&!more&&!settings);
 const posts=feed?visibleBriefingPosts(feed,saved):[];
 const hasInstagramPosts=posts.some(post=>post.items.some(item=>item.editorialType==='INSTAGRAM'));
 const waitingForFirstPost=!!feed&&!saved&&feed.preferences.enabled&&feed.available&&!hasInstagramPosts;
 useEffect(()=>{
  if(!waitingForFirstPost||loading||settings)return;
  const refreshVisible=()=>{if(document.visibilityState==='visible')void readFeed();};
  const interval=window.setInterval(refreshVisible,60000);
  document.addEventListener('visibilitychange',refreshVisible);
  return()=>{window.clearInterval(interval);document.removeEventListener('visibilitychange',refreshVisible);};
 },[waitingForFirstPost,loading,settings,readFeed]);

 async function loadMore(){if(!feed?.nextCursor||more)return;setMore(true);const generation=requestGeneration.current;try{const next=await briefingRequest<BriefingFeed>('read',{saved,cursor:feed.nextCursor});if(generation!==requestGeneration.current)return;setFeed(old=>old?{...next,posts:[...old.posts,...next.posts.filter(p=>!old.posts.some(x=>x.id===p.id))]}:next);}catch(e){if(generation===requestGeneration.current)setError((e as Error).message);}finally{if(generation===requestGeneration.current)setMore(false);}}
 const update=(post:BriefingPost)=>setFeed(old=>old?{...old,posts:old.posts.flatMap(p=>p.id===post.id?(saved&&!post.saved?[]:[post]):[p])}:old);
 const hide=(id:string)=>setFeed(old=>old?{...old,posts:old.posts.filter(p=>p.id!==id)}:old);
 if(loading&&!feed)return <Loading label="내 브리핑을 확인하고 있어요"/>;
 if(!feed)return <ErrorState message={error} retry={()=>setRevision(x=>x+1)}/>;
 const pref=feed.preferences;
 const channels=briefingInstagramChannels(pref.region);
 const showChannels=pref.enabled&&!saved&&channels.length>0&&!hasInstagramPosts;
 const highlights=showChannels?briefingInstagramHighlights(pref.region,feed.serverDay):[];
 const sample=!saved&&pref.enabled&&!posts.length&&!showChannels,status=briefingCollectionStatus(pref,feed.available);
 const searchRegion=briefingRegions.includes(pref.region)?pref.region==='경기도 화성시'?'화성·동탄':briefingRegionKeyword(pref.region):'';
 const searchQuery=searchRegion==='화성·동탄'?'동탄 화성 지역 소식':searchRegion+' 지역 소식';
 return <div ref={pull.ref} className="briefing-screen" aria-busy={loading||undefined} aria-keyshortcuts="Alt+R"><div className="briefing-pull-indicator" aria-hidden="true"><span><Icon name="repeat"/></span></div><span className="briefing-pull-status" role="status" aria-live="polite">{pull.phase==='armed'?'놓으면 새로고침해요':pull.phase==='refreshing'?'새 소식을 확인하고 있어요':''}</span><div className="briefing-pull-content">
 <div className="briefing-layout"><section className="briefing-feed" aria-label={saved?'보관한 브리핑 피드':'AI 브리핑 피드'}><FormNotice error={error}/>
 {!pref.enabled?<section className="briefing-onboarding"><img src="/briefing/library.jpg" alt="책과 햇살이 있는 독서 공간" width="1200" height="800"/><div><h2>우리 동네 갈 곳과 볼거리<br/>한눈에 챙겨보세요</h2><p>기준 지역의 공개 인스타그램 게시물과 내 일정에 맞는 공식 공지를 모아드려요.</p><button className="button primary" type="button" onClick={()=>setSettings(true)}>내 브리핑 시작하기<Icon name="arrow"/></button></div></section>
 :<>
 {!saved&&searchRegion&&<div className="briefing-instagram-search"><a className="button" href={'https://www.instagram.com/explore/search/keyword/?q='+encodeURIComponent(searchQuery)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><Icon name="search"/>인스타그램에서 {searchRegion} 소식 찾기</a></div>}
 {!saved&&(sample||showChannels&&!highlights.length||status.tone==='warning')&&<section className={'briefing-collection-status '+status.tone} role="status"><Icon name={status.tone==='warning'?'clock':'sparkles'}/><div><strong>{status.title}</strong><p>{status.description}</p><small>최근 수집: {timestamp(pref.lastCheckedAt)}</small></div></section>}
 {showChannels&&<InstagramChannelFeed key={pref.region} channels={channels} highlights={highlights}/>}
 {posts.map(post=><BriefingCard key={post.id} post={post} changed={update} hidden={()=>hide(post.id)}/>)}
 {sample&&<><section className="briefing-sample-notice" aria-label="샘플 브리핑 안내"><span>샘플 브리핑</span><h2>이런 소식을 모아 보여드려요</h2><p>아래는 가상 예시예요. 실제 공지·행사·날씨가 아니며, 내 소식으로 저장되지 않아요.</p></section><BriefingCard key="sample-briefing" post={createBriefingSample(feed.serverDay,pref.region)} sample/></>}
 {saved&&!posts.length&&<section className="briefing-empty"><span><Icon name="bookmark"/></span><h2>보관한 소식이 없어요</h2><p>다시 보고 싶은 실제 소식의 보관 버튼을 눌러 주세요.</p><Link to="/briefing" className="button">전체 소식 보기<Icon name="arrow"/></Link></section>}
 {feed.hasMore&&<button type="button" className="button briefing-load" disabled={more} onClick={()=>void loadMore()}>{more?'불러오는 중…':'이전 소식 더 보기'}</button>}</>}

 </section></div>
 </div>{settings&&<BriefingSettings preferences={pref} close={()=>setSettings(false)} saved={()=>{setSettings(false);setRevision(x=>x+1);}}/>}</div>;
}

function InstagramChannelFeed({channels,highlights}:{channels:ReturnType<typeof briefingInstagramChannels>;highlights:ReturnType<typeof briefingInstagramHighlights>}){
 const [active,setActive]=useState('');
 const channel=channels.find(entry=>entry.account===active);
 return <section className="briefing-instagram-channels" aria-labelledby="briefing-instagram-channels-title">
  <h2 id="briefing-instagram-channels-title">지역 인스타그램 소식</h2>
  {highlights.length>0&&<div className="briefing-instagram-highlights">
   {highlights.map(post=><article key={post.id} className="briefing-instagram-highlight">
    <div>화성특례시 · {post.topic} · <time dateTime={post.publishedAt}>{post.publishedAt}</time></div>
    <h3>{post.title}</h3>
    <p>{post.summary}</p>
    <a className="briefing-source" href={`https://www.instagram.com/${post.kind}/${post.id}/`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{post.kind==='reel'?'인스타그램 릴스 보기':'인스타그램 게시물 보기'}<Icon name="arrow"/></a>
   </article>)}
  </div>}
  <div className="briefing-instagram-channel-buttons">
   {channels.map(entry=><button key={entry.account} type="button" className="button" aria-pressed={entry.account===active} onClick={()=>setActive(entry.account===active?'':entry.account)}>{entry.name}</button>)}
  </div>
  {channel&&<div className="briefing-instagram-embed">
   <a className="briefing-source" href={`https://www.instagram.com/${channel.account}/`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{channel.name} 인스타그램 열기<Icon name="arrow"/></a>
   <iframe key={channel.account} title={`${channel.name} 인스타그램 최신 게시물`} src={`https://www.instagram.com/${channel.account}/embed/`} referrerPolicy="no-referrer" allow="fullscreen"/>
  </div>}
 </section>;
}

function BriefingCard({post,changed,hidden,sample=false}:{post:BriefingPost;changed?:(post:BriefingPost)=>void;hidden?:()=>void;sample?:boolean}){
 const carousel=useHorizontalCarousel(post.items.length),index=Math.min(carousel.index,post.items.length-1);
 const [expanded,setExpanded]=useState(false),[menu,setMenu]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const item=post.items[Math.min(index,post.items.length-1)],collection=item.topic||item.collectionType||item.category,photo=photos[collection];
 const instagram=item.editorialType==='INSTAGRAM'?instagramPostLink(item.sourceUrl):null;
 const [embeddedId,setEmbeddedId]=useState<string|null>(null);
 const sourceLabel=instagram?.kind==='reel'?'인스타그램 릴스 열기':'인스타그램 게시물 열기';
 async function feedback(action:'saved'|'helpful'|'hidden',value:boolean){if(sample||busy)return;setBusy(true);setError('');try{const result=await briefingRequest<BriefingPost>('feedback',{postId:post.id,action,value});if(action==='hidden')hidden?.();else changed?.(result);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function share(){
  if(sample)return;setError('');setNotice('');
  try{if(navigator.share)await navigator.share({title:item.title,url:item.sourceUrl});else{await navigator.clipboard.writeText(item.sourceUrl);setNotice('원문 링크를 복사했어요.');}}
  catch(e){if((e as Error).name!=='AbortError')setError('공유하지 못했어요. 출처 원문을 열어 링크를 확인해 주세요.');}
 }
 return <article className="briefing-card" data-sample={sample||undefined} aria-label={sample?'샘플 브리핑 카드':undefined} id={'briefing-'+post.id}>
  <div className="briefing-media">
   <header className="briefing-publisher"><span className="briefing-avatar"><Icon name="sparkles"/></span><div><strong>아이하루 브리핑<span>{sample?'샘플':instagram?'Instagram':item.editorialType==='REGIONAL_GUIDE'?'가이드':'AI'}</span></strong><small>{post.region} · {briefingCategoryNames[collection]}</small></div>{sample?<span className="briefing-preview-label">미리보기</span>:<><a className="briefing-original" href={item.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={instagram?sourceLabel:'출처 원문 열기'}>원문 보기</a><button type="button" className="icon-button" aria-label="소식 메뉴" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><Icon name="more"/></button></>}{!sample&&menu&&<div className="briefing-post-menu"><button type="button" disabled={busy} onClick={()=>void feedback('hidden',true)}>이 소식 숨기기</button></div>}</header>
   <div className="briefing-photo" role={post.items.length>1?'group':undefined} aria-roledescription={post.items.length>1?'캐러셀':undefined} tabIndex={post.items.length>1?0:undefined} aria-label={post.items.length>1?'소식 사진, 좌우로 밀거나 방향키로 주제 이동':undefined} onKeyDown={e=>{if(e.key==='ArrowRight'){e.preventDefault();carousel.move(1);}if(e.key==='ArrowLeft'){e.preventDefault();carousel.move(-1);}}}>
    <div ref={carousel.ref} className={'briefing-carousel-viewport '+(post.items.length>1?'has-topics':'')}>
     {post.items.map((slide,i)=><BriefingSlide key={slide.fingerprint} item={slide} current={i===index} urgent={post.kind==='URGENT'} sample={sample}/>)}
    </div>
    {post.items.length>1&&<span className="briefing-counter" aria-live="polite" aria-atomic="true">{index+1} / {post.items.length}</span>}
   </div>
  </div>
  <div className="briefing-actions"><div className="briefing-actions-left">{sample?<span className="briefing-sample-actions" aria-hidden="true"><Icon name="heart"/><Icon name="chat"/><Icon name="send"/></span>:<><button type="button" className={'icon-button '+(post.helpful?'selected':'')} aria-label="도움이 됐어요" aria-pressed={post.helpful} disabled={busy} onClick={()=>void feedback('helpful',!post.helpful)}><Icon name="heart"/></button><button type="button" className="icon-button" aria-label="브리핑 상세 보기" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}><Icon name="chat"/></button><button type="button" className="icon-button" aria-label="소식 공유" onClick={()=>void share()}><Icon name="send"/></button></>}</div><div className="briefing-dots">{post.items.length>1&&post.items.map((_,i)=><button key={i} type="button" className={index===i?'active':''} aria-label={(i+1)+'번째 주제 보기'} aria-pressed={index===i} onClick={()=>carousel.goTo(i)}/>)}</div>{sample?<span className="briefing-sample-bookmark" aria-hidden="true"><Icon name="bookmark"/></span>:<button type="button" className={'icon-button '+(post.saved?'selected':'')} aria-label="소식 보관" aria-pressed={post.saved} disabled={busy} onClick={()=>void feedback('saved',!post.saved)}><Icon name="bookmark"/></button>}</div>
  <div className="briefing-caption"><div className="briefing-caption-intro"><p className={expanded?'':'briefing-summary'}><strong>아이하루 브리핑</strong> {item.summary}</p><button className="briefing-expand" type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'간단히 보기':'더 보기'}</button></div>
   {expanded&&<div className="briefing-details"><p><strong>나에게 필요한 이유</strong>{item.reason}</p><p><strong>챙겨볼 일</strong>{item.action}</p><p><strong>{sample?'예시 안내':instagram?'게시물의 지역 표기':'확인한 원문'}</strong>{item.evidenceQuote}</p>{!sample&&!instagram&&<p><strong>{item.editorialType==='REGIONAL_GUIDE'?'공식 정보 확인':'적용 기간'}</strong>{item.editorialType==='REGIONAL_GUIDE'?timestamp(item.sourceCheckedAt||post.updatedAt):item.validFrom+' ~ '+item.validUntil}</p>}</div>}
   {sample?<span className="briefing-source">가상 예시 · 실제 공지·예보가 아닙니다</span>:<a className="briefing-source" href={item.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{instagram?sourceLabel:item.sourceName}<Icon name="arrow"/></a>}
   {instagram&&item.instagramEmbeddable&&<div className="briefing-instagram-embed"><button className="button" type="button" aria-expanded={embeddedId===instagram.id} onClick={()=>setEmbeddedId(embeddedId===instagram.id?null:instagram.id)}>{embeddedId===instagram.id?'게시물 닫기':'앱에서 게시물 보기'}</button>{embeddedId===instagram.id&&<iframe key={instagram.id} title={`인스타그램 원본 · ${item.title}`} src={instagram.url+'embed/captioned/'} referrerPolicy="no-referrer" allow="fullscreen"/>}</div>}
   <div className="briefing-post-time">{item.publishedAt&&<span>{instagram?'게시':'보도'} {item.publishedAt} · </span>}{sample?<span>화면 설명용 샘플</span>:<time dateTime={post.updatedAt} title={timestamp(post.updatedAt)}>{relativeTime(post.updatedAt)}{post.updatedAt!==post.createdAt&&' · 업데이트'}</time>}</div>
   <div className="briefing-meta">{!sample&&collection==='WEATHER'&&<span><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> · 수치 반올림·한국어 요약</span>}<a href={photo.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">사진 {photo.credit} / Unsplash</a></div><p className="briefing-share-notice" role="status">{notice}</p><FormNotice error={error}/>
  </div>
 </article>;
}
function BriefingSlide({item,current,urgent,sample}:{item:BriefingItem;current:boolean;urgent:boolean;sample:boolean}){
 const collection=item.topic||item.collectionType||item.category,photo=photos[collection],poster=briefingPosterContent(item);
 return <div className="briefing-slide" aria-hidden={!current}>
  <img src={'/briefing/'+photo.file+'.jpg'} alt={photo.alt} width="1200" height="1500" loading="lazy" draggable={false}/>
  <div className="briefing-headline"><span className={'briefing-category '+(urgent?'urgent':'')}>{urgent?'중요 안전 소식':briefingCategoryNames[collection]}{sample&&' · 예시'}</span><h2>{item.title}</h2><p className="briefing-poster-summary">{poster.summary}</p>{poster.points.length>0&&<ul className="briefing-poster-points">{poster.points.map((point,i)=><li key={i}>{point}</li>)}</ul>}</div><span className="briefing-photo-label">주제 사진</span>
 </div>;
}

function BriefingSettings({preferences,close,saved}:{preferences:BriefingPreferences;close:()=>void;saved:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false),requested=useRef(false),location=useBriefingLocation(),[enabled,setEnabled]=useState(preferences.enabled),[region,setRegion]=useState(briefingRegions.includes(preferences.region)?preferences.region:''),[consent,setConsent]=useState(preferences.enabled),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();},[]);
 useEffect(()=>{if(!requested.current||!location.point)return;requested.current=false;const next=suggestBriefingRegion(location.point.latitude,location.point.longitude);if(next){setRegion(next);setError('추천 지역이 맞는지 확인한 뒤 저장해 주세요.');}else setError('가까운 지역을 추천하지 못했어요. 목록에서 기준 지역을 선택해 주세요.');},[location.point]);
 function recommendRegion(){const point=location.getBriefingLocation();if(point){const next=suggestBriefingRegion(point.latitude,point.longitude);if(next){setRegion(next);setError('추천 지역이 맞는지 확인한 뒤 저장해 주세요.');}else setError('목록에서 기준 지역을 선택해 주세요.');}else{requested.current=true;location.enable();}}
 async function submit(e:FormEvent){e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await briefingRequest('preferences.save',{enabled,region,consent,consentVersion:briefingConsentVersion,version:preferences.version});saved();}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 return (
  <dialog ref={ref} className="personal-editor briefing-settings" aria-labelledby="briefing-settings-title" onCancel={e=>{e.preventDefault();if(!busy)close();}}>
   <header><h2 id="briefing-settings-title">내 브리핑 설정</h2><button type="button" className="icon-button" aria-label="브리핑 설정 닫기" disabled={busy} onClick={close}><Icon name="close"/></button></header>
   <form onSubmit={submit} className="auth-form">
    <fieldset disabled={busy}>
     {preferences.lastState==='CONSENT_UPDATE'&&<p role="status">AI 처리 방식이 바뀌어 브리핑을 잠시 멈췄어요. 아래 안내를 확인하고 다시 켤 수 있어요.</p>}
     <label className="briefing-check-label"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>AI 브리핑 사용</label>
     <label className="form-field">기준 지역
      <select aria-label="브리핑 기준 지역" value={region} onChange={e=>setRegion(e.target.value)} required={enabled}>
       <option value="">지역 선택</option>
       {briefingRegions.map(name=><option key={name}>{name}</option>)}
      </select>
     </label>
     <button type="button" className="button" onClick={recommendRegion}>현재 위치로 지역 추천<Icon name="pin"/></button>
     <p className="account-caption">지역 추천은 기기에서 계산해요. 기준 지역이 동탄구인 경우 화성시의 공개 소식을 검색한 뒤 동탄 관련 게시물을 골라요.</p>
     {location.status==='locating'&&<p role="status">위치를 확인하고 있어요…</p>}
     {location.message&&location.status==='error'&&<p role="alert">{location.message}</p>}
     <label className="briefing-check-label">
      <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required={enabled}/>
      <span>기준 지역과 기준일을 OpenAI의 공개 소식 검색에 사용하는 데 동의해요.</span>
     </label>
     <p className="account-caption">가족 일정과 공개 소식의 대조는 아이하루 서버에서만 해요. 브리핑은 선택 기능이며, 설정에서 끄면 이용 동의를 철회하고 계정에 저장한 브리핑을 삭제해요.</p>
     <p className="account-caption"><a href="https://platform.openai.com/docs/guides/your-data" target="_blank" rel="noopener noreferrer">OpenAI API 데이터 처리 안내</a></p>
     <FormNotice error={error}/><button className="button primary" type="submit">{busy?'저장 중…':'설정 저장'}</button>
    </fieldset>
   </form>
  </dialog>
 );
}

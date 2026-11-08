import {useRef} from 'react';
import {conversationStickers,type ConversationSticker} from '../../../shared/conversation-stickers';
import {Icon} from './Icon';

export function ConversationStickerArt({sticker}:{sticker:ConversationSticker}){
 return <svg className="conversation-sticker-art" viewBox="0 0 100 100" role="img" aria-label={sticker.label}>
  <rect x="1" y="1" width="98" height="98" rx="18" fill="var(--sticker-paper)"/>
  <circle cx="50" cy="36" r="29" fill="var(--sticker-wash)"/>
  <image href={sticker.src} x="25" y="11" width="50" height="50"/>
  <text x="50" y="84" textAnchor="middle" fill="var(--sticker-ink)" fontSize="14" fontWeight="800" fontFamily="inherit">{sticker.label}</text>
 </svg>;
}

export function ConversationStickers({selected,disabled,onSelect}:{selected?:string;disabled:boolean;onSelect:(sticker:ConversationSticker)=>void}){
 const tray=useRef<HTMLDivElement>(null);
 const slide=(direction:number)=>tray.current?.scrollBy({left:direction*tray.current.clientWidth*.85,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 return <section className="conversation-stickers" aria-label="그림으로 말하기">
  <div className="conversation-stickers-heading"><strong>그림으로 말해요</strong><span>골라서 보내요</span><div>
   <button type="button" aria-label="이전 그림 보기" onClick={()=>slide(-1)}><Icon name="chevron" className="flip"/></button>
   <button type="button" aria-label="다음 그림 보기" onClick={()=>slide(1)}><Icon name="chevron"/></button>
  </div></div>
  <div ref={tray} className="conversation-sticker-tray" role="group" aria-label="그림 메시지 선택">
   {conversationStickers.map(sticker=><button type="button" key={sticker.id} aria-label={sticker.label+' 그림 선택'} aria-pressed={selected===sticker.id} disabled={disabled} onClick={()=>onSelect(sticker)}><ConversationStickerArt sticker={sticker}/></button>)}
  </div>
 </section>;
}

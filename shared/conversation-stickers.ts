// Store readable text through the existing chat API, so older clients and search
// retain the meaning. Only an exact catalog message renders as a picture card.
const entries = [
 ['hello','안녕','👋','hello'], ['where','어디야','📍','where'],
 ['academy','학원','🏫','arrived'], ['dad','아빠','👨','family/dad'],
 ['mom','엄마','👩','family/mom'], ['home','나 집이야','🏠','home'],
 ['leaving','출발해','🎒','leaving'], ['arrived','도착했어','🏫','arrived'],
 ['pickup','데리러 와','🚗','pickup'], ['finished','끝났어','✅','finished'],
 ['call','전화해 줘','📞','call'], ['waiting','기다릴게','🪑','waiting'],
 ['yes','응, 알겠어','👍','yes'], ['no','아니야','🙅','no'],
 ['okay','괜찮아','👌','okay'], ['help','도와줘','🙋','help'],
 ['hurt','아파요','🤒','hurt'], ['hungry','배고파','🍙','hungry'],
 ['water','목말라','💧','water'], ['eating','밥 먹어','🍚','eating'],
 ['love','사랑해','💛','love'], ['thanks','고마워','🤗','thanks'],
 ['miss','보고 싶어','🥰','miss'], ['goodnight','잘 자','🌙','goodnight'],
] as const;
export const conversationStickers=entries.map(([id,label,emoji,art])=>({
 id,label,emoji,message:`${emoji} ${label}`,
 src:art.startsWith('family/')?`/stickers/${art}.svg`:`/stickers/v1/${art}.svg`,
}));
export type ConversationSticker=typeof conversationStickers[number];
export const conversationSticker=(message:string)=>conversationStickers.find(s=>s.message===message);

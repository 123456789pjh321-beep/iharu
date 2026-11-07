export const messageGroups = [["daily", "일상"], ["move", "이동"], ["feeling", "기분"], ["need", "부탁"], ["love", "마음"], ["reply", "답장"]] as const;
const v2 = [
  {
    "id": "hello",
    "group": "daily",
    "emoji": "👋",
    "label": "안녕하세요"
  },
  {
    "id": "arrived",
    "group": "daily",
    "emoji": "🏫",
    "label": "도착했어요"
  },
  {
    "id": "finished",
    "group": "daily",
    "emoji": "✅",
    "label": "끝났어요"
  },
  {
    "id": "waiting",
    "group": "daily",
    "emoji": "🪑",
    "label": "기다릴게요"
  },
  {
    "id": "eating",
    "group": "daily",
    "emoji": "🍚",
    "label": "밥 먹어요"
  },
  {
    "id": "resting",
    "group": "daily",
    "emoji": "🛋️",
    "label": "쉬고 있어요"
  },
  {
    "id": "leaving",
    "group": "move",
    "emoji": "🎒",
    "label": "이제 출발해요"
  },
  {
    "id": "home",
    "group": "move",
    "emoji": "🏠",
    "label": "집에 왔어요"
  },
  {
    "id": "bus",
    "group": "move",
    "emoji": "🚌",
    "label": "버스를 탔어요"
  },
  {
    "id": "walk",
    "group": "move",
    "emoji": "🚶",
    "label": "걸어가요"
  },
  {
    "id": "pickup",
    "group": "move",
    "emoji": "🚗",
    "label": "데리러 와 주세요"
  },
  {
    "id": "where",
    "group": "move",
    "emoji": "📍",
    "label": "어디에서 만나요"
  },
  {
    "id": "happy",
    "group": "feeling",
    "emoji": "😄",
    "label": "기분이 좋아요"
  },
  {
    "id": "sad",
    "group": "feeling",
    "emoji": "😢",
    "label": "슬퍼요"
  },
  {
    "id": "worried",
    "group": "feeling",
    "emoji": "😟",
    "label": "걱정돼요"
  },
  {
    "id": "angry",
    "group": "feeling",
    "emoji": "😠",
    "label": "화가 나요"
  },
  {
    "id": "tired",
    "group": "feeling",
    "emoji": "🥱",
    "label": "피곤해요"
  },
  {
    "id": "excited",
    "group": "feeling",
    "emoji": "🤩",
    "label": "신나요"
  },
  {
    "id": "help",
    "group": "need",
    "emoji": "🙋",
    "label": "도와주세요"
  },
  {
    "id": "hurt",
    "group": "need",
    "emoji": "🤒",
    "label": "몸이 아파요"
  },
  {
    "id": "hungry",
    "group": "need",
    "emoji": "🍙",
    "label": "배가 고파요"
  },
  {
    "id": "water",
    "group": "need",
    "emoji": "💧",
    "label": "목이 말라요"
  },
  {
    "id": "call",
    "group": "need",
    "emoji": "📞",
    "label": "전화해 주세요"
  },
  {
    "id": "wait",
    "group": "need",
    "emoji": "⏳",
    "label": "조금 기다려 주세요"
  },
  {
    "id": "love",
    "group": "love",
    "emoji": "💛",
    "label": "사랑해요"
  },
  {
    "id": "thanks",
    "group": "love",
    "emoji": "🤗",
    "label": "고마워요"
  },
  {
    "id": "sorry",
    "group": "love",
    "emoji": "🙏",
    "label": "미안해요"
  },
  {
    "id": "miss",
    "group": "love",
    "emoji": "🥰",
    "label": "보고 싶어요"
  },
  {
    "id": "cheer",
    "group": "love",
    "emoji": "💪",
    "label": "응원해요"
  },
  {
    "id": "goodnight",
    "group": "love",
    "emoji": "🌙",
    "label": "잘 자요"
  },
  {
    "id": "yes",
    "group": "reply",
    "emoji": "👍",
    "label": "알겠어요"
  },
  {
    "id": "no",
    "group": "reply",
    "emoji": "🙅",
    "label": "아니에요"
  },
  {
    "id": "okay",
    "group": "reply",
    "emoji": "👌",
    "label": "괜찮아요"
  },
  {
    "id": "again",
    "group": "reply",
    "emoji": "🔁",
    "label": "다시 알려 주세요"
  },
  {
    "id": "soon",
    "group": "reply",
    "emoji": "🕐",
    "label": "조금 뒤예요"
  },
  {
    "id": "dontknow",
    "group": "reply",
    "emoji": "🤔",
    "label": "잘 모르겠어요"
  }
] as const;
export function messageCatalog(version:number=2){return v2.map((item,order)=>({...item,order,version,label:version===1&&item.id==="soon"?"조금 뒤에요":item.label}));}
export type Sticker = ReturnType<typeof messageCatalog>[number];


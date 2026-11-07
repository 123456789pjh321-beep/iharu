// User-provided timetable, used only by demo/test flows. Not imported into live families.
// Ages are supplied labels, not verified dates of birth. School morning start is unknown.
export const sampleChildren=[{id:'demo-seojun',name:'서준',age:8,grade:'8세 · 초등학교 1학년',color:'mint'},{id:'demo-seoha',name:'서하',age:7,grade:'7세 · 유치원',color:'peach'}] as const;
export const sampleSchedule=[
 {title:'점심',days:[1,2,3,4,5],start:'12:10',end:'13:10',place:'학교',kind:'school'},
 {title:'5교시',days:[1,2,4],start:'13:10',end:'13:50',place:'학교',kind:'school'},
 {title:'돌봄교실',days:[1,2,4],start:'13:50',end:'14:15',place:'학교',kind:'school'},
 {title:'돌봄교실',days:[3,5],start:'13:10',end:'14:15',place:'학교',kind:'school'},
 {title:'로고스 영어',days:[1,3,5],start:'14:15',end:'16:00',place:'14:15 학교 정문 건너편 하교',kind:'academy'},
 {title:'보드게임',days:[2],start:'14:15',end:'15:10',place:'4층 제2영어실',kind:'school'},
 {title:'실험과학',days:[4],start:'14:15',end:'15:10',place:'2층 과학실',kind:'school'},
 {title:'리드인독서논술',days:[2,4],start:'16:00',end:'17:00',place:'',kind:'academy'},
 {title:'눈높이',days:[2,4],start:'17:10',end:'18:10',place:'',kind:'academy'},
 {title:'상무태권도',days:[1,2,3,4,5],start:'18:10',end:'19:20',place:'',kind:'academy'},
] as const;
// Every row is a weekly recurring plan. Date range is a test horizon, not the child's term dates.
export function sampleRecurringInputs(from:string,until:string){return sampleSchedule.map(r=>({title:r.title,place:r.place,date:from,untilDate:until,startTime:r.start,endTime:r.end,frequency:'WEEKLY',weekdays:[...r.days],holidayPolicy:'ASK'}));}


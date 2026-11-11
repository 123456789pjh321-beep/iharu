/** Calendar presentation only; never used to decide public holidays or recurrence. */
export type CalendarDayBadge={label:string;sourceLabel:string;tone:'holiday'|'observance'};
export function calendarDayBadge(date:string,officialName:string):CalendarDayBadge|null{
 if(officialName)return {
  label:officialName.replaceAll('기독탄신일','성탄절').replaceAll('1월1일','신정'),
  sourceLabel:officialName,tone:'holiday',
 };
 // Quiet calendar annotations, separate from the official holiday feed.
 const label=/^\d{4}-12-24$/.test(date)?'크리스마스 이브':/^\d{4}-12-31$/.test(date)?'새해 전날':'';
 return label?{label,sourceLabel:label,tone:'observance'}:null;
}

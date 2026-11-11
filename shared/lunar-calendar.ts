// Display only. Gregorian dates remain the storage and recurrence contract.
// ICU's Dangi calendar is the traditional Korean calendar (Asia/Seoul).
const lunarFormatter=(()=>{
 try{
  const formatter=new Intl.DateTimeFormat('ko-KR-u-ca-dangi',{month:'numeric',day:'numeric',timeZone:'Asia/Seoul'});
  return formatter.resolvedOptions().calendar==='dangi'?formatter:null;
 }catch{return null;}
})();
export function lunarDateCaption(date:string):string{
 if(!lunarFormatter||!/^\d{4}-\d{2}-\d{2}$/.test(date))return '';
 const value=new Date(date+'T12:00:00+09:00');
 if(Number.isNaN(value.getTime()))return '';
 const parts=lunarFormatter.formatToParts(value),month=parts.find(p=>p.type==='month')?.value||'',day=parts.find(p=>p.type==='day')?.value||'';
 const monthNumber=month.match(/\d+/)?.[0],dayNumber=day.match(/\d+/)?.[0];
 return monthNumber&&dayNumber?`${month.includes('윤')?'윤':''}${Number(monthNumber)}/${Number(dayNumber)}`:'';
}

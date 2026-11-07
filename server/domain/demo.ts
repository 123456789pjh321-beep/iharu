import { dashboardSchema, type ChildFilter, type Dashboard } from '../../shared/contracts.js';

import {sampleChildren,sampleSchedule} from './sample-schedule.js';
const children: Dashboard['children'] = sampleChildren.map(c=>({...c}));
const events:Dashboard['events']=[];
// Fixed September sample horizon; no invented dates, attendance or tuition records.
for(let day=1;day<=30;day++){
 const date=`2026-09-${String(day).padStart(2,'0')}`,weekday=new Date(date+'T00:00:00Z').getUTCDay();
 sampleSchedule.forEach((r,i)=>{if((r.days as readonly number[]).includes(weekday))events.push({id:`sample-${day}-${i}`,childId:'demo-seojun',date,start:r.start,end:r.end,title:r.title,place:r.place,kind:r.kind,status:'check'});});
}
const holidays = [
  { date:'2026-09-24', title:'추석 연휴' }, { date:'2026-09-25', title:'추석' }, { date:'2026-09-26', title:'추석 연휴' },
  { date:'2026-10-03', title:'개천절' }, { date:'2026-10-05', title:'대체공휴일' }, { date:'2026-10-09', title:'한글날' },
];
const tuition:Dashboard['tuition']=[]; // No fee amounts were provided.
export function getDemoDashboard(child: ChildFilter, month: string): Dashboard {
  const allowed = (id: string) => child === 'all' || id === child;
  return dashboardSchema.parse({ sampleDate:'2026-09-17', children,
    events:events.filter(e => allowed(e.childId) && e.date.startsWith(month)),
    holidays:holidays.filter(h => h.date.startsWith(month)),
    tuition:month === '2026-09' ? tuition.filter(t => allowed(t.childId)) : [],
  });
}


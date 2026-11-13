import {expect,type Page} from '@playwright/test';

export async function selectCalendarView(page:Page,view:'월간'|'주간'|'일간'){
 await page.locator('summary[aria-label="달력 보기 선택"]').click();
 await page.getByRole('group',{name:'달력 보기',exact:true}).getByRole('button',{name:view,exact:true}).click();
}
export async function openMemberPreferences(page:Page){
 const dialog=page.getByRole('dialog',{name:'조회할 구성원',exact:true});
 if(!await dialog.isVisible())await page.getByRole('button',{name:/^구성원 필터 설정 ·/}).click();
 await expect(dialog).toBeVisible();
 return dialog;
}
export async function selectAllMembers(page:Page){
 const dialog=await openMemberPreferences(page);
 await dialog.getByRole('button',{name:'전체선택',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'전체선택',exact:true})).toHaveAttribute('aria-pressed','true');
 await dialog.getByRole('button',{name:'선택 완료',exact:true}).click();
}
export async function saveMemberPreference(page:Page){
 const dialog=await openMemberPreferences(page);
 await Promise.all([
  page.waitForResponse(response=>response.url().includes('/workspace/member-filter.preference.save')&&response.request().method()==='POST'),
  dialog.getByRole('button',{name:/첫 화면으로 저장$/}).click(),
 ]);
 await expect(dialog.getByRole('button',{name:/첫 화면으로/})).toHaveAttribute('aria-busy','false');
 await dialog.getByRole('button',{name:'선택 완료',exact:true}).click();
}

export async function setCalendarTheme(page:Page,theme:'밝게'|'어둡게'){
 await page.goto('/settings');
 await page.getByRole('button',{name:theme,exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme',theme==='어둡게'?'dark':'light');
 await page.goto('/today/calendar');
}

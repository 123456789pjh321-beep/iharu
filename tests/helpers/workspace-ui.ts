import {expect,type Page} from '@playwright/test';

// Input actions can find a visible form while the startup layer still makes it inert.
export async function waitForAppReady(page:Page){
 await expect(page.locator('#app-launch')).toHaveCount(0,{timeout:12000});
 await expect(page.locator('#root')).not.toHaveAttribute('inert');
}

export async function selectCalendarView(page:Page,view:'월간'|'주간'|'일간'){
 await page.getByRole('group',{name:'달력 보기',exact:true}).getByRole('button',{name:view,exact:true}).click();
}
export function workspaceGroupButton(page:Page,name?:string){
 const groups=page.locator('.workspace-topbar .workspace-group-chips');
 return name?groups.getByRole('button',{name,exact:true}):groups.locator('button[aria-haspopup=dialog][aria-pressed=true],button.guest-sample-badge');
}
export function workspaceMembersDialog(page:Page){
 return page.getByRole('dialog',{name:/^(조회할 구성원|그룹 구성원)$/});
}
export async function openMemberPreferences(page:Page,name?:string){
 const dialog=workspaceMembersDialog(page);
 if(!await dialog.isVisible())await workspaceGroupButton(page,name).click();
 await expect(dialog).toBeVisible();
 if(name)await expect(dialog.locator('.workspace-members-group')).toHaveText(name);
 return dialog;
}
export async function closeMemberPreferences(page:Page){
 const dialog=workspaceMembersDialog(page);
 await dialog.getByRole('button',{name:/^(선택 )?완료$/}).click();
 await expect(dialog).toHaveCount(0);
}
export async function chooseWorkspaceGroup(page:Page,name:string){
 if(name==='개인')await workspaceGroupButton(page,name).click();
 else{await openMemberPreferences(page,name);await closeMemberPreferences(page);}
 await expect(workspaceGroupButton(page,name)).toHaveAttribute('aria-pressed','true');
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

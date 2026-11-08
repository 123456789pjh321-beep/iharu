import {test,expect} from '@playwright/test';
test.use({baseURL:'http://127.0.0.1:4174'});
test('public authentication-free test links and routes are unavailable outside the isolated demo',async({page})=>{
 await page.goto('/login');await expect(page.getByText('기능을 먼저 살펴보세요',{exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'인증 없이 기능 테스트'})).toHaveCount(0);
 for(const path of ['/test/today','/test/family','/test/location']){await page.goto(path);await expect(page).toHaveURL(/\/login$/);await expect(page.getByLabel('아이디',{exact:true})).toBeVisible();}
});

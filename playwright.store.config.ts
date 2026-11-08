import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/store',workers:1,retries:0,reporter:'line',timeout:120000,
 use:{...base.use,viewport:{width:360,height:640},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'ko-KR',timezoneId:'Asia/Seoul'},
});

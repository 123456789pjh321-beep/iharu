import { defineConfig } from '@playwright/test';
const legalOnly=process.env.IHARU_LEGAL_E2E==='true';
export default defineConfig({
  testDir:'tests/e2e', fullyParallel:true, retries:0,
  testMatch:legalOnly?'**/legal-content-save.spec.ts':undefined,
  testIgnore:legalOnly?[]:['**/legal-content-save.spec.ts'],
  use:{ baseURL:'http://127.0.0.1:4173', browserName:'chromium', headless:true,
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {
      executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
      args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],
    } : {},
  },
  webServer:legalOnly?[{command:'node --import tsx tests/helpers/auth-server.ts',url:'http://127.0.0.1:4175/api/health',reuseExistingServer:false,env:{IHARU_FIXTURE_PORT:'4175'}}]:[{ command:'npm run start', url:'http://127.0.0.1:4173/api/health', reuseExistingServer:!process.env.CI,
    env:{ APP_ENV:'local', DEMO_MODE:'true' } },
    { command:'node --import tsx tests/helpers/auth-server.ts',url:'http://127.0.0.1:4174/api/health',reuseExistingServer:false },
  ],
});


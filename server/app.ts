import {legalRoutes} from './legal/routes.js';
import {workspaceRoutes} from './workspace/routes.js';
import {adminRoutes} from './admin/routes.js';
import {childAccountRoutes} from './child-accounts/routes.js';
import {guardianRoutes} from './guardian/routes.js';
import { familyRoutes } from './family/routes.js';
import { getFamilyRuntime } from './family/runtime.js';
import type { FamilyService } from './family/service.js';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { dashboardQuerySchema, envelope, dashboardSchema, healthSchema } from '../shared/contracts.js';
import { getDemoDashboard } from './domain/demo.js';
import { readConfig, type AppConfig } from './env.js';
import { resolvePrincipal } from './auth/principal.js';
import { isAuthenticated } from './policy/access.js';
import { accountRoutes } from './auth/routes.js';
import { getAuthRuntime } from './auth/runtime.js';
import type { AuthService } from './auth/service.js';
import { scheduleRoutes } from './schedules/routes.js';
import { scheduleCron } from './schedules/cron.js';
import {readRealtimeConfig,type RealtimeConfig} from './messages/realtime.js';
import {messageRoutes} from './messages/routes.js';
import {messageCatalog} from '../shared/message-catalog.js';
import { dailyRoutes } from './daily/routes.js';

export function createApp(config: AppConfig = readConfig(), authRuntime: () => AuthService | null = getAuthRuntime, familyRuntime: () => Promise<FamilyService | null> = getFamilyRuntime, realtimeConfig:()=>RealtimeConfig|null=readRealtimeConfig) {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use('*', secureHeaders());
  app.use('*', async (c, next) => {
    const started=Date.now();
    c.set('requestId', crypto.randomUUID());
    c.header('Cache-Control', 'private, no-store');
    c.header('X-Request-Id', c.get('requestId'));
    await next();
    const path=c.req.path;
    const mutation=c.req.method==='POST'&&((path.startsWith('/api/auth/')&&!path.endsWith('/get-session'))||/^\/api\/v1\/(workspace|admin)\/(?:child\.|invite\.|family\.|items\.(?:create|update|delete)|chat\.send|member\.|role\.)/.test(path));
    if(path.startsWith('/api/')&&(mutation||c.res.status>=400)){
      // Store operation/status only. Password reset tokens, query strings, cookies and bodies never enter logs.
      const operation=path.startsWith('/api/auth/')?path.split('/').slice(0,4).join('/'):
        path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,'item').slice(0,100);
      if(/^\/api\/[a-zA-Z0-9_./-]+$/.test(operation))try{const svc=await familyRuntime();await svc?.command({requestId:c.get('requestId')},'system.log',{operation,method:c.req.method,status:c.res.status,durationMs:Date.now()-started});}catch{/* Logging failure must not change the user's operation. */}
    }
  });
  const meta = (requestId: string, source: 'system' | 'demo') => ({ requestId, source, serverNow: new Date().toISOString() });
  app.get('/api/health', c => c.json(envelope(healthSchema).parse({
    data:{ status:'ok', phase:'P07', environment:config.environment, demoEnabled:config.demoEnabled && config.environment !== 'production' },
    meta:meta(c.get('requestId'), 'system'),
  })));
  app.get('/api/demo/dashboard', c => {
    if (!config.demoEnabled || config.environment === 'production') {
      return c.json({ error:{ code:'DEMO_DISABLED', message:'화면 미리보기가 꺼져 있어요.' }, requestId:c.get('requestId') }, 404);
    }
    const parsed = dashboardQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error:{ code:'INVALID_QUERY', message:'조회할 아이와 월을 다시 확인해 주세요.' }, requestId:c.get('requestId') }, 400);
    return c.json(envelope(dashboardSchema).parse({ data:getDemoDashboard(parsed.data.child, parsed.data.month), meta:meta(c.get('requestId'), 'demo') }));
  });
  app.route('/', accountRoutes(authRuntime));
  app.route('/', legalRoutes(authRuntime,familyRuntime));
  app.route('/', adminRoutes(authRuntime,familyRuntime));
  app.route('/', guardianRoutes(authRuntime,familyRuntime));
  app.route('/', workspaceRoutes(authRuntime,familyRuntime));
  app.route('/', childAccountRoutes(authRuntime,familyRuntime));
  app.route('/', familyRoutes(authRuntime,familyRuntime));
  app.route('/', scheduleRoutes(authRuntime,familyRuntime));
  app.route('/', messageRoutes(authRuntime,familyRuntime,realtimeConfig));
  app.get('/api/v1/message-catalog',c=>{const version=Number(c.req.query('version')||2);if(![1,2].includes(version)||(c.req.query('locale')||'ko-KR')!=='ko-KR')return c.json({error:{code:'CATALOG_VERSION_UNSUPPORTED',message:'그림 목록을 다시 확인해 주세요.'}},409);c.header('Cache-Control','public, max-age=31536000, immutable');return c.json({data:messageCatalog(version)});});
  app.route('/', dailyRoutes(authRuntime,familyRuntime));
  app.route('/', scheduleCron());
  app.all('/api/v1/*', async c => {
    const principal = await resolvePrincipal(c.req.raw, authRuntime());
    if (!isAuthenticated(principal)) return c.json({ error:{ code:'AUTH_REQUIRED', message:'로그인이 필요해요.' }, requestId:c.get('requestId') }, 401);
    if (principal.assurance !== 'HIGH' || !principal.emailVerified || !principal.accessReady) return c.json({ error:{ code:'ACCESS_NOT_READY', message:'계정 확인과 가족 연결이 필요해요.' }, requestId:c.get('requestId') }, 403);
    return c.json({ error:{ code:'NOT_IMPLEMENTED', message:'이 기능을 준비하고 있어요.' }, requestId:c.get('requestId') }, 501);
  });
  app.notFound(c => c.json({ error:{ code:'NOT_FOUND', message:'요청한 경로를 찾을 수 없어요.' }, requestId:c.get('requestId') }, 404));
  app.onError((_error, c) => {
    console.error(JSON.stringify({ code:'INTERNAL_ERROR', requestId:c.get('requestId') }));
    return c.json({ error:{ code:'INTERNAL_ERROR', message:'잠시 후 다시 시도해 주세요.' }, requestId:c.get('requestId') }, 500);
  });
  return app;
}


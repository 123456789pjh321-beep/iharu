import {describe,it,expect} from 'vitest';
import {authRedirectAllowed} from '../shared/auth-redirect';
const origin='https://myiharu.com';
describe('first-party authentication return policy',()=>{
 it.each(['/timetable','/today/calendar','/tuition','/records','/family','/account','/more/notices/welcome'])('accepts the actual contextual social return %s',next=>{
  expect(authRedirectAllowed(next,origin,'/sign-in/social','callbackURL')).toBe(true);
  expect(authRedirectAllowed('/login?next='+encodeURIComponent(next),origin,'/sign-in/social','errorCallbackURL')).toBe(true);
  for(const path of ['/sign-up/email','/send-verification-email','/verify-email'])expect(authRedirectAllowed('/login?verified=1&next='+encodeURIComponent(next),origin,path,'callbackURL')).toBe(true);
 });
 it.each(['https://outside.example/timetable','//outside.example/timetable','/\\outside.example/timetable','javascript:alert(1)','/timetable#outside','/login?next=https%3A%2F%2Foutside.example','/login?next=%2F%2Foutside.example','/login?next=%2Funknown','/login?next=%2Faccount&next=%2Ftimetable','/login?next=%2Faccount&extra=1','/login?next=%2Faccount%0A','/login?next=%2Faccount%3Fnext%3Dhttps%3A%2F%2Foutside.example'])('rejects untrusted or ambiguous error returns %s',value=>{
  expect(authRedirectAllowed(value,origin,'/sign-in/social','errorCallbackURL')).toBe(false);
 });
 it('keeps linking and password reset scoped to their fixed screens',()=>{
  expect(authRedirectAllowed(origin+'/account',origin,'/link-social','callbackURL')).toBe(true);
  expect(authRedirectAllowed('/today/calendar',origin,'/link-social','callbackURL')).toBe(false);
  expect(authRedirectAllowed('/reset-password',origin,'/request-password-reset','redirectTo')).toBe(true);
  expect(authRedirectAllowed('/reset-password?next=/account',origin,'/request-password-reset','redirectTo')).toBe(false);
  expect(authRedirectAllowed('/login?verified=1&next=/account&verified=0',origin,'/verify-email','callbackURL')).toBe(false);
  expect(authRedirectAllowed('/login?verified=0&next=/account',origin,'/verify-email','callbackURL')).toBe(false);
  expect(authRedirectAllowed(origin+'/today/calendar',origin,'/sign-in/social','callbackURL')).toBe(true);
 });
});

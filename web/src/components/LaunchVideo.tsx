import {createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {BrandWordmark} from './BrandWordmark';
import {useExperience} from './Experience';
import './launch-video.css';

type Entry = 'login' | 'test';
type Theme = 'light' | 'dark';
const LaunchVideoContext = createContext<((entry: Entry) => void) | null>(null);
const LaunchVideoActiveContext = createContext(false);
const motionQuery = '(prefers-reduced-motion: reduce)';
const startupLimit = 900;
const playbackLimit = 3400;
const fadeDuration = 230;

export function LaunchVideoProvider({children}: {children: ReactNode}) {
  const {preferences} = useExperience();
  const seen = useRef(new Set<Entry>());
  const [theme, setTheme] = useState<Theme | null>(null);
  const close = useCallback(() => setTheme(null), []);
  const show = useCallback((entry: Entry) => {
    if (seen.current.has(entry)) return;
    seen.current.add(entry);
    const key = 'iharu:launch-video:' + entry;
    try {
      if (sessionStorage.getItem(key) === 'seen') return;
      sessionStorage.setItem(key, 'seen');
    } catch { /* The in-memory guard still covers this document. */ }
    if (preferences.quiet || matchMedia(motionQuery).matches || document.hidden) return;
    try {
      if (location.pathname === '/login' && localStorage.getItem('iharu-public-motion') === 'off') return;
    } catch { /* Public motion settings are optional. */ }
    setTheme(current => current ?? preferences.theme);
  }, [preferences.quiet, preferences.theme]);

  return <LaunchVideoContext.Provider value={show}>
    <LaunchVideoActiveContext.Provider value={theme !== null}>{children}</LaunchVideoActiveContext.Provider>
    {theme && createPortal(<LaunchVideo theme={theme} onFinished={close}/>, document.body)}
  </LaunchVideoContext.Provider>;
}

export function useLaunchVideo(entry: Entry | null) {
  const show = useLaunchVideoRequest();
  useLayoutEffect(() => { if (entry) show?.(entry); }, [entry, show]);
}

export function useLaunchVideoRequest() {
  return useContext(LaunchVideoContext);
}

export function useLaunchVideoActive() {
  return useContext(LaunchVideoActiveContext);
}

function LaunchVideo({theme, onFinished}: {theme: Theme; onFinished: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useLayoutEffect(() => {
    const modal = dialog.current!;
    const media = video.current!;
    const motion = matchMedia(motionQuery);
    let active = true;
    let started = false;
    let leaving = false;
    let timer = 0;

    function remove() {
      if (!active) return;
      active = false;
      modal.close();
      if (!document.hidden) {
        requestAnimationFrame(() => {
          if (!document.querySelector('dialog[open]')) {
            document.querySelector<HTMLElement>('main[tabindex="-1"]')?.focus({preventScroll: true});
          }
        });
      }
      onFinished();
    }
    function finish() {
      if (!active || leaving) return;
      clearTimeout(timer);
      if (!started || motion.matches || document.hidden) {
        remove();
        return;
      }
      leaving = true;
      modal.dataset.phase = 'leaving';
      timer = window.setTimeout(remove, fadeDuration);
    }
    function playing() {
      if (!active || started) return;
      started = true;
      clearTimeout(timer);
      modal.dataset.phase = 'playing';
      timer = window.setTimeout(finish, playbackLimit);
    }
    function motionChanged() { if (motion.matches) remove(); }
    function visibilityChanged() { if (document.hidden) remove(); }

    modal.dataset.phase = 'loading';
    modal.showModal();
    media.muted = true;
    media.addEventListener('playing', playing);
    media.addEventListener('ended', finish);
    media.addEventListener('error', finish);
    motion.addEventListener('change', motionChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('pagehide', remove);
    timer = window.setTimeout(finish, startupLimit);
    void media.play().catch(finish);

    return () => {
      active = false;
      clearTimeout(timer);
      media.removeEventListener('playing', playing);
      media.removeEventListener('ended', finish);
      media.removeEventListener('error', finish);
      motion.removeEventListener('change', motionChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('pagehide', remove);
      media.pause();
      modal.close();
    };
  }, [onFinished]);

  return <dialog ref={dialog} className="launch-video" data-theme={theme} aria-label="아이하루 소개"
    onCancel={event => { event.preventDefault(); onFinished(); }} onContextMenu={event => event.preventDefault()}>
    <div className="launch-video__stage" aria-hidden="true">
      <BrandWordmark className="launch-video__wordmark"/>
      <video ref={video} src={'/assets/iharu-intro-' + theme + '-v1.mp4'} muted playsInline
        disablePictureInPicture disableRemotePlayback tabIndex={-1}/>
    </div>
  </dialog>;
}

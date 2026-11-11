import {createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {BrandWordmark} from './BrandWordmark';
import {useExperience} from './Experience';
import './launch-video.css';

type Theme = 'light' | 'dark';
type FilmFormat = 'pc' | 'mobile' | 'tablet';
type Film = {theme: Theme; format: FilmFormat};
const LaunchVideoContext = createContext<(() => void) | null>(null);
const LaunchVideoActiveContext = createContext(false);
const motionQuery = '(prefers-reduced-motion: reduce)';
const sessionKey = 'iharu:launch-video:v2';
const startupLimit = 1500;
const playbackLimit = 4800;
const fadeDuration = 230;

function filmFormat(): FilmFormat {
  const {innerWidth, innerHeight} = window;
  const width = matchMedia('(pointer: coarse)').matches ? Math.min(innerWidth, innerHeight) : innerWidth;
  if (width < 600) return 'mobile';
  return width < 1100 ? 'tablet' : 'pc';
}

export function LaunchVideoProvider({children}: {children: ReactNode}) {
  const {preferences} = useExperience();
  const seen = useRef(false);
  const [film, setFilm] = useState<Film | null>(null);
  const close = useCallback(() => setFilm(null), []);
  const show = useCallback(() => {
    if (seen.current || document.hidden) return;
    seen.current = true;
    try {
      if (sessionStorage.getItem(sessionKey) === 'seen') return;
      sessionStorage.setItem(sessionKey, 'seen');
    } catch { /* The in-memory guard still covers this document. */ }
    if (preferences.quiet || matchMedia(motionQuery).matches) return;
    try {
      if (location.pathname === '/login' && localStorage.getItem('iharu-public-motion') === 'off') return;
    } catch { /* Public motion settings are optional. */ }
    setFilm({theme: preferences.theme, format: filmFormat()});
  }, [preferences.quiet, preferences.theme]);

  return <LaunchVideoContext.Provider value={show}>
    <LaunchVideoActiveContext.Provider value={film !== null}>{children}</LaunchVideoActiveContext.Provider>
    {film && createPortal(<LaunchVideo film={film} onFinished={close}/>, document.body)}
  </LaunchVideoContext.Provider>;
}

export function useLaunchVideo(enabled: boolean) {
  const show = useContext(LaunchVideoContext);
  useLayoutEffect(() => { if (enabled) show?.(); }, [enabled, show]);
}

export function useLaunchVideoActive() {
  return useContext(LaunchVideoActiveContext);
}

function LaunchVideo({film, onFinished}: {film: Film; onFinished: () => void}) {
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

  return <dialog ref={dialog} className="launch-video" data-theme={film.theme} data-format={film.format} aria-label="아이하루 소개"
    onCancel={event => { event.preventDefault(); onFinished(); }} onContextMenu={event => event.preventDefault()}>
    <div className="launch-video__stage" aria-hidden="true">
      <BrandWordmark className="launch-video__wordmark"/>
      <video ref={video} src={'/assets/iharu-intro-' + film.format + '-v2.mp4'} muted playsInline
        disablePictureInPicture disableRemotePlayback tabIndex={-1}/>
    </div>
  </dialog>;
}

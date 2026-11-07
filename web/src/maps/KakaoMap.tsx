import { useEffect, useRef, useState } from "react";
import "./map.css";
export const examplePoints = {
  home: { label: "예시 집", lat: 33.450701, lng: 126.570667 },
  school: { label: "예시 학교", lat: 33.452001, lng: 126.572667 },
  academy: { label: "예시 학원", lat: 33.448901, lng: 126.573967 },
};
type Point = keyof typeof examplePoints;
type Coordinate = object;
interface MapInstance {
  relayout: () => void;
  panTo: (p: Coordinate) => void;
  setCenter: (p: Coordinate) => void;
}
interface MarkerInstance {
  setMap: (map: MapInstance | null) => void;
}
interface Maps {
  load: (fn: () => void) => void;
  LatLng: new (lat: number, lng: number) => Coordinate;
  Map: new (
    el: HTMLElement,
    options: { center: Coordinate; level: number },
  ) => MapInstance;
  Marker: new (options: {
    position: Coordinate;
    map: MapInstance;
    title: string;
  }) => MarkerInstance;
}
declare global {
  interface Window {
    kakao?: { maps: Maps };
  }
}
let pending: Promise<Maps> | undefined;
export function loadKakaoMaps(key: string): Promise<Maps> {
  if (!/^[a-f0-9]{32}$/i.test(key))
    return Promise.reject(new Error("지도 연결 설정을 준비 중이에요."));
  if (pending) return pending;
  pending = new Promise<Maps>((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const timer = window.setTimeout(() => fail(), 15000);
    function fail() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.remove();
      pending = undefined;
      reject(
        new Error(
          "카카오 지도를 불러오지 못했어요. 네트워크와 카카오 앱의 지도 사용 설정·등록 도메인을 확인해 주세요.",
        ),
      );
    }
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      try {
        if (!window.kakao?.maps) {
          fail();
          return;
        }
        window.kakao.maps.load(() => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve(window.kakao!.maps);
        });
      } catch {
        fail();
      }
    };
    document.head.appendChild(script);
  });
  return pending;
}
/** Example coordinates only. No geolocation permission or child data is sent to Kakao. */
export function KakaoMap({ point = "home" }: { point?: Point }) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<MapInstance | null>(null),
    sdk = useRef<Maps | null>(null);
  const [status, setStatus] = useState("카카오 지도를 불러오고 있어요."),
    [ready, setReady] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let markers: MarkerInstance[] = [];
    setReady(false);
    setStatus("카카오 지도를 불러오고 있어요.");
    loadKakaoMaps(import.meta.env.VITE_KAKAO_MAP_JS_KEY || "")
      .then((maps) => {
        if (cancelled || !host.current) return;
        sdk.current = maps;
        const p = examplePoints.home;
        const instance = new maps.Map(host.current, {
          center: new maps.LatLng(p.lat, p.lng),
          level: 4,
        });
        map.current = instance;
        markers = Object.values(examplePoints).map(
          (p) =>
            new maps.Marker({
              position: new maps.LatLng(p.lat, p.lng),
              map: instance,
              title: p.label,
            }),
        );
        observer = new ResizeObserver(() => {
          instance.relayout();
        });
        observer.observe(host.current);
        setReady(true);
        setStatus("카카오 지도 · 제주 예시 지역");
      })
      .catch((error) => {
        if (!cancelled)
          setStatus(
            error instanceof Error
              ? error.message
              : "지도 연결을 확인해 주세요.",
          );
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      markers.forEach((marker) => marker.setMap(null));
      map.current = null;
      sdk.current = null;
      host.current?.replaceChildren();
    };
  }, [attempt]);
  useEffect(() => {
    if (ready && map.current && sdk.current) {
      const p = examplePoints[point];
      map.current.panTo(new sdk.current.LatLng(p.lat, p.lng));
    }
  }, [point, ready]);
  return (
    <section className="kakao-map-panel" aria-label="카카오 예시 지도">
      <div
        className="kakao-map-host"
        ref={host}
        aria-label="제주 예시 지역 지도"
      />
      {!ready && (
        <div className="kakao-map-fallback">
          <strong>카카오 지도</strong>
          <p role="status">{status}</p>
          <button className="button" onClick={() => setAttempt((n) => n + 1)}>
            다시 연결
          </button>
        </div>
      )}
      <div className="kakao-map-caption">
        <strong>{ready ? examplePoints[point].label : "지도 연결 확인"}</strong>
        <span>제주 예시 좌표 · 실제 아이 위치가 아니에요</span>
      </div>
    </section>
  );
}

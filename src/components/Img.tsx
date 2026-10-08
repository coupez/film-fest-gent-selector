import { useEffect, useMemo, useState, type ImgHTMLAttributes, type ReactNode } from "react";

// The festival's image CDN sometimes answers 403; its URLs wrap the original file, which we can fall back to.
const originOf = (url: string) => {
  const m = url.match(/amplifydigital\.be\/(https?%3A[^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

// URLs that already failed in this session, so later renders and preloads skip straight to one that works.
const failed = new Set<string>();

const candidates = (srcs: (string | null | undefined)[]) =>
  [...new Set(srcs.filter((s): s is string => !!s).flatMap((s) => [s, originOf(s)]).filter((s): s is string => !!s))];

/** Warm the cache with the first source that loads, walking the same fallback chain as <Img>. */
export function preload(srcs: (string | null | undefined)[]) {
  const list = candidates(srcs).filter((s) => !failed.has(s));
  const next = (i: number) => {
    if (i >= list.length) return;
    const img = new Image();
    img.onerror = () => {
      failed.add(list[i]);
      next(i + 1);
    };
    img.src = list[i];
  };
  next(0);
}

export function Img({
  srcs,
  fallback = null,
  ...props
}: { srcs: (string | null | undefined)[]; fallback?: ReactNode } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const key = srcs.join("|");
  const list = useMemo(
    () => candidates(srcs).filter((s) => !failed.has(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [key]);
  if (i >= list.length) return <>{fallback}</>;
  return (
    <img
      {...props}
      src={list[i]}
      onError={() => {
        failed.add(list[i]);
        setI((n) => n + 1);
      }}
      draggable={false}
    />
  );
}

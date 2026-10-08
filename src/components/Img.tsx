import { useEffect, useMemo, useState, type ImgHTMLAttributes } from "react";

// The festival's image CDN sometimes answers 403; its URLs wrap the original file, which we can fall back to.
const originOf = (url: string) => {
  const m = url.match(/amplifydigital\.be\/(https?%3A[^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

export function Img({ srcs, ...props }: { srcs: (string | null | undefined)[] } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const key = srcs.join("|");
  const list = useMemo(
    () => [...new Set(srcs.filter((s): s is string => !!s).flatMap((s) => [s, originOf(s)]).filter((s): s is string => !!s))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [key]);
  if (i >= list.length) return null;
  return <img {...props} src={list[i]} onError={() => setI((n) => n + 1)} draggable={false} />;
}

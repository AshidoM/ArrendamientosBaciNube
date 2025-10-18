// src/hooks/useAdaptiveRows.ts
import { useEffect, useRef, useState } from "react";

export function useAdaptiveRows({
  rowHeight = 44, paddingTop = 130, paddingBottom = 76, min = 5, max = 50,
} = {}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState<number>(10);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const compute = () => {
      const h = el.clientHeight;
      const available = Math.max(h - (paddingTop + paddingBottom), rowHeight * min);
      setRows(Math.max(min, Math.min(max, Math.floor(available / rowHeight))));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowHeight, paddingTop, paddingBottom, min, max]);

  return { containerRef: ref, rowsPerPage: rows };
}

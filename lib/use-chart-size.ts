"use client";

import { useEffect, useRef, useState } from "react";

/** Track an element's content-box size with a ResizeObserver. */
export function useChartSize<T extends HTMLElement = HTMLDivElement>(
  initial = { width: 640, height: 320 },
) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(initial);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setSize((prev) =>
        Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

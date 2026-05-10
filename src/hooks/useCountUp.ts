"use client";

import { useEffect, useState } from "react";

export function useCountUp(target: number, duration: number = 800) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const safeTarget = Number.isFinite(target) ? target : 0;
    const step = safeTarget / (duration / 16);
    const timer = window.setInterval(() => {
      start += step;
      if (start >= safeTarget) {
        setCount(safeTarget);
        window.clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);

    return () => window.clearInterval(timer);
  }, [target, duration]);

  return count;
}

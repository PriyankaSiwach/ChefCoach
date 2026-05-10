"use client";

import { useEffect, useState } from "react";

export function useTypewriter(text: string, speed: number = 30) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const timer = window.setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i += 1;
      if (i >= text.length) window.clearInterval(timer);
    }, speed);

    return () => window.clearInterval(timer);
  }, [text, speed]);

  return displayed;
}

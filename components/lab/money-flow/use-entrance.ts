"use client";

import { useReducedMotion, type Transition } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Entrance choreography shared by the money-flow charts. Until `settled`, bars use a staggered
 * delay; afterwards updates (slider drags) retarget the same spring with no delay.
 */
export function useEntrance(count: number, staggerSeconds = 0.07) {
  const reduce = useReducedMotion() ?? false;
  const [timerSettled, setSettled] = useState(false);
  const settled = reduce || timerSettled;
  useEffect(() => {
    if (reduce) return;
    const id = window.setTimeout(() => setSettled(true), (count * staggerSeconds + 0.9) * 1000);
    return () => window.clearTimeout(id);
  }, [reduce, count, staggerSeconds]);

  const barTransition = (index: number): Transition =>
    reduce
      ? { duration: 0 }
      : {
          type: "spring",
          stiffness: 240,
          damping: 30,
          mass: 0.9,
          delay: settled ? 0 : index * staggerSeconds,
        };

  const afterTransition: Transition = reduce
    ? { duration: 0 }
    : { duration: 0.45, ease: "easeOut", delay: settled ? 0 : count * staggerSeconds + 0.2 };

  return { reduce, settled, barTransition, afterTransition };
}

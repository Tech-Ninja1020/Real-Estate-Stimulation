"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * A short fade-and-rise on every navigation: a tasteful page transition. `initial` stays constant
 * so server and client agree; reduced motion only zeroes the duration.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

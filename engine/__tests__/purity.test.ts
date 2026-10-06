import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const engineDir = path.resolve(import.meta.dirname, "..");
const sources = readdirSync(engineDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ file: f, text: readFileSync(path.join(engineDir, f), "utf8") }));

describe("engine purity", () => {
  it("never reads the clock or an unseeded random source", () => {
    for (const s of sources) {
      const code = s.text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, `${s.file} must not call Math.random`).not.toMatch(/Math\.random\s*\(/);
      expect(code, `${s.file} must not call Date.now`).not.toMatch(/Date\.now\s*\(/);
      expect(code, `${s.file} must not use new Date()`).not.toMatch(/new Date\(\s*\)/);
    }
  });

  it("does not import React, Next or any UI library", () => {
    for (const s of sources) {
      expect(s.text, s.file).not.toMatch(/from\s+["'](react|react-dom|next|framer-motion)/);
    }
  });

  it("does not touch the DOM or storage", () => {
    for (const s of sources) {
      const code = s.text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, s.file).not.toMatch(
        /\b(window|document)\s*\.|\b(localStorage|sessionStorage)\b|typeof\s+window/,
      );
    }
  });
});

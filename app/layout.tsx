import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { PointerGlow } from "@/components/PointerGlow";
import { MathProvider } from "@/components/math/MathProvider";
import { ScenarioProvider } from "@/lib/scenario-store";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz"],
  display: "swap",
});
const ui = Geist({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "HoldSellSwap: Hold, Sell or 1031 Exchange", template: "%s | HoldSellSwap" },
  description:
    "A deterministic simulator that shows what happens to a rental property portfolio under Hold, Sell and 1031 Exchange strategies, with every number traceable to its math.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1220" },
  ],
};

// Applies a saved theme before first paint to avoid a flash.
// `?theme=dark|light` overrides it for the current load (handy for screenshots and demos).
const themeScript = `try{var q=new URLSearchParams(location.search).get('theme');var t=(q==='light'||q==='dark')?q:localStorage.getItem('hss-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${ui.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <PointerGlow />
        <ScenarioProvider>
          <MathProvider>
            <AppShell>{children}</AppShell>
          </MathProvider>
        </ScenarioProvider>
      </body>
    </html>
  );
}

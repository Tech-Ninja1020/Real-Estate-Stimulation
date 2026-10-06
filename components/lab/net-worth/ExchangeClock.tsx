"use client";

import { motion, useReducedMotion } from "framer-motion";
import { scaleLinear } from "d3-scale";
import type { ExchangeSummary } from "@/engine/types";
import { useChartSize } from "@/lib/use-chart-size";
import { daysBetween, fmtDate } from "./dates";

const PAD = 26;

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="m4.2 7.2 1.9 1.9 3.7-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <path
        d="M7 1.6 13 12H1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M7 5.6v3M7 10.2v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface Pin {
  key: string;
  day: number;
  title: string;
  date: string;
  ok: boolean;
  /** Plain-words status, shown next to the icon (never colour alone). */
  status: string;
}

function failureReason(idOk: boolean, closeOk: boolean): string {
  if (!idOk && !closeOk) return "the replacement was identified and closed outside their windows";
  if (!idOk) return "the replacement was identified after the 45-day deadline";
  if (!closeOk) return "the replacement closed after the 180-day deadline";
  return "the exchange did not complete";
}

export function ExchangeClock({ exchange }: { exchange: ExchangeSummary | null }) {
  const reduce = useReducedMotion();
  const [ref, size] = useChartSize<HTMLDivElement>({ width: 760, height: 160 });

  if (!exchange) {
    return (
      <div
        ref={ref}
        className="border-line-strong bg-surface-2/50 text-ink-2 flex items-start gap-3 rounded-xl border border-dashed px-4 py-4 text-sm"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          aria-hidden="true"
          className="text-ink-3 mt-0.5 shrink-0"
        >
          <circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M9 4.8V9l2.8 1.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <p className="leading-relaxed">
          No exchange is being modeled. Choose at least one property to sell and the 45-day and
          180-day clock for the replacement purchase will appear here.
        </p>
      </div>
    );
  }

  const tl = exchange.timeline;
  const day0 = tl.relinquishedClosing;
  const idDeadline = daysBetween(day0, tl.identificationDeadline);
  const exDeadline = daysBetween(day0, tl.exchangeDeadline);
  const idDay = daysBetween(day0, tl.identificationDate);
  const closeDay = daysBetween(day0, tl.replacementClosing);
  const idOk = tl.identificationWithinWindow;
  const closeOk = tl.closingWithinWindow;

  const maxDay = Math.max(exDeadline, closeDay, idDay);
  const domainEnd =
    maxDay > exDeadline ? maxDay + Math.max(10, Math.round(exDeadline * 0.06)) : exDeadline;
  const width = Math.max(320, size.width);
  const x = scaleLinear()
    .domain([0, domainEnd])
    .range([PAD, width - PAD]);

  const pins: Pin[] = [
    {
      key: "id",
      day: idDay,
      title: "Replacement identified",
      date: fmtDate(tl.identificationDate),
      ok: idOk,
      status: idOk ? "On time" : `Late: past day ${idDeadline}`,
    },
    {
      key: "close",
      day: closeDay,
      title: "Replacement closes",
      date: fmtDate(tl.replacementClosing),
      ok: closeOk,
      status: closeOk ? "On time" : `Late: past day ${exDeadline}`,
    },
  ].sort((a, b) => a.day - b.day);

  const LABEL_W = 176;
  const stacked =
    pins.length === 2 && Math.abs(x(pins[0]?.day ?? 0) - x(pins[1]?.day ?? 0)) < LABEL_W + 20;
  const headY = (i: number) => 20 + (stacked && i === 1 ? 38 : 0);
  const barY = (stacked ? 20 + 38 : 20) + 30;
  const barH = 30;
  const tickY = barY + barH;
  const height = tickY + 70;

  const ticks = [
    { day: 0, name: "Sale closes", date: fmtDate(day0), anchor: "start" as const },
    {
      day: idDeadline,
      name: "Identification deadline",
      date: fmtDate(tl.identificationDeadline),
      anchor: "middle" as const,
    },
    {
      day: exDeadline,
      name: "Exchange deadline",
      date: fmtDate(tl.exchangeDeadline),
      anchor: (domainEnd > exDeadline ? "middle" : "end") as "middle" | "end",
    },
  ];

  const bandId = x(idDeadline) - x(0);
  const bandEx = x(exDeadline) - x(idDeadline);
  const latePast = domainEnd > exDeadline;

  return (
    <div ref={ref}>
      <div className="w-full">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`1031 exchange clock. Sale closes ${fmtDate(day0)}. Identification deadline ${fmtDate(tl.identificationDeadline)}, day ${idDeadline}. Exchange deadline ${fmtDate(tl.exchangeDeadline)}, day ${exDeadline}. Replacement identified ${fmtDate(tl.identificationDate)} on day ${idDay}, ${idOk ? "within" : "outside"} the window. Replacement closes ${fmtDate(tl.replacementClosing)} on day ${closeDay}, ${closeOk ? "within" : "outside"} the window.`}
          className="block"
        >
          <defs>
            <clipPath id="exch-clock-track">
              <rect x={x(0)} y={barY} width={x(domainEnd) - x(0)} height={barH} rx={9} />
            </clipPath>
            <pattern
              id="exch-clock-late"
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="7" height="7" fill="var(--danger-soft)" />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="7"
                stroke="var(--danger)"
                strokeOpacity="0.35"
                strokeWidth="1.5"
              />
            </pattern>
          </defs>

          <g clipPath="url(#exch-clock-track)">
            <rect
              x={x(0)}
              y={barY}
              width={bandId}
              height={barH}
              fill="var(--c-exchange)"
              fillOpacity={0.3}
            />
            <rect
              x={x(idDeadline)}
              y={barY}
              width={bandEx}
              height={barH}
              fill="var(--c-exchange)"
              fillOpacity={0.12}
            />
            {latePast && (
              <rect
                x={x(exDeadline)}
                y={barY}
                width={x(domainEnd) - x(exDeadline)}
                height={barH}
                fill="url(#exch-clock-late)"
              />
            )}
            <line
              x1={x(idDeadline)}
              x2={x(idDeadline)}
              y1={barY}
              y2={barY + barH}
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </g>
          <rect
            x={x(0)}
            y={barY}
            width={x(domainEnd) - x(0)}
            height={barH}
            rx={9}
            fill="none"
            stroke="var(--line-strong)"
          />

          <text
            x={x(0) + 12}
            y={barY + barH / 2}
            dy="0.34em"
            textAnchor="start"
            className="chart-text"
            style={{ fill: "var(--ink-2)", fontWeight: 600 }}
          >
            {bandId > 120 ? `Identify · ${idDeadline} days` : "Identify"}
          </text>
          <text
            x={x(idDeadline) + 12}
            y={barY + barH / 2}
            dy="0.34em"
            textAnchor="start"
            className="chart-text"
            style={{ fill: "var(--ink-2)", fontWeight: 600 }}
          >
            {bandEx > 220
              ? `Close on the replacement · day ${idDeadline} to ${exDeadline}`
              : "Close"}
          </text>

          {/* day ticks */}
          {ticks.map((t) => (
            <g key={t.day}>
              <line x1={x(t.day)} x2={x(t.day)} y1={tickY} y2={tickY + 8} stroke="var(--ink-3)" />
              <text
                x={x(t.day)}
                y={tickY + 22}
                textAnchor={t.anchor}
                className="chart-text"
                style={{ fill: "var(--ink)", fontWeight: 600, fontSize: 12 }}
              >
                Day {t.day}
              </text>
              <text x={x(t.day)} y={tickY + 37} textAnchor={t.anchor} className="chart-text">
                {t.name}
              </text>
              <text x={x(t.day)} y={tickY + 51} textAnchor={t.anchor} className="chart-text num">
                {t.date}
              </text>
            </g>
          ))}

          {/* the investor's own dates */}
          {pins.map((p, i) => {
            const px = x(p.day);
            const color = p.ok ? "var(--accent)" : "var(--danger)";
            const hy = headY(i);
            const flip = px + 16 + LABEL_W > width;
            const lx = flip ? px - 16 : px + 16;
            const anchor = flip ? "end" : "start";
            return (
              <motion.g
                key={p.key}
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: reduce ? 0 : 0.2 + i * 0.12,
                  duration: 0.45,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <line x1={px} x2={px} y1={hy + 9} y2={barY - 1} stroke={color} strokeWidth={1.5} />
                <path
                  d={`M${px - 5} ${barY - 7} L${px} ${barY} L${px + 5} ${barY - 7}Z`}
                  fill={color}
                />
                <g transform={`translate(${px},${hy})`}>
                  <circle r={9} fill={color} />
                  {p.ok ? (
                    <path
                      d="m-3.6 .2 2.4 2.5 4.6-5"
                      fill="none"
                      stroke="var(--surface)"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <path
                      d="m-3.2 -3.2 6.4 6.4m0 -6.4 -6.4 6.4"
                      fill="none"
                      stroke="var(--surface)"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    />
                  )}
                </g>
                <text
                  x={lx}
                  y={hy - 3}
                  textAnchor={anchor}
                  className="chart-text"
                  style={{ fill: "var(--ink)", fontWeight: 600, fontSize: 12 }}
                >
                  {p.title}
                </text>
                <text x={lx} y={hy + 12} textAnchor={anchor} className="chart-text num">
                  {p.date} · Day {p.day} ·{" "}
                  <tspan
                    style={{ fill: p.ok ? "var(--accent)" : "var(--danger)", fontWeight: 600 }}
                  >
                    {p.status}
                  </tspan>
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>

      {exchange.completed ? (
        <div
          role="status"
          className="bg-accent-soft text-ink mt-3 flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm leading-relaxed"
        >
          <span className="text-accent mt-0.5">
            <CheckIcon />
          </span>
          <p>
            <span className="font-semibold">Both deadlines are met.</span> The gain is deferred into{" "}
            {exchange.replacementName}, and tax is postponed rather than paid at the sale.
          </p>
        </div>
      ) : (
        <div
          role="alert"
          className="bg-amber-soft text-ink mt-3 flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm leading-relaxed"
        >
          <span className="text-amber mt-0.5">
            <AlertIcon />
          </span>
          <p>
            <span className="text-amber font-semibold">The exchange fails:</span>{" "}
            {failureReason(idOk, closeOk)}. The sale is treated as an ordinary sale, so the whole
            gain is fully taxable this year.
          </p>
        </div>
      )}
    </div>
  );
}

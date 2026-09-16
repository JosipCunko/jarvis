"use client";

import { useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/app/_lib/cn";

const CX = 200;
const CY = 200;

function polar(radius: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: CX + Math.cos(rad) * radius, y: CY + Math.sin(rad) * radius };
}

function TickMarks({
  count,
  inner,
  outer,
  majorEvery = 0,
  majorOuter,
  color = "#00d4ff",
  width = 1,
}: {
  count: number;
  inner: number;
  outer: number;
  majorEvery?: number;
  majorOuter?: number;
  color?: string;
  width?: number;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => {
        const major = majorEvery > 0 && index % majorEvery === 0;
        const a = polar(inner, (index / count) * 360);
        const b = polar(major ? (majorOuter ?? outer + 6) : outer, (index / count) * 360);
        return (
          <line
            key={index}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={color}
            strokeWidth={major ? width + 0.5 : width}
            strokeOpacity={major ? 0.9 : 0.32}
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
}

function Arc({
  r,
  width,
  color,
  span,
  offset = 0,
  opacity = 1,
  cap = "round",
  glow,
}: {
  r: number;
  width: number;
  color: string;
  span: number;
  offset?: number;
  opacity?: number;
  cap?: "round" | "butt";
  glow?: string;
}) {
  const circ = 2 * Math.PI * r;
  return (
    <circle
      cx={CX}
      cy={CY}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeOpacity={opacity}
      strokeLinecap={cap}
      strokeDasharray={`${circ * span} ${circ}`}
      strokeDashoffset={circ * offset}
      filter={glow}
    />
  );
}

function SpinGroup({
  duration,
  reverse = false,
  paused,
  children,
}: {
  duration: number;
  reverse?: boolean;
  paused: boolean;
  children: ReactNode;
}) {
  return (
    <motion.g
      style={{ transformBox: "view-box", transformOrigin: "center" }}
      animate={paused ? { rotate: 0 } : { rotate: reverse ? -360 : 360 }}
      transition={
        paused ? { duration: 0 } : { duration, ease: "linear", repeat: Infinity }
      }
    >
      {children}
    </motion.g>
  );
}

export default function JarvisCore({
  dimmed = false,
  scanning = false,
  className,
}: {
  dimmed?: boolean;
  scanning?: boolean;
  className?: string;
}) {
  const rawId = useId().replace(/:/g, "");
  const glow = `glow-${rawId}`;
  const goldGlow = `gold-${rawId}`;
  const coreFill = `core-${rawId}`;
  const reduceMotion = useReducedMotion();
  const paused = reduceMotion === true;
  const speed = scanning ? 0.42 : 1;
  const head = polar(156, 18);
  const gold = polar(156, 188);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-700",
        dimmed ? "opacity-[0.16]" : "opacity-100",
        className,
      )}
    >
      <motion.div
        className="relative aspect-square h-[92%] max-h-110 w-[92%] max-w-110"
        animate={
          paused || dimmed
            ? { scale: 1 }
            : { scale: scanning ? [1, 1.03, 1] : [1, 1.012, 1] }
        }
        transition={{
          duration: scanning ? 1.6 : 6.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <svg viewBox="0 0 400 400" className="h-full w-full overflow-visible">
          <defs>
            <radialGradient id={coreFill} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7ef0ff" stopOpacity={scanning ? "0.22" : "0.12"} />
              <stop offset="38%" stopColor="#00d4ff" stopOpacity="0.06" />
              <stop offset="70%" stopColor="#00d4ff" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
            </radialGradient>
            <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={goldGlow} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle cx={CX} cy={CY} r="168" fill={`url(#${coreFill})`} />
          <circle cx={CX} cy={CY} r="72" fill="#020b16" fillOpacity="0.78" />
          <circle cx={CX} cy={CY} r="96" fill="none" stroke="#00d4ff" strokeOpacity="0.08" />
          <circle cx={CX} cy={CY} r="64" fill="none" stroke="#5ce1ff" strokeOpacity="0.14" />
          <line x1="200" y1="108" x2="200" y2="128" stroke="#00d4ff" strokeOpacity="0.2" />
          <line x1="200" y1="272" x2="200" y2="292" stroke="#00d4ff" strokeOpacity="0.2" />
          <line x1="108" y1="200" x2="128" y2="200" stroke="#00d4ff" strokeOpacity="0.2" />
          <line x1="272" y1="200" x2="292" y2="200" stroke="#00d4ff" strokeOpacity="0.2" />

          <SpinGroup duration={58 * speed} paused={paused}>
            <TickMarks count={96} inner={176} outer={186} majorEvery={8} majorOuter={192} width={1.1} />
            <circle cx={CX} cy={CY} r="174" fill="none" stroke="#00d4ff" strokeOpacity="0.18" strokeWidth="1" />
          </SpinGroup>

          <SpinGroup duration={34 * speed} reverse paused={paused}>
            <Arc r={156} width={22} color="#5ce1ff" span={0.46} offset={0.02} opacity={0.26} cap="butt" />
            <Arc r={156} width={3.4} color="#7ef0ff" span={0.46} offset={0.02} opacity={0.95} glow={`url(#${glow})`} />
            <Arc r={144} width={12} color="#00d4ff" span={0.32} offset={0.56} opacity={0.28} cap="butt" />
            <Arc r={144} width={2.4} color="#5ce1ff" span={0.32} offset={0.56} opacity={0.85} />
            <Arc r={156} width={5.5} color="#f5c542" span={0.07} offset={0.5} opacity={1} glow={`url(#${goldGlow})`} />
            <circle cx={head.x} cy={head.y} r="3.2" fill="#e8f7ff" filter={`url(#${glow})`} />
            <circle cx={gold.x} cy={gold.y} r="2.4" fill="#f5c542" filter={`url(#${goldGlow})`} />
          </SpinGroup>

          <SpinGroup duration={22 * speed} paused={paused}>
            <Arc r={128} width={14} color="#5ce1ff" span={0.55} offset={0.12} opacity={0.14} cap="butt" />
            <Arc r={128} width={2.4} color="#7ef0ff" span={0.55} offset={0.12} opacity={0.75} />
            <Arc r={118} width={1.4} color="#00d4ff" span={0.18} offset={0.72} opacity={0.7} />
            <TickMarks count={48} inner={132} outer={140} majorEvery={6} majorOuter={144} width={0.9} />
          </SpinGroup>

          <SpinGroup duration={16 * speed} reverse paused={paused}>
            <TickMarks count={36} inner={78} outer={86} majorEvery={9} majorOuter={90} color="#5ce1ff" width={0.9} />
            <circle cx={CX} cy={CY} r="76" fill="none" stroke="#5ce1ff" strokeOpacity="0.35" strokeWidth="1.2" />
            <circle cx={CX} cy={CY} r="70" fill="none" stroke="#00d4ff" strokeOpacity="0.15" strokeDasharray="2 6" />
          </SpinGroup>

          <motion.circle
            cx={CX}
            cy={CY}
            r="164"
            fill="none"
            stroke="#00d4ff"
            strokeWidth="1"
            strokeOpacity="0.35"
            strokeDasharray="3 11"
            animate={paused ? undefined : { strokeDashoffset: [0, -280] }}
            transition={{ duration: 10 * speed, ease: "linear", repeat: Infinity }}
          />

          <SpinGroup duration={9 * speed} paused={paused}>
            <Arc r={168} width={1.8} color="#e8f7ff" span={0.08} offset={0} opacity={0.9} glow={`url(#${glow})`} />
            <line
              x1={CX}
              y1={CY - 172}
              x2={CX}
              y2={CY - 148}
              stroke="#e8f7ff"
              strokeWidth="1.6"
              strokeOpacity="0.75"
              filter={`url(#${glow})`}
            />
          </SpinGroup>
        </svg>

        <motion.div
          className="absolute inset-[9%] rounded-full"
          style={{
            background:
              "conic-gradient(from 200deg, transparent 0deg, rgba(0,212,255,0.16) 40deg, transparent 75deg, transparent 200deg, rgba(245,197,66,0.12) 228deg, transparent 255deg)",
            maskImage:
              "radial-gradient(circle, transparent 54%, #000 56%, #000 78%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(circle, transparent 54%, #000 56%, #000 78%, transparent 80%)",
          }}
          animate={paused ? { rotate: 0 } : { rotate: 360 }}
          transition={{ duration: 28 * speed, ease: "linear", repeat: Infinity }}
        />

        {!dimmed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.p
              className="font-display text-[1.55rem] tracking-[0.18em] text-ink sm:text-[1.85rem]"
              style={{ textShadow: "0 0 22px rgba(0, 212, 255, 0.6)" }}
              animate={
                paused
                  ? undefined
                  : { opacity: scanning ? [0.65, 1, 0.65] : [0.84, 1, 0.84] }
              }
              transition={{
                duration: scanning ? 0.9 : 3.4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              J.A.R.V.I.S.
            </motion.p>
            <p className="mt-2 font-mono text-[10px] tracking-[0.42em] text-muted">
              AI CORE
            </p>
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}

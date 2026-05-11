import { useRef, useCallback, useEffect, useState } from "react";

interface DialProps {
  /** Current angle in degrees (0 = left, 180 = right) */
  value: number;
  /** Called when user drags the dial */
  onChange: (angle: number) => void;
  /** Other players' angles to display as ghost needles */
  otherAngles?: Record<string, number>;
  /** Whether the dial is interactive */
  disabled?: boolean;
  /** Target zone to reveal (0–100 maps to 0–180°) */
  targetValue?: number | null;
  /** Whether to show the target zone */
  showTarget?: boolean;
  /** Whether to render the main needle (hide for Psychic) */
  showNeedle?: boolean;
  guessValue?: number | null; // kept for API compatibility
}

// Spectrum colors for the arc
const SPECTRUM_COLORS = [
  "#a855f7", "#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4",
  "#14b8a6", "#22c55e", "#84cc16", "#eab308", "#f59e0b",
  "#f97316", "#ef4444", "#ec4899", "#d946ef", "#a855f7",
];

function angleFromCenter(
  svgRef: React.RefObject<SVGSVGElement | null>,
  clientX: number,
  clientY: number
): number {
  const svg = svgRef.current;
  if (!svg) return 90;

  const rect = svg.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height; // pivot at bottom center

  const dx = clientX - cx;
  const dy = cy - clientY;

  let angle = Math.atan2(dx, dy) * (180 / Math.PI);

  // Clamp to 0–180 (left to right of semicircle)
  angle = Math.max(0, Math.min(180, angle + 90));
  return angle;
}

/** Convert a 0–180° dial angle to an SVG point on the arc */
function angleToPoint(cx: number, cy: number, radius: number, dialAngle: number) {
  const rad = ((180 - dialAngle) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
}

export default function Dial({
  value,
  onChange,
  otherAngles = {},
  disabled = false,
  targetValue = null,
  showTarget = false,
  showNeedle = true,
  guessValue = null,
}: DialProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);
  const [isSmooth, setIsSmooth] = useState(true);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      isDragging.current = true;
      setIsSmooth(false);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const angle = angleFromCenter(svgRef, e.clientX, e.clientY);
      onChange(angle);
    },
    [disabled, onChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current || disabled) return;
      const angle = angleFromCenter(svgRef, e.clientX, e.clientY);
      onChange(angle);
    },
    [disabled, onChange]
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    setIsSmooth(true);
  }, []);

  // Prevent scrolling while dragging on touch devices
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const preventScroll = (e: TouchEvent) => {
      if (isDragging.current) {
        e.preventDefault();
      }
    };

    svg.addEventListener("touchmove", preventScroll, { passive: false });
    return () => svg.removeEventListener("touchmove", preventScroll);
  }, []);

  const cx = 170;
  const cy = 160;
  const r = 140;

  // Build spectrum arc segments
  const arcSegments = SPECTRUM_COLORS.map((color, i) => {
    const startAngle = (i / SPECTRUM_COLORS.length) * 180;
    const endAngle = ((i + 1) / SPECTRUM_COLORS.length) * 180;
    const startRad = ((180 - startAngle) * Math.PI) / 180;
    const endRad = ((180 - endAngle) * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy - r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy - r * Math.sin(endRad);

    return (
      <path
        key={i}
        d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
        stroke={color}
        strokeWidth="18"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
    );
  });

  // ── Scoring zones around target ──────────────────────────────────────
  // Zones (from spec): ±2 = 4pts, ±6 = 3pts, ±10 = 2pts
  // We draw 5 distinct wedges: 2, 3, 4, 3, 2
  const scoringZones = (() => {
    if (targetValue === null || !showTarget) return null;

    const targetAngle = (targetValue / 100) * 180;
    
    // 10% in score space = (10/100)*180 = 18° in dial space
    const wedges = [
      { startOffset: -18,   endOffset: -10.8, color: "#facc15", pts: 2 }, // left yellow
      { startOffset: -10.8, endOffset: -3.6,  color: "#f97316", pts: 3 }, // left orange
      { startOffset: -3.6,  endOffset:  3.6,  color: "#94a3b8", pts: 4 }, // center grey
      { startOffset:  3.6,  endOffset:  10.8, color: "#f97316", pts: 3 }, // right orange
      { startOffset:  10.8, endOffset:  18,   color: "#facc15", pts: 2 }, // right yellow
    ];

    return wedges.map(({ startOffset, endOffset, color, pts }, idx) => {
      // Clamp to 0-180
      const zoneStart = Math.max(0, Math.min(180, targetAngle + startOffset));
      const zoneEnd = Math.max(0, Math.min(180, targetAngle + endOffset));
      
      // If the wedge is completely outside the 0-180 range, skip drawing it
      if (zoneStart === zoneEnd) return null;

      const startRad = ((180 - zoneStart) * Math.PI) / 180;
      const endRad = ((180 - zoneEnd) * Math.PI) / 180;

      const innerR = r - 26;
      const outerR = r + 26;

      const x1o = cx + outerR * Math.cos(startRad);
      const y1o = cy - outerR * Math.sin(startRad);
      const x2o = cx + outerR * Math.cos(endRad);
      const y2o = cy - outerR * Math.sin(endRad);
      const x1i = cx + innerR * Math.cos(endRad);
      const y1i = cy - innerR * Math.sin(endRad);
      const x2i = cx + innerR * Math.cos(startRad);
      const y2i = cy - innerR * Math.sin(startRad);

      // Label position: middle of this specific wedge
      const midAngle = (zoneStart + zoneEnd) / 2;
      const midRad = ((180 - midAngle) * Math.PI) / 180;
      const labelR = outerR - 12; // slightly inside the outer edge
      
      const lx = cx + labelR * Math.cos(midRad);
      const ly = cy - labelR * Math.sin(midRad);

      return (
        <g key={`${pts}-${idx}`}>
          <path
            d={`M ${x1o} ${y1o} A ${outerR} ${outerR} 0 0 1 ${x2o} ${y2o}
                L ${x1i} ${y1i} A ${innerR} ${innerR} 0 0 0 ${x2i} ${y2i} Z`}
            fill={color}
            opacity="0.9"
          />
          {/* Only draw text if wedge is wide enough (not completely cut off by edge) */}
          {Math.abs(zoneEnd - zoneStart) > 1 && (
            <text
              x={lx}
              y={ly + 5}
              textAnchor="middle"
              fontSize="14"
              fontWeight="bold"
              fill="#111"
              opacity="0.8"
            >
              {pts}
            </text>
          )}
        </g>
      );
    });
  })();

  // Needle angle
  const needleAngle = value - 90;
  const needleLength = r - 15;

  // Ghost needles for other players (shown as they move their dial)
  const ghostNeedles = Object.entries(otherAngles).map(([playerId, angle]) => {
    const ghostAngle = angle - 90;
    return (
      <line
        key={playerId}
        x1={cx}
        y1={cy}
        x2={cx}
        y2={cy - needleLength + 20}
        stroke="rgba(6, 182, 212, 0.55)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="5 4"
        className="dial-needle smooth"
        style={{ transform: `rotate(${ghostAngle}deg)`, transformOrigin: `${cx}px ${cy}px` }}
      />
    );
  });

  // Guess marker removed – guesser's own needle shows the answer

  return (
    <div className="dial-container">
      <svg
        ref={svgRef}
        viewBox="0 0 340 190"
        className="dial-svg"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Background arc glow */}
        <defs>
          <radialGradient id="dialGlow" cx="50%" cy="100%" r="60%">
            <stop offset="0%" stopColor="rgba(168, 85, 247, 0.08)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <linearGradient id="needleGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <rect width="340" height="190" fill="url(#dialGlow)" rx="8" />

        {/* Spectrum arc */}
        <g className="spectrum-arc">{arcSegments}</g>

        {/* Scoring zones (drawn over arc when revealed) */}
        {scoringZones}

        {/* Tick marks */}
        {Array.from({ length: 19 }).map((_, i) => {
          const tickAngle = (i / 18) * 180;
          const tickRad = ((180 - tickAngle) * Math.PI) / 180;
          const isMajor = i % 3 === 0;
          const innerR2 = r + (isMajor ? 22 : 20);
          const outerR2 = r + (isMajor ? 30 : 26);
          return (
            <line
              key={i}
              x1={cx + innerR2 * Math.cos(tickRad)}
              y1={cy - innerR2 * Math.sin(tickRad)}
              x2={cx + outerR2 * Math.cos(tickRad)}
              y2={cy - outerR2 * Math.sin(tickRad)}
              stroke={isMajor ? "rgba(168, 85, 247, 0.4)" : "rgba(168, 85, 247, 0.2)"}
              strokeWidth={isMajor ? 2 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Ghost needles (other players' positions) */}
        {ghostNeedles}

        {/* Main needle — only for Guesser, not Psychic */}
        {showNeedle && (
          <g
            className={`dial-needle ${isSmooth ? "smooth" : ""}`}
            style={{
              transform: `rotate(${needleAngle}deg)`,
              transformOrigin: `${cx}px ${cy}px`,
            }}
          >
            <line
              x1={cx}
              y1={cy}
              x2={cx}
              y2={cy - needleLength}
              stroke="#ec4899"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Needle tip glow */}
            <circle
              cx={cx}
              cy={cy - needleLength}
              r="4"
              fill="#ec4899"
              filter="drop-shadow(0 0 6px rgba(236, 72, 153, 0.8))"
            />
          </g>
        )}

        {/* Center pivot */}
        <circle cx={cx} cy={cy} r="8" fill="#1a1230" stroke="#a855f7" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="3" fill="#a855f7" />
      </svg>
    </div>
  );
}

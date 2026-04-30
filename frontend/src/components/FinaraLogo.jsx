/**
 * Finara logomark — ascending bar chart with trend line and AI sparkle.
 * Self-contained SVG: background is baked in, scales to any size.
 */
export default function FinaraLogo({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Finara"
    >
      <defs>
        {/* Dark navy background gradient — diagonal */}
        <linearGradient id="fl-bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#071c40" />
          <stop offset="100%" stopColor="#0d3270" />
        </linearGradient>

        {/* Bar fill — each bar goes from bright top to deep bottom */}
        <linearGradient id="fl-bar" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%"   stopColor="#5a9fff" />
          <stop offset="100%" stopColor="#1a4db8" />
        </linearGradient>

        {/* Soft radial bloom behind the sparkle */}
        <radialGradient id="fl-bloom" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#4d8eff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#4d8eff" stopOpacity="0"   />
        </radialGradient>

        {/* Subtle inner vignette light at top-right — gives depth */}
        <radialGradient id="fl-inner" cx="80%" cy="20%" r="60%">
          <stop offset="0%"   stopColor="#1a50b0" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#1a50b0" stopOpacity="0"   />
        </radialGradient>
      </defs>

      {/* ── Background ── */}
      <rect width="32" height="32" rx="9" fill="url(#fl-bg)" />
      <rect width="32" height="32" rx="9" fill="url(#fl-inner)" />

      {/* ── Baseline ── */}
      <line x1="4" y1="27" x2="28" y2="27" stroke="#1d4a9a" strokeWidth="0.6" />

      {/* ── Ascending bars (bottom baseline = y 27) ── */}
      {/* Bar 1 — short */}
      <rect x="5"  y="20" width="5" height="7"  rx="1.5" fill="url(#fl-bar)" opacity="0.75" />
      {/* Bar 2 — medium */}
      <rect x="13" y="13" width="5" height="14" rx="1.5" fill="url(#fl-bar)" opacity="0.88" />
      {/* Bar 3 — tall (the "story peak") */}
      <rect x="21" y="8"  width="5" height="19" rx="1.5" fill="url(#fl-bar)" />

      {/* ── Trend line connecting bar tops ── */}
      <path
        d="M7.5 18 Q11.5 13.5 15.5 11 Q19.5 8.5 23.5 6"
        stroke="#90c0ff"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* ── AI sparkle at the peak ── */}
      {/* Soft bloom */}
      <circle cx="23.5" cy="6" r="4" fill="url(#fl-bloom)" />
      {/* Core dot */}
      <circle cx="23.5" cy="6" r="1.8" fill="white" />
      {/* Cardinal rays */}
      <line x1="23.5" y1="3.2" x2="23.5" y2="2.2" stroke="white" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
      <line x1="23.5" y1="8.8" x2="23.5" y2="9.8" stroke="white" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
      <line x1="20.7" y1="6"   x2="19.7" y2="6"   stroke="white" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
      <line x1="26.3" y1="6"   x2="27.3" y2="6"   stroke="white" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
      {/* Diagonal rays (softer) */}
      <line x1="21.5" y1="4"   x2="20.8" y2="3.3" stroke="white" strokeWidth="0.7" strokeLinecap="round" opacity="0.4" />
      <line x1="25.5" y1="4"   x2="26.2" y2="3.3" stroke="white" strokeWidth="0.7" strokeLinecap="round" opacity="0.4" />
    </svg>
  )
}

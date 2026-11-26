import { useState } from 'react';

/**
 * Custom 404 Error Page matching the user's reference illustration
 * and DevDiagram's sketchbook & warm solarized design system.
 */
export default function NotFoundPage({ onHome, onNavigate, attemptedPath }) {
  const [quickInput, setQuickInput] = useState('');
  const [robotClicked, setRobotClicked] = useState(false);
  const [robotReaction, setRobotReaction] = useState('');

  const quickRepos = [
    'facebook/react',
    'vitejs/vite',
    'expressjs/express',
    'tiangolo/fastapi',
  ];

  function handleQuickSubmit(e) {
    e.preventDefault();
    if (!quickInput.trim() || !onNavigate) return;
    const clean = quickInput.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
    const parts = clean.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      onNavigate(parts[0], parts[1]);
    } else {
      onHome();
    }
  }

  function handleRobotPoke() {
    setRobotClicked(true);
    const soundbites = [
      '⚡ *Zzzzt* Wrench slipped! 404 bytes missing.',
      '🤖 Beep boop! That node was never plotted on our map.',
      '🔧 Re-aligning gears... still 404!',
      '🧭 Even my internal compass couldn\'t trace this URL.',
    ];
    setRobotReaction(soundbites[Math.floor(Math.random() * soundbites.length)]);
    setTimeout(() => setRobotClicked(false), 1200);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fdf6e3',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '30px 20px',
        position: 'relative',
        overflow: 'hidden',
        color: '#212529',
        fontFamily: 'Inter, -apple-system, sans-serif',
      }}
    >
      {/* ── Decorative Background Sketch Lines (DevDiagram Signature) ─────────── */}
      <svg
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          opacity: 0.07,
        }}
        aria-hidden
      >
        <line x1="10%" y1="0" x2="10%" y2="100%" stroke="#f08c00" strokeWidth="1" strokeDasharray="8 12" />
        <line x1="30%" y1="0" x2="30%" y2="100%" stroke="#f08c00" strokeWidth="1" strokeDasharray="8 12" />
        <line x1="70%" y1="0" x2="70%" y2="100%" stroke="#f08c00" strokeWidth="1" strokeDasharray="8 12" />
        <line x1="90%" y1="0" x2="90%" y2="100%" stroke="#f08c00" strokeWidth="1" strokeDasharray="8 12" />
        <line x1="0" y1="20%" x2="100%" y2="20%" stroke="#f08c00" strokeWidth="1" strokeDasharray="8 12" />
        <line x1="0" y1="80%" x2="100%" y2="80%" stroke="#f08c00" strokeWidth="1" strokeDasharray="8 12" />
      </svg>

      {/* ── Keyframe Animations ─────────────────────────────────────────────────── */}
      <style>{`
        @keyframes gear-cw {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes gear-ccw {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes spark-float {
          0%, 100% { transform: scale(1) translate(0, 0); opacity: 0.9; }
          50% { transform: scale(1.25) translate(2px, -3px); opacity: 1; filter: drop-shadow(0 0 4px #f59f00); }
        }
        @keyframes antenna-bob {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-6deg); }
          75% { transform: rotate(6deg); }
        }
        @keyframes gentle-sway {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .gear-spin-cw {
          transform-origin: 395px 290px;
          animation: gear-cw 8s linear infinite;
        }
        .gear-spin-ccw {
          transform-origin: 425px 280px;
          animation: gear-ccw 6s linear infinite;
        }
        .sparkle-anim {
          transform-origin: 468px 240px;
          animation: spark-float 1.8s ease-in-out infinite;
        }
        .antenna-anim {
          transform-origin: 410px 145px;
          animation: antenna-bob 3.5s ease-in-out infinite;
        }
        .robot-body-group {
          transition: transform 0.25s ease;
        }
        .robot-body-group:hover {
          filter: drop-shadow(0 8px 16px rgba(45, 78, 163, 0.18));
        }
        .robot-shaking {
          animation: gentle-sway 0.2s ease infinite;
        }
      `}</style>

      {/* ── Top Header Text ───────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 6, zIndex: 2 }}>
        <h2
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#94a3b8',
            margin: '0 0 2px',
          }}
        >
          404 ERROR PAGE
        </h2>
        <p
          style={{
            fontFamily: "'Caveat', cursive",
            fontSize: 20,
            color: '#f08c00',
            fontWeight: 700,
            margin: 0,
            letterSpacing: '0.04em',
          }}
        >
          illustration &amp; broken blueprint
        </p>
      </div>

      {/* ── Centerpiece: 4 [Robot] 4 SVG ───────────────────────────────────────── */}
      <div
        style={{
          width: '100%',
          maxWidth: 780,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          margin: '0 auto',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <svg
          viewBox="0 0 820 440"
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: '52vh',
            overflow: 'visible',
            userSelect: 'none',
          }}
          aria-label="404 Robot Illustration"
        >
          <defs>
            {/* Number 4 Gradient (matching the soft slate/lavender-blue in the image) */}
            <linearGradient id="numGradientLeft" x1="0%" y1="0%" x2="10%" y2="100%">
              <stop offset="0%" stopColor="#d5dced" />
              <stop offset="60%" stopColor="#c3cde5" />
              <stop offset="100%" stopColor="#b6c2de" />
            </linearGradient>
            <linearGradient id="numGradientRight" x1="0%" y1="0%" x2="10%" y2="100%">
              <stop offset="0%" stopColor="#d5dced" />
              <stop offset="60%" stopColor="#c3cde5" />
              <stop offset="100%" stopColor="#b6c2de" />
            </linearGradient>

            {/* Robot primary metallic blue gradient */}
            <linearGradient id="botBlue" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3d5af1" />
              <stop offset="100%" stopColor="#2b43b6" />
            </linearGradient>

            {/* Robot chest dark interior */}
            <linearGradient id="chestCavity" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            {/* Orange accents & wrench */}
            <linearGradient id="orangeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59f00" />
              <stop offset="100%" stopColor="#d9480f" />
            </linearGradient>

            {/* Shadow filter */}
            <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#212529" floodOpacity="0.08" />
            </filter>
          </defs>

          {/* ── LEFT "4" ── */}
          <g filter="url(#softShadow)">
            <text
              x="130"
              y="320"
              textAnchor="middle"
              fill="url(#numGradientLeft)"
              style={{
                fontFamily: "'Inter', -apple-system, 'Segoe UI', Arial, sans-serif",
                fontSize: 270,
                fontWeight: 900,
                letterSpacing: '-0.06em',
              }}
            >
              4
            </text>
          </g>

          {/* ── RIGHT "4" ── */}
          <g filter="url(#softShadow)">
            <text
              x="690"
              y="320"
              textAnchor="middle"
              fill="url(#numGradientRight)"
              style={{
                fontFamily: "'Inter', -apple-system, 'Segoe UI', Arial, sans-serif",
                fontSize: 270,
                fontWeight: 900,
                letterSpacing: '-0.06em',
              }}
            >
              4
            </text>
          </g>

          {/* ── FLOOR SHADOW & PUDDLE ── */}
          <ellipse cx="410" cy="355" rx="115" ry="24" fill="#dce4f2" opacity="0.85" />
          <ellipse cx="410" cy="355" rx="75" ry="14" fill="#cbd7eb" opacity="0.7" />

          {/* Scattered debris on floor (hex nut, bolts, washer) */}
          {/* Hex nut */}
          <polygon
            points="408,368 416,364 424,368 424,377 416,381 408,377"
            fill="#94a3b8"
            stroke="#64748b"
            strokeWidth="1.5"
          />
          <circle cx="416" cy="372.5" r="3" fill="#cbd5e1" />

          {/* Small washer / bolt */}
          <circle cx="350" cy="360" r="5" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1.5" />
          <circle cx="350" cy="360" r="2" fill="#94a3b8" />

          {/* Tiny spark crumbs */}
          <circle cx="478" cy="348" r="2.5" fill="#f59f00" opacity="0.8" />
          <circle cx="492" cy="358" r="1.8" fill="#38bdf8" opacity="0.7" />
          <circle cx="330" cy="346" r="2" fill="#cbd5e1" />

          {/* ── THE ROBOT (Replacing the 0) ── */}
          <g
            className={`robot-body-group ${robotClicked ? 'robot-shaking' : ''}`}
            onClick={handleRobotPoke}
            style={{ cursor: 'pointer' }}
          >
            {/* Title tooltip on hover */}
            <title>Click me! (Malfunctioning DevDiagram Robot)</title>

            {/* ─ Pelvis / Lower Seat ─ */}
            <rect x="375" y="318" width="70" height="24" rx="10" fill="#293b94" />
            <rect x="379" y="316" width="62" height="18" rx="8" fill="url(#botBlue)" />

            {/* ─ Legs (Sitting Disassembled on the Floor) ─ */}
            {/* Left leg (lying down leftwards) */}
            <g transform="rotate(35 345 345)">
              <rect x="315" y="338" width="48" height="18" rx="6" fill="#2b43b6" stroke="#212529" strokeWidth="1.5" />
              {/* Joint ring */}
              <circle cx="358" cy="347" r="7" fill="#64748b" />
              {/* Foot plate */}
              <rect x="306" y="332" width="12" height="30" rx="3" fill="#1e3a8a" stroke="#212529" strokeWidth="1.5" />
            </g>

            {/* Right leg (stretched outwards right) */}
            <g transform="rotate(-30 465 345)">
              <rect x="455" y="338" width="48" height="18" rx="6" fill="#2b43b6" stroke="#212529" strokeWidth="1.5" />
              {/* Joint ring */}
              <circle cx="460" cy="347" r="7" fill="#64748b" />
              {/* Foot plate */}
              <rect x="500" y="332" width="12" height="30" rx="3" fill="#1e3a8a" stroke="#212529" strokeWidth="1.5" />
            </g>

            {/* ─ Torso / Main Body ─ */}
            <rect
              x="354"
              y="222"
              width="112"
              height="88"
              rx="16"
              fill="url(#botBlue)"
              stroke="#1e293b"
              strokeWidth="2.5"
            />
            {/* Torso top highlight */}
            <path
              d="M 368 226 L 452 226"
              stroke="#6b8aff"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* ─ Open Chest Inspection Window ─ */}
            <rect
              x="368"
              y="238"
              width="84"
              height="60"
              rx="10"
              fill="url(#chestCavity)"
              stroke="#1e3a8a"
              strokeWidth="2"
            />

            {/* Inside Chest: Circuit meter / indicator on left */}
            <rect x="375" y="258" width="16" height="24" rx="3" fill="#0f172a" />
            <rect x="378" y="262" width="10" height="5" rx="1.5" fill="#ef4444" />
            <circle cx="383" cy="273" r="2" fill="#f59f00" />
            <circle cx="383" cy="278" r="1.5" fill="#10b981" />

            {/* Wires inside chest */}
            <path
              d="M 388 280 Q 395 292 405 288"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Inside Chest: Interlocking Orange Gear */}
            <g className="gear-spin-cw">
              <circle cx="395" cy="290" r="13" fill="#d9480f" />
              <circle cx="395" cy="290" r="6" fill="#1e293b" />
              {/* Gear teeth */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
                <rect
                  key={`og-${angle}`}
                  x="392"
                  y="273"
                  width="6"
                  height="6"
                  rx="1.5"
                  fill="#f08c00"
                  transform={`rotate(${angle} 395 290)`}
                />
              ))}
              <circle cx="395" cy="290" r="11" fill="#f08c00" />
              <circle cx="395" cy="290" r="5" fill="#1e293b" />
            </g>

            {/* Inside Chest: Interlocking Cyan / Blue Gear */}
            <g className="gear-spin-ccw">
              <circle cx="425" cy="280" r="11" fill="#0284c7" />
              <circle cx="425" cy="280" r="5" fill="#1e293b" />
              {/* Teeth */}
              {[0, 60, 120, 180, 240, 300].map((angle) => (
                <rect
                  key={`bg-${angle}`}
                  x="422"
                  y="266"
                  width="6"
                  height="5"
                  rx="1.5"
                  fill="#38bdf8"
                  transform={`rotate(${angle} 425 280)`}
                />
              ))}
              <circle cx="425" cy="280" r="9.5" fill="#38bdf8" />
              <circle cx="425" cy="280" r="4" fill="#0f172a" />
            </g>

            {/* ─ Left Arm (Accordion segmented metal) holding WRENCH ─ */}
            <g>
              {/* Shoulder joint */}
              <circle cx="352" cy="242" r="8" fill="#2b43b6" stroke="#1e293b" strokeWidth="2" />

              {/* Flexible ribbed arm curving down */}
              <path
                d="M 348 244 C 330 256 328 288 344 308"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray="4 3"
              />
              <path
                d="M 348 244 C 330 256 328 288 344 308"
                fill="none"
                stroke="#64748b"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray="2 5"
                opacity="0.5"
              />

              {/* Hand clamp */}
              <circle cx="344" cy="310" r="6" fill="#475569" />

              {/* The ORANGE WRENCH in hand (angled diagonally down) */}
              <g transform="translate(344, 310) rotate(-22)">
                {/* Wrench handle */}
                <rect x="-4" y="-2" width="9" height="42" rx="4" fill="url(#orangeGrad)" stroke="#b43403" strokeWidth="1.2" />
                <circle cx="0.5" cy="34" r="2.2" fill="#fdf6e3" />
                {/* Wrench open jaw / head */}
                <path
                  d="M -9 -8 C -12 -18 13 -18 10 -8 C 7 -4 7 0 2 0 C -3 0 -6 -4 -9 -8 Z"
                  fill="url(#orangeGrad)"
                  stroke="#b43403"
                  strokeWidth="1.2"
                />
                {/* Wrench inner notch */}
                <polygon points="-4,-14 5,-14 2,-7 -1,-7" fill="#1e293b" />
              </g>
            </g>

            {/* ─ Right Arm & SPARK (Disconnected socket with star spark) ─ */}
            <g>
              {/* Shoulder socket */}
              <circle cx="468" cy="242" r="8" fill="#2b43b6" stroke="#1e293b" strokeWidth="2" />
              <rect x="466" y="246" width="6" height="10" rx="3" fill="#64748b" />

              {/* Twinkling Star / Spark right beside shoulder */}
              <g className="sparkle-anim">
                {/* 4-pointed spark star */}
                <path
                  d="M 488 232 Q 488 222 494 222 Q 488 222 488 212 Q 488 222 482 222 Q 488 222 488 232 Z"
                  fill="#f59f00"
                />
                {/* Spark glow */}
                <circle cx="488" cy="222" r="3" fill="#ffd43b" />
                {/* Little spark rays */}
                <line x1="482" y1="216" x2="480" y2="214" stroke="#f59f00" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="495" y1="229" x2="497" y2="231" stroke="#f59f00" strokeWidth="1.5" strokeLinecap="round" />
              </g>
            </g>

            {/* ─ Neck Connector ─ */}
            <rect x="402" y="210" width="16" height="14" rx="2" fill="#1e293b" />
            <line x1="404" y1="215" x2="416" y2="215" stroke="#64748b" strokeWidth="2" />
            <line x1="404" y1="219" x2="416" y2="219" stroke="#64748b" strokeWidth="2" />

            {/* ─ Head ─ */}
            <rect
              x="356"
              y="136"
              width="108"
              height="76"
              rx="18"
              fill="url(#botBlue)"
              stroke="#1e293b"
              strokeWidth="2.5"
            />
            {/* Head shine highlight */}
            <path
              d="M 370 141 L 450 141"
              stroke="#6b8aff"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Side Ear Bolts */}
            <rect x="348" y="162" width="9" height="18" rx="3" fill="#1e293b" />
            <rect x="350" y="165" width="5" height="12" rx="2" fill="#64748b" />
            <rect x="463" y="162" width="9" height="18" rx="3" fill="#1e293b" />
            <rect x="465" y="165" width="5" height="12" rx="2" fill="#64748b" />

            {/* Top Antenna with spring curl and glowing tip */}
            <g className="antenna-anim">
              <rect x="406" y="128" width="8" height="9" rx="2" fill="#1e293b" />
              {/* Spring coil wire */}
              <path
                d="M 410 128 C 404 122 414 116 405 110 C 400 106 408 100 404 94"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Antenna tip sphere with warning color */}
              <circle cx="404" cy="92" r="5" fill="#f08c00" stroke="#b43403" strokeWidth="1.2" />
              <circle cx="403" cy="91" r="1.5" fill="#ffec99" />
            </g>

            {/* ─ Face Features ─ */}
            {/* Left Eye: Orange glowing round camera */}
            <g>
              <circle cx="386" cy="168" r="14" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
              <circle cx="386" cy="168" r="11" fill="url(#orangeGrad)" />
              <circle cx="386" cy="168" r="5" fill="#1e293b" />
              {/* Specular dot */}
              <circle cx="389" cy="165" r="2" fill="#fff" />
            </g>

            {/* Right Eye: Glitched / Dead "X" */}
            <g>
              <line
                x1="426"
                y1="160"
                x2="442"
                y2="176"
                stroke="#bfdbfe"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <line
                x1="442"
                y1="160"
                x2="426"
                y2="176"
                stroke="#bfdbfe"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </g>

            {/* Mouth: Neutral slot */}
            <rect x="400" y="194" width="20" height="4" rx="2" fill="#0f172a" />
          </g>
        </svg>
      </div>

      {/* ── Poke Reaction Message (Interactive Easter Egg) ─────────────────────── */}
      <div
        style={{
          minHeight: 28,
          margin: '4px 0 10px',
          fontFamily: "'Caveat', cursive",
          fontSize: 18,
          color: '#d9480f',
          fontWeight: 700,
          textAlign: 'center',
          transition: 'opacity 0.2s',
          opacity: robotReaction ? 1 : 0,
        }}
      >
        {robotReaction || '·'}
      </div>

      {/* ── Subtitle & Description (matching the reference "uh-oh! Nothing here...") */}
      <div style={{ textAlign: 'center', maxWidth: 540, marginBottom: 26, zIndex: 2 }}>
        <h3
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 22,
            fontWeight: 800,
            color: '#1e293b',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}
        >
          uh-oh! Nothing here...
        </h3>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: '#64748b',
            margin: '0 auto',
          }}
        >
          {attemptedPath ? (
            <>
              The blueprint for{' '}
              <code
                style={{
                  background: '#f1e9d2',
                  padding: '2px 7px',
                  borderRadius: 4,
                  color: '#212529',
                  fontFamily: 'monospace',
                  fontSize: '0.9em',
                  fontWeight: 600,
                }}
              >
                {attemptedPath}
              </code>{' '}
              could not be found or has been disassembled.
            </>
          ) : (
            "The repository, file, or architecture diagram you are trying to reach doesn't exist, was moved, or got lost in transit."
          )}
        </p>
      </div>

      {/* ── Main Action Button: GO BACK HOME (Matching reference pill style) ───── */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 32,
          zIndex: 2,
        }}
      >
        <button
          id="go-back-home-btn"
          onClick={onHome}
          style={{
            background: '#3d5af1',
            color: '#ffffff',
            border: '2px solid #2845c4',
            borderRadius: 50,
            padding: '14px 44px',
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontFamily: "'Inter', sans-serif",
            cursor: 'pointer',
            boxShadow: '0 6px 14px rgba(61, 90, 241, 0.35), 2px 3px 0 #1e3a8a',
            transition: 'all 0.15s ease',
            outline: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#2f4bd6';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 18px rgba(61, 90, 241, 0.45), 2px 4px 0 #1e3a8a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#3d5af1';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 6px 14px rgba(61, 90, 241, 0.35), 2px 3px 0 #1e3a8a';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'translate(2px, 2px)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(61, 90, 241, 0.2), 0 0 0 #1e3a8a';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
        >
          GO BACK HOME
        </button>

        {/* Secondary sketch back button */}
        <button
          id="go-back-previous-btn"
          onClick={() => window.history.back()}
          style={{
            background: '#fffef7',
            color: '#495057',
            border: '1.5px solid #dcd3b8',
            borderRadius: 50,
            padding: '13px 26px',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "'Caveat', cursive",
            cursor: 'pointer',
            boxShadow: '2px 2px 0 #e9dfc8',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#f08c00';
            e.currentTarget.style.color = '#212529';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#dcd3b8';
            e.currentTarget.style.color = '#495057';
          }}
        >
          ← Previous Page
        </button>
      </div>

      {/* ── Quick Search / Jump Bar (DevDiagram Feature) ────────────────────────── */}
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: '#fffef7',
          border: '1.5px solid #e9dfc8',
          borderRadius: 14,
          padding: '14px 18px',
          boxShadow: '3px 3px 0 #e9dfc8',
          marginBottom: 24,
          zIndex: 2,
        }}
      >
        <form onSubmit={handleQuickSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="Or map another repo (e.g. owner/repo)..."
            style={{
              flex: 1,
              border: '1px solid #e2d7be',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              background: '#ffffff',
              color: '#212529',
              outline: 'none',
              fontFamily: 'Inter, sans-serif',
            }}
          />
          <button
            type="submit"
            disabled={!quickInput.trim()}
            style={{
              background: quickInput.trim() ? '#212529' : '#adb5bd',
              color: '#f8f9fa',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "'Caveat', cursive",
              cursor: quickInput.trim() ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
          >
            Explore →
          </button>
        </form>

        {/* Quick Example Chips */}
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 2 }}>Popular:</span>
          {quickRepos.map((repo) => (
            <button
              key={repo}
              onClick={() => {
                if (onNavigate) {
                  const [o, r] = repo.split('/');
                  onNavigate(o, r);
                }
              }}
              style={{
                fontSize: 11,
                border: '1px solid #e2d7be',
                borderRadius: 12,
                padding: '2px 8px',
                background: '#faf6ea',
                color: '#4b5563',
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#f08c00';
                e.currentTarget.style.color = '#212529';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e2d7be';
                e.currentTarget.style.color = '#4b5563';
              }}
            >
              {repo}
            </button>
          ))}
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', zIndex: 2 }}>
        DevDiagram — Interactive AI Architecture Mind Maps
      </footer>
    </div>
  );
}

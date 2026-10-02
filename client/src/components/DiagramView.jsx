import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

// ── Step metadata for Rising Stairs architecture ──────────────────────────────
const STEP_META = [
  { num: '01', title: 'ENTRY & BOOTSTRAP', subtitle: 'Entry points, configs & root files', icon: '🚀' },
  { num: '02', title: 'ROUTING & APP SHELL', subtitle: 'Routers, main wrappers & layout', icon: '🧭' },
  { num: '03', title: 'CORE LOGIC & VIEWS', subtitle: 'Components, controllers & middleware', icon: '⚡' },
  { num: '04', title: 'SERVICES & STATE', subtitle: 'State stores, utilities & helpers', icon: '🧩' },
  { num: '05', title: 'DATA & PERSISTENCE', subtitle: 'Database models, schemas & storage', icon: '🗄️' },
  { num: '06', title: 'EXTENSIONS & TESTS', subtitle: 'Examples, tests & outputs', icon: '🧪' },
  { num: '07', title: 'AUXILIARY MODULES', subtitle: 'Supporting packages & assets', icon: '📦' },
];

// Color tags for file extensions
const EXT_COLORS = {
  js:   { bg: '#fef3c7', text: '#b45309', border: '#fde68a' },
  jsx:  { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
  ts:   { bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe' },
  tsx:  { bg: '#ede9fe', text: '#6d28d9', border: '#ddd6fe' },
  html: { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa' },
  css:  { bg: '#fce7f3', text: '#be185d', border: '#fbcfe8' },
  json: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  py:   { bg: '#e0e7ff', text: '#4338ca', border: '#c7d2fe' },
};

const DEFAULT_EXT = { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };

function getFileExt(path = '') {
  const parts = path.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

// ── Rising Stairs Layout Algorithm ───────────────────────────────────────────
function buildRisingStairsLayout(nodes, edges) {
  if (!nodes.length) return { positioned: [], stairs: [] };

  const inDegree = {};
  const children = {};
  const parents = {};

  nodes.forEach((n) => {
    inDegree[n.id] = 0;
    children[n.id] = [];
    parents[n.id] = [];
  });

  edges.forEach((e) => {
    if (inDegree[e.to] !== undefined) inDegree[e.to]++;
    if (children[e.from]) children[e.from].push(e.to);
    if (parents[e.to]) parents[e.to].push(e.from);
  });

  // Role heuristics from file path and label
  function heuristicStep(node) {
    const p = (node.path || '').toLowerCase();
    const l = (node.label || '').toLowerCase();

    // Step 0: Entry points & config
    if (
      p.includes('package.json') || p.includes('vite.config') || p.includes('webpack') ||
      p.endsWith('index.html') || p === 'index.html' ||
      l.includes('entry point') || l.includes('bootstrap') || l.includes('manifest')
    ) {
      return 0;
    }

    // Step 1: App wrapper & routers
    if (
      p.includes('main.') || p.includes('app.') || p.includes('router') || p.includes('routes') ||
      l.includes('router') || l.includes('route') || l.includes('app component') || l.includes('factory')
    ) {
      return 1;
    }

    // Step 4: DB & models
    if (
      p.includes('model') || p.includes('db/') || p.includes('database') || p.includes('schema') ||
      l.includes('database') || l.includes('model') || l.includes('schema')
    ) {
      return 4;
    }

    // Step 5: Tests / examples
    if (p.includes('test') || p.includes('example') || l.includes('test') || l.includes('example')) {
      return 5;
    }

    // Step 3: utils / helpers / services / css
    if (
      p.includes('util') || p.includes('service') || p.includes('helper') ||
      p.includes('middleware') || p.includes('.css') ||
      l.includes('util') || l.includes('service') || l.includes('helper')
    ) {
      return 3;
    }

    // Default to Step 2 (Components / Views / Logic)
    return 2;
  }

  // Initial step assignment combining heuristics
  const assigned = {};
  nodes.forEach((n) => {
    assigned[n.id] = heuristicStep(n);
  });

  // Forward relaxation: ensure target step >= source step + 1 so edges flow up the stairs
  let changed = true;
  let iters = 0;
  while (changed && iters < 8) {
    changed = false;
    iters++;
    edges.forEach((e) => {
      if (assigned[e.from] !== undefined && assigned[e.to] !== undefined) {
        if (assigned[e.to] <= assigned[e.from]) {
          assigned[e.to] = assigned[e.from] + 1;
          changed = true;
        }
      }
    });
  }

  // Compress steps into continuous 0..K
  const uniqueSteps = Array.from(new Set(Object.values(assigned))).sort((a, b) => a - b);
  const stepMap = {};
  uniqueSteps.forEach((s, idx) => { stepMap[s] = idx; });
  nodes.forEach((n) => {
    assigned[n.id] = stepMap[assigned[n.id]];
  });

  // Group by step
  const byStep = {};
  nodes.forEach((n) => {
    const s = assigned[n.id];
    if (!byStep[s]) byStep[s] = [];
    byStep[s].push(n);
  });

  const stepIndices = Object.keys(byStep).map(Number).sort((a, b) => a - b);

  const CARD_WIDTH = 270;
  const CARD_HEIGHT = 84;
  const STAIR_STEP_X = 350;
  const STAIR_RISE_Y = 110; // vertical rise (elevation) per step
  const NODE_GAP_Y = 24;

  const positions = {};
  const stairsMeta = [];

  stepIndices.forEach((s, stepOrder) => {
    const stepNodes = byStep[s];
    // Sort nodes in step: project files first, then alphabetically
    stepNodes.sort((a, b) => {
      const aProj = a.valid !== false && a.type === 'file';
      const bProj = b.valid !== false && b.type === 'file';
      if (aProj && !bProj) return -1;
      if (!aProj && bProj) return 1;
      return (a.label || '').localeCompare(b.label || '');
    });

    const stairX = stepOrder * STAIR_STEP_X + 100;
    const stairBaseY = -stepOrder * STAIR_RISE_Y;

    const count = stepNodes.length;
    const totalHeight = count * CARD_HEIGHT + (count - 1) * NODE_GAP_Y;
    const startY = stairBaseY - totalHeight / 2 + CARD_HEIGHT / 2;

    stepNodes.forEach((node, i) => {
      positions[node.id] = {
        x: stairX,
        y: startY + i * (CARD_HEIGHT + NODE_GAP_Y),
        step: stepOrder,
      };
    });

    const meta = STEP_META[Math.min(stepOrder, STEP_META.length - 1)];
    const projectFilesCount = stepNodes.filter((n) => n.valid !== false && n.type === 'file').length;

    stairsMeta.push({
      stepIndex: stepOrder,
      title: meta.title,
      subtitle: meta.subtitle,
      num: meta.num,
      icon: meta.icon,
      x: stairX - 16,
      topY: startY - CARD_HEIGHT / 2 - 50,
      bottomY: startY + totalHeight - CARD_HEIGHT / 2 + 40,
      width: CARD_WIDTH + 32,
      stairBaseY,
      projectFilesCount,
      totalCount: count,
    });
  });

  const positioned = nodes.map((n) => {
    const pos = positions[n.id] || { x: 0, y: 0, step: 0 };
    return {
      ...n,
      x: pos.x,
      y: pos.y,
      step: pos.step,
      isProjectFile: n.valid !== false && n.type === 'file',
      isDisplaced: false,
    };
  });

  return { positioned, stairs: stairsMeta };
}

// ── Alternative Radial Layout ────────────────────────────────────────────────
function buildRadialLayout(nodes, edges) {
  if (!nodes.length) return { positioned: [], stairs: [] };
  const outCount = {};
  nodes.forEach((n) => { outCount[n.id] = 0; });
  edges.forEach((e) => { if (outCount[e.from] !== undefined) outCount[e.from]++; });
  const rootId = nodes.reduce((a, b) => (outCount[a.id] >= outCount[b.id] ? a : b)).id;

  const RADII = [0, 280, 520, 750];
  const positioned = nodes.map((n, i) => {
    if (n.id === rootId) {
      return { ...n, x: 0, y: 0, step: 0, isProjectFile: n.valid !== false && n.type === 'file', isDisplaced: false };
    }
    const angle = (2 * Math.PI * (i - 1)) / (nodes.length - 1) - Math.PI / 2;
    const r = RADII[1 + (i % 2)];
    return {
      ...n,
      x: r * Math.cos(angle),
      y: r * Math.sin(angle),
      step: 1,
      isProjectFile: n.valid !== false && n.type === 'file',
      isDisplaced: false,
    };
  });

  return { positioned, stairs: [] };
}

// ── Main DiagramView Component ────────────────────────────────────────────────
export default function DiagramView({ graph, branch, owner, repo, selectedNode, onSelectNode }) {
  const svgRef = useRef(null);
  const [layoutMode, setLayoutMode] = useState('stairs');
  const [onlyProjectFiles, setOnlyProjectFiles] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [laid, setLaid] = useState([]);
  const [stairs, setStairs] = useState([]);
  const [edges, setEdges] = useState([]);
  const [vb, setVb] = useState({ x: -200, y: -400, w: 1400, h: 900 });

  // Canvas Pan state
  const [pan, setPan] = useState(null);
  // Excalidraw Node Drag / Displacement state
  const [draggedNode, setDraggedNode] = useState(null);
  const [hovered, setHovered] = useState(null);

  // Compute Layout
  const computeLayout = useCallback(() => {
    if (!graph?.nodes?.length) return;
    const { positioned, stairs: stairsData } =
      layoutMode === 'stairs'
        ? buildRisingStairsLayout(graph.nodes, graph.edges || [])
        : buildRadialLayout(graph.nodes, graph.edges || []);

    setLaid(positioned);
    setStairs(stairsData);
    setEdges(graph.edges || []);

    if (positioned.length) {
      const xs = positioned.map((n) => n.x);
      const ys = positioned.map((n) => n.y);
      const padX = 160;
      const padY = 140;
      const minX = Math.min(...xs) - padX;
      const minY = Math.min(...ys) - padY;
      const maxX = Math.max(...xs) + padX + 270;
      const maxY = Math.max(...ys) + padY + 84;
      setVb({ x: minX, y: minY, w: Math.max(maxX - minX, 900), h: Math.max(maxY - minY, 600) });
    }
  }, [graph, layoutMode]);

  useEffect(() => {
    computeLayout();
  }, [computeLayout]);

  // Lookup map for fast position lookups
  const nodeMap = useMemo(() => {
    const m = {};
    laid.forEach((n) => { m[n.id] = n; });
    return m;
  }, [laid]);

  // Has any node been displaced by the user?
  const hasDisplacedNodes = useMemo(() => laid.some((n) => n.isDisplaced), [laid]);

  // ── Node Drag / Displacement Handlers (Excalidraw style) ──────────────────
  const onNodeMouseDown = useCallback((e, node) => {
    e.stopPropagation();
    if (e.button !== 0) return; // Left click only

    setDraggedNode({
      id: node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: node.x,
      origY: node.y,
      hasMoved: false,
    });
  }, []);

  // ── Canvas Pan Handlers ───────────────────────────────────────────────────
  const onCanvasMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setPan({ startX: e.clientX, startY: e.clientY, origVb: { ...vb } });
  }, [vb]);

  const onMouseMove = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = vb.w / rect.width;
    const scaleY = vb.h / rect.height;

    // 1. DISPLACING A NODE (Excalidraw Drag-and-Drop)
    if (draggedNode) {
      const dx = (e.clientX - draggedNode.startClientX) * scaleX;
      const dy = (e.clientY - draggedNode.startClientY) * scaleY;

      if (Math.hypot(dx, dy) > 2) {
        draggedNode.hasMoved = true;
      }

      const newX = draggedNode.origX + dx;
      const newY = draggedNode.origY + dy;

      setLaid((prev) =>
        prev.map((n) =>
          n.id === draggedNode.id
            ? { ...n, x: newX, y: newY, isDisplaced: true }
            : n
        )
      );
      return;
    }

    // 2. PANNING CANVAS BACKGROUND
    if (pan) {
      const dx = (pan.startX - e.clientX) * scaleX;
      const dy = (pan.startY - e.clientY) * scaleY;
      setVb({ ...pan.origVb, x: pan.origVb.x + dx, y: pan.origVb.y + dy });
    }
  }, [draggedNode, pan, vb.w, vb.h]);

  const onMouseUp = useCallback(() => {
    if (draggedNode) {
      // If the node wasn't dragged (just clicked without moving), select/inspect it
      if (!draggedNode.hasMoved) {
        const clickedNode = nodeMap[draggedNode.id];
        onSelectNode(selectedNode?.id === draggedNode.id ? null : clickedNode);
      }
      setDraggedNode(null);
    }
    if (pan) {
      setPan(null);
    }
  }, [draggedNode, pan, nodeMap, onSelectNode, selectedNode]);

  // Wheel zoom
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.88;
    setVb((v) => {
      const nw = Math.min(Math.max(v.w * factor, 300), 5000);
      const nh = Math.min(Math.max(v.h * factor, 240), 4000);
      return { x: v.x + (v.w - nw) / 2, y: v.y + (v.h - nh) / 2, w: nw, h: nh };
    });
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // Connected nodes set for active highlight
  const connectedNodeIds = useMemo(() => {
    if (!hovered && !selectedNode) return null;
    const targetId = hovered || selectedNode?.id;
    const set = new Set([targetId]);
    edges.forEach((e) => {
      if (e.from === targetId) set.add(e.to);
      if (e.to === targetId) set.add(e.from);
    });
    return set;
  }, [hovered, selectedNode, edges]);

  // Stats
  const projectFilesCount = useMemo(
    () => laid.filter((n) => n.isProjectFile).length,
    [laid]
  );

  const viewBox = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#fdfbf7', overflow: 'hidden' }}>
      {/* ── Top Architecture Bar ────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 12, left: 16, right: 16, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        pointerEvents: 'none',
      }}>
        {/* Left: Summary pill & Project file filter */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.92)',
          border: '1.5px solid #e2e8f0',
          borderRadius: 12, padding: '5px 12px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
          backdropFilter: 'blur(8px)',
          pointerEvents: 'auto',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
            🪜 Rising Stairs Architecture
          </span>
          <span style={{ color: '#cbd5e1' }}>|</span>

          {/* In-Project Files Filter */}
          <button
            onClick={() => setOnlyProjectFiles(!onlyProjectFiles)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: onlyProjectFiles ? '#ecfdf5' : '#f8fafc',
              border: `1.5px solid ${onlyProjectFiles ? '#10b981' : '#cbd5e1'}`,
              borderRadius: 20, padding: '3px 10px',
              fontSize: 12, fontWeight: 600,
              color: onlyProjectFiles ? '#047857' : '#475569',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Click to spotlight real files in project"
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#10b981', display: 'inline-block',
              boxShadow: '0 0 0 2px rgba(16,185,129,0.2)',
            }} />
            <span>✓ {projectFilesCount} Files in Project</span>
            {onlyProjectFiles && <span style={{ fontSize: 10, background: '#10b981', color: '#fff', borderRadius: 10, padding: '1px 5px' }}>Active</span>}
          </button>

          {/* Excalidraw Drag Displace Info Badge */}
          <span style={{
            fontSize: 11.5, color: '#64748b', background: '#f1f5f9',
            borderRadius: 6, padding: '2px 7px',
          }}>
            ✋ Drag any card to displace
          </span>

          {hasDisplacedNodes && (
            <button
              onClick={computeLayout}
              style={{
                border: '1px solid #fed7aa', background: '#fff7ed',
                color: '#c2410c', borderRadius: 6, padding: '2px 8px',
                fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              }}
              title="Reset displaced nodes back to original rising stairs layout"
            >
              ↺ Reset Layout
            </button>
          )}
        </div>

        {/* Right: Layout Switcher & Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          pointerEvents: 'auto',
        }}>
          {/* Search box */}
          <div style={{
            background: 'rgba(255,255,255,0.92)',
            border: '1.5px solid #e2e8f0', borderRadius: 10,
            padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 2px 10px rgba(0,0,0,0.05)', backdropFilter: 'blur(8px)',
          }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>🔍</span>
            <input
              type="text"
              placeholder="Search files / nodes…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                fontSize: 12, color: '#1e293b', width: 140,
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}
              >
                ✕
              </button>
            )}
          </div>

          {/* View mode toggle */}
          <div style={{
            background: 'rgba(255,255,255,0.92)',
            border: '1.5px solid #e2e8f0', borderRadius: 10,
            padding: 3, display: 'flex', gap: 2,
            boxShadow: '0 2px 10px rgba(0,0,0,0.05)', backdropFilter: 'blur(8px)',
          }}>
            <button
              onClick={() => setLayoutMode('stairs')}
              style={{
                border: 'none', borderRadius: 7, padding: '4px 10px',
                fontSize: 12, fontWeight: layoutMode === 'stairs' ? 700 : 500,
                background: layoutMode === 'stairs' ? '#1e293b' : 'transparent',
                color: layoutMode === 'stairs' ? '#f8fafc' : '#64748b',
                cursor: 'pointer',
              }}
            >
              🪜 Rising Stairs
            </button>
            <button
              onClick={() => setLayoutMode('mindmap')}
              style={{
                border: 'none', borderRadius: 7, padding: '4px 10px',
                fontSize: 12, fontWeight: layoutMode === 'mindmap' ? 700 : 500,
                background: layoutMode === 'mindmap' ? '#1e293b' : 'transparent',
                color: layoutMode === 'mindmap' ? '#f8fafc' : '#64748b',
                cursor: 'pointer',
              }}
            >
              🌀 Radial Map
            </button>
          </div>
        </div>
      </div>

      {/* ── SVG Canvas ──────────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={viewBox}
        style={{
          width: '100%', height: '100%',
          cursor: draggedNode ? 'grabbing' : pan ? 'grabbing' : 'default',
          userSelect: 'none',
        }}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <defs>
          <filter id="card-shadow" x="-10%" y="-10%" width="125%" height="125%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0f172a" floodOpacity="0.08" />
          </filter>
          <filter id="hover-shadow" x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#0f172a" floodOpacity="0.14" />
          </filter>
          <filter id="drag-shadow" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#0f172a" floodOpacity="0.25" />
          </filter>

          {/* Arrow markers */}
          <marker id="edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M 0 1 L 7 4 L 0 7 z" fill="#94a3b8" />
          </marker>
          <marker id="edge-arrow-active" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
            <path d="M 0 1.5 L 8 4.5 L 0 7.5 z" fill="#f59e0b" />
          </marker>
          <marker id="edge-arrow-project" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M 0 1 L 7 4 L 0 7 z" fill="#10b981" />
          </marker>
        </defs>

        {/* ── Background Grid ──────────────────────────────────────────────── */}
        <pattern id="arch-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f1ece1" strokeWidth="1" />
          <circle cx="0" cy="0" r="1.5" fill="#e2dac8" />
        </pattern>
        <rect x={vb.x - 400} y={vb.y - 400} width={vb.w + 800} height={vb.h + 800} fill="url(#arch-grid)" />

        {/* ── STAIR PLATFORMS & RISERS ─────────────────────────────────────── */}
        {layoutMode === 'stairs' && (
          <g className="stairs-scenery">
            {stairs.map((stair, i) => {
              const nextStair = stairs[i + 1];
              return (
                <g key={`stair-${stair.stepIndex}`}>
                  {/* Stair Column Shelf */}
                  <rect
                    x={stair.x}
                    y={stair.topY}
                    width={stair.width}
                    height={stair.bottomY - stair.topY}
                    rx={14}
                    fill="#ffffff"
                    fillOpacity="0.65"
                    stroke="#e2e8f0"
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                  />

                  {/* Step Level Header Banner */}
                  <g transform={`translate(${stair.x + 14}, ${stair.topY + 22})`}>
                    <rect
                      x="0" y="-12"
                      width="52" height="20"
                      rx="6"
                      fill="#1e293b"
                    />
                    <text
                      x="26" y="2"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="10"
                      fontWeight="700"
                      fontFamily="'Inter', sans-serif"
                      letterSpacing="0.05em"
                    >
                      STEP {stair.num}
                    </text>

                    <text
                      x="60" y="2"
                      fill="#0f172a"
                      fontSize="12.5"
                      fontWeight="700"
                      fontFamily="'Inter', sans-serif"
                    >
                      {stair.icon} {stair.title}
                    </text>

                    <text
                      x={stair.width - 28} y="2"
                      textAnchor="end"
                      fill={stair.projectFilesCount > 0 ? '#047857' : '#94a3b8'}
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="'Inter', sans-serif"
                    >
                      {stair.projectFilesCount > 0 ? `✓ ${stair.projectFilesCount} files` : `${stair.totalCount} items`}
                    </text>
                  </g>

                  {/* Stair Riser */}
                  {nextStair && (
                    <g>
                      <path
                        d={`M ${stair.x + stair.width} ${stair.bottomY - 10} L ${nextStair.x} ${stair.bottomY - 10} L ${nextStair.x} ${nextStair.bottomY - 10}`}
                        fill="none"
                        stroke="#cbd5e1"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={(stair.x + stair.width + nextStair.x) / 2}
                        y={stair.bottomY - 16}
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize="11"
                        fontFamily="'Caveat', cursive"
                        fontWeight="700"
                      >
                        Step Up ↗
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/* ── EDGES (Dynamically follow displaced cards in real-time) ────────── */}
        <g className="edges-layer">
          {edges.map((e, i) => {
            const from = nodeMap[e.from];
            const to = nodeMap[e.to];
            if (!from || !to) return null;

            const CARD_WIDTH = 270;
            const CARD_HEIGHT = 84;

            // Adaptive connection points based on relative card positions
            let x1 = from.x + CARD_WIDTH;
            let y1 = from.y;
            let x2 = to.x;
            let y2 = to.y;

            // If user displaced 'to' to the left of 'from', adjust ports
            if (to.x + CARD_WIDTH < from.x) {
              x1 = from.x;
              x2 = to.x + CARD_WIDTH;
            }

            if (layoutMode === 'mindmap') {
              x1 = from.x;
              y1 = from.y;
              x2 = to.x;
              y2 = to.y;
            }

            const isHovered = hovered === e.from || hovered === e.to;
            const isSelected = selectedNode?.id === e.from || selectedNode?.id === e.to;
            const isDragging = draggedNode?.id === e.from || draggedNode?.id === e.to;
            const isActive = isHovered || isSelected || isDragging;

            const isDimmed =
              (connectedNodeIds && !connectedNodeIds.has(e.from) && !connectedNodeIds.has(e.to)) ||
              (onlyProjectFiles && (!from.isProjectFile || !to.isProjectFile));

            const dx = Math.abs(x2 - x1);
            const cx1 = x1 > x2 ? x1 - Math.max(dx * 0.45, 40) : x1 + Math.max(dx * 0.45, 40);
            const cy1 = y1;
            const cx2 = x1 > x2 ? x2 + Math.max(dx * 0.45, 40) : x2 - Math.max(dx * 0.45, 40);
            const cy2 = y2;
            const pathD = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

            return (
              <path
                key={`edge-${i}`}
                d={pathD}
                fill="none"
                stroke={isActive ? '#f59e0b' : from.isProjectFile && to.isProjectFile ? '#94a3b8' : '#cbd5e1'}
                strokeWidth={isActive ? 3 : 1.75}
                markerEnd={isActive ? 'url(#edge-arrow-active)' : 'url(#edge-arrow)'}
                opacity={isDimmed ? 0.15 : isActive ? 1 : 0.8}
              />
            );
          })}
        </g>

        {/* ── NODES (Excalidraw Displaceable Cards) ─────────────────────────── */}
        <g className="nodes-layer">
          {laid.map((node) => {
            const CARD_WIDTH = 270;
            const CARD_HEIGHT = 84;
            const rx = node.x;
            const ry = node.y - CARD_HEIGHT / 2;

            const isSelected = selectedNode?.id === node.id;
            const isHovered = hovered === node.id;
            const isDraggingThis = draggedNode?.id === node.id;
            const isConnected = connectedNodeIds?.has(node.id);

            const matchesSearch =
              !searchTerm ||
              node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (node.path && node.path.toLowerCase().includes(searchTerm.toLowerCase()));

            const isDimmed =
              !matchesSearch ||
              (onlyProjectFiles && !node.isProjectFile) ||
              (connectedNodeIds && !isConnected);

            const ext = getFileExt(node.path);
            const extStyle = EXT_COLORS[ext] || DEFAULT_EXT;

            let icon = '📄';
            if (node.type === 'folder') icon = '📁';
            else if (ext === 'jsx' || ext === 'tsx') icon = '⚛️';
            else if (ext === 'html') icon = '🌐';
            else if (ext === 'css') icon = '🎨';
            else if (ext === 'json') icon = '📋';
            else if (node.path?.includes('config')) icon = '⚡';
            else if (node.path?.includes('db') || node.path?.includes('model')) icon = '🗄️';

            const accentColor = node.isProjectFile ? '#10b981' : node.type === 'folder' ? '#3b82f6' : '#f59e0b';

            return (
              <g
                key={node.id}
                onMouseDown={(e) => onNodeMouseDown(e, node)}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  cursor: isDraggingThis ? 'grabbing' : 'grab',
                  opacity: isDimmed ? 0.22 : 1,
                  transition: isDraggingThis ? 'none' : 'opacity 0.2s ease',
                }}
              >
                {/* Drag / Selection Halo */}
                {(isSelected || isHovered || isDraggingThis) && (
                  <rect
                    x={rx - 4}
                    y={ry - 4}
                    width={CARD_WIDTH + 8}
                    height={CARD_HEIGHT + 8}
                    rx={14}
                    fill="none"
                    stroke={isSelected ? '#1e293b' : isDraggingThis ? '#3b82f6' : '#f59e0b'}
                    strokeWidth={isDraggingThis ? 2.5 : 2}
                    strokeDasharray={isSelected ? 'none' : '4 3'}
                  />
                )}

                {/* Main Card Rectangle */}
                <rect
                  x={rx}
                  y={ry}
                  width={CARD_WIDTH}
                  height={CARD_HEIGHT}
                  rx={10}
                  fill="#ffffff"
                  stroke={isSelected ? '#1e293b' : isDraggingThis ? '#3b82f6' : isHovered ? '#f59e0b' : '#e2e8f0'}
                  strokeWidth={isSelected || isDraggingThis ? 2.5 : 1.5}
                  filter={isDraggingThis ? 'url(#drag-shadow)' : isHovered ? 'url(#hover-shadow)' : 'url(#card-shadow)'}
                />

                {/* Left Accent Bar */}
                <rect
                  x={rx}
                  y={ry}
                  width={6}
                  height={CARD_HEIGHT}
                  rx={3}
                  fill={accentColor}
                />

                {/* Displaced node pin badge */}
                {node.isDisplaced && (
                  <g transform={`translate(${rx + CARD_WIDTH - 6}, ${ry - 6})`}>
                    <circle cx="0" cy="0" r="7" fill="#3b82f6" />
                    <text x="0" y="3" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700">✋</text>
                  </g>
                )}

                {/* Top Row: Icon + Title */}
                <g transform={`translate(${rx + 16}, ${ry + 20})`}>
                  <text fontSize="14" dominantBaseline="middle">
                    {icon}
                  </text>
                  <text
                    x="22"
                    y="0"
                    dominantBaseline="middle"
                    fill="#0f172a"
                    fontSize="13"
                    fontWeight="700"
                    fontFamily="'Inter', sans-serif"
                  >
                    {node.label.length > 20 ? node.label.slice(0, 19) + '…' : node.label}
                  </text>
                </g>

                {/* Top Right: IN PROJECT BADGE */}
                <g transform={`translate(${rx + CARD_WIDTH - 12}, ${ry + 20})`}>
                  {node.isProjectFile ? (
                    <g>
                      <rect
                        x="-88"
                        y="-10"
                        width="88"
                        height="20"
                        rx="10"
                        fill="#ecfdf5"
                        stroke="#a7f3d0"
                        strokeWidth="1"
                      />
                      <circle cx="-77" cy="0" r="3.5" fill="#10b981" />
                      <text
                        x="-68"
                        y="3"
                        fill="#047857"
                        fontSize="9.5"
                        fontWeight="700"
                        fontFamily="'Inter', sans-serif"
                        letterSpacing="0.02em"
                      >
                        IN PROJECT
                      </text>
                    </g>
                  ) : node.type === 'folder' ? (
                    <g>
                      <rect
                        x="-68"
                        y="-10"
                        width="68"
                        height="20"
                        rx="10"
                        fill="#eff6ff"
                        stroke="#bfdbfe"
                        strokeWidth="1"
                      />
                      <text
                        x="-34"
                        y="3"
                        textAnchor="middle"
                        fill="#1d4ed8"
                        fontSize="9.5"
                        fontWeight="700"
                        fontFamily="'Inter', sans-serif"
                      >
                        DIRECTORY
                      </text>
                    </g>
                  ) : (
                    <g>
                      <rect
                        x="-64"
                        y="-10"
                        width="64"
                        height="20"
                        rx="10"
                        fill="#f8fafc"
                        stroke="#e2e8f0"
                        strokeWidth="1"
                      />
                      <text
                        x="-32"
                        y="3"
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize="9.5"
                        fontWeight="600"
                        fontFamily="'Inter', sans-serif"
                      >
                        MODULE
                      </text>
                    </g>
                  )}
                </g>

                {/* Middle Row: File Path (Clean Monospace Badge) */}
                <g transform={`translate(${rx + 16}, ${ry + 44})`}>
                  {ext && (
                    <g>
                      <rect
                        x="0"
                        y="-8"
                        width={Math.max(26, ext.length * 7 + 10)}
                        height="16"
                        rx="4"
                        fill={extStyle.bg}
                        stroke={extStyle.border}
                        strokeWidth="1"
                      />
                      <text
                        x={Math.max(13, (ext.length * 7 + 10) / 2)}
                        y="4"
                        textAnchor="middle"
                        fill={extStyle.text}
                        fontSize="9"
                        fontWeight="700"
                        fontFamily="'Inter', sans-serif"
                      >
                        .{ext.toUpperCase()}
                      </text>
                    </g>
                  )}

                  <text
                    x={ext ? Math.max(34, ext.length * 7 + 18) : 0}
                    y="4"
                    fill="#334155"
                    fontSize="10.5"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                    fontWeight="500"
                  >
                    {node.path ? (node.path.length > 28 ? '…' + node.path.slice(-27) : node.path) : 'Virtual Node'}
                  </text>
                </g>

                {/* Bottom Row: 1-Line Architectural Summary */}
                <g transform={`translate(${rx + 16}, ${ry + 68})`}>
                  <text
                    x="0"
                    y="0"
                    fill="#64748b"
                    fontSize="10.5"
                    fontFamily="'Inter', sans-serif"
                    fontWeight="400"
                  >
                    {node.summary
                      ? node.summary.length > 34
                        ? node.summary.slice(0, 33) + '…'
                        : node.summary
                      : 'Component in architecture'}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      {/* ── Bottom Floating Legend & Info ────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        background: 'rgba(255,255,255,0.94)',
        border: '1.5px solid #e2e8f0', borderRadius: 12,
        padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 16,
        fontSize: 12, color: '#475569',
        boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          <span style={{ fontWeight: 600, color: '#047857' }}>In-Project File</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
          <span style={{ fontWeight: 600, color: '#1d4ed8' }}>Directory</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 16, height: 2, background: '#f59e0b', display: 'inline-block' }} />
          <span style={{ fontWeight: 500, color: '#64748b' }}>Dependency Flow ➔</span>
        </div>
        <span style={{ color: '#cbd5e1' }}>|</span>
        <span style={{ color: '#94a3b8', fontSize: 11 }}>
          ✋ Click & Drag any card to displace · Click to inspect · Scroll to zoom
        </span>
      </div>

      {/* ── Zoom & Navigation Controls ────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 16, right: 16,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {[
          {
            icon: '+', title: 'Zoom In',
            action: () => setVb((v) => ({ x: v.x + v.w * 0.1, y: v.y + v.h * 0.1, w: v.w * 0.8, h: v.h * 0.8 })),
          },
          {
            icon: '−', title: 'Zoom Out',
            action: () => setVb((v) => ({ x: v.x - v.w * 0.1, y: v.y - v.h * 0.1, w: v.w * 1.25, h: v.h * 1.25 })),
          },
          {
            icon: '⊡', title: 'Reset View / Fit',
            action: () => {
              if (!laid.length) return;
              const xs = laid.map((n) => n.x);
              const ys = laid.map((n) => n.y);
              const padX = 160;
              const padY = 140;
              setVb({
                x: Math.min(...xs) - padX,
                y: Math.min(...ys) - padY,
                w: Math.max(...xs) - Math.min(...xs) + padX * 2 + 270,
                h: Math.max(...ys) - Math.min(...ys) + padY * 2 + 84,
              });
            },
          },
        ].map(({ icon, title, action }) => (
          <button
            key={title}
            onClick={action}
            title={title}
            style={{
              width: 36, height: 36,
              borderRadius: 10,
              border: '1.5px solid #e2e8f0',
              background: 'rgba(255,255,255,0.92)',
              fontSize: 16, fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#334155',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              backdropFilter: 'blur(6px)',
              transition: 'all 0.15s ease',
            }}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* ── Node Detail Drawer (When a node is selected) ──────────────────────── */}
      {selectedNode && (
        <div style={{
          position: 'absolute', top: 68, right: 16, width: 320,
          background: 'rgba(255,255,255,0.98)',
          border: '1.5px solid #cbd5e1',
          borderRadius: 14,
          padding: 16,
          boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
          backdropFilter: 'blur(12px)',
          zIndex: 20,
          animation: 'fadeIn 0.15s ease',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>{selectedNode.type === 'folder' ? '📁' : '📄'}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  {selectedNode.label}
                </span>
              </div>
              {selectedNode.isProjectFile && (
                <span style={{
                  background: '#ecfdf5', color: '#047857',
                  border: '1px solid #a7f3d0',
                  borderRadius: 20, padding: '2px 8px',
                  fontSize: 10.5, fontWeight: 700,
                }}>
                  ✓ Verified In Project
                </span>
              )}
            </div>
            <button
              onClick={() => onSelectNode(null)}
              style={{
                border: 'none', background: '#f1f5f9', color: '#64748b',
                width: 24, height: 24, borderRadius: '50%',
                cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>

          {/* Path */}
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
            padding: '8px 10px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>
              Repository Path
            </div>
            <div style={{
              fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: '#1e293b',
              wordBreak: 'break-all',
            }}>
              {selectedNode.path || 'Virtual Group Node'}
            </div>
          </div>

          {/* Summary */}
          {selectedNode.summary && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>
                Purpose in Project
              </div>
              <p style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.5, margin: 0 }}>
                {selectedNode.summary}
              </p>
            </div>
          )}

          {/* Architectural Step */}
          <div style={{
            background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8,
            padding: '6px 10px', fontSize: 11.5, color: '#92400e', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>🪜</span>
            <span>Positioned at <strong>Step {STEP_META[selectedNode.step]?.num || '01'}</strong> ({STEP_META[selectedNode.step]?.title || 'Architecture'})</span>
          </div>

          {/* GitHub Link */}
          {selectedNode.path && owner && repo && (
            <a
              href={`https://github.com/${owner}/${repo}/blob/${branch || 'main'}/${selectedNode.path}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block', textAlign: 'center',
                background: '#0f172a', color: '#ffffff',
                textDecoration: 'none', borderRadius: 8,
                padding: '8px 12px', fontSize: 12, fontWeight: 600,
              }}
            >
              Open File on GitHub ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

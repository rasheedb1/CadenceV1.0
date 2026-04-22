/* Business Case Deck — Additional components */

function fmtMoney(v, { compact = true, decimals = 1 } = {}) {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(decimals).replace(/\.0$/, '') + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(decimals).replace(/\.0$/, '') + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(v).toLocaleString();
}
function fmtNum(v) { return Math.round(v).toLocaleString(); }
function fmtPct(v, decimals = 1) { return v.toFixed(decimals) + '%'; }
function fmtBps(v) { return v.toFixed(0) + ' bps'; }

function KPI({ label, value, sub, style = {} }) {
  return (
    <div className="kpi" style={style}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function Waterfall({ data, width = 1100, height = 420, maxY }) {
  const max = maxY || Math.max(...cumMax(data));
  const colW = (width - 40) / data.length;
  let running = 0;
  return (
    <svg width={width} height={height} style={{ fontFamily: 'Titillium Web, sans-serif' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <g key={i}>
          <line x1={0} x2={width} y1={height - 70 - p * (height - 120)} y2={height - 70 - p * (height - 120)} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          <text x={width - 4} y={height - 70 - p * (height - 120) - 4} fontSize={10} fill="rgba(255,255,255,0.35)" textAnchor="end">{fmtMoney(p * max, { decimals: 0 })}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = 20 + i * colW + colW * 0.18;
        const w = colW * 0.64;
        const barY0 = height - 70;
        let top, bot, fill;
        if (d.kind === 'base' || d.kind === 'total') {
          top = barY0 - (d.value / max) * (height - 120); bot = barY0;
          fill = d.kind === 'total' ? 'url(#totalGrad)' : 'rgba(255,255,255,0.25)';
          running = d.value;
        } else if (d.kind === 'gain') {
          top = barY0 - ((running + d.value) / max) * (height - 120);
          bot = barY0 - (running / max) * (height - 120);
          fill = 'url(#gainGrad)'; running += d.value;
        } else {
          top = barY0 - (running / max) * (height - 120);
          bot = barY0 - ((running - d.value) / max) * (height - 120);
          fill = '#FF8A5B'; running -= d.value;
        }
        const barH = bot - top;
        return (
          <g key={i} className="anim-rise" style={{ animationDelay: (200 + i * 100) + 'ms' }}>
            <rect x={x} y={top} width={w} height={Math.max(1, barH)} fill={fill} rx={4} />
            <text x={x + w / 2} y={top - 8} fontSize={14} fontWeight={600} fill="#fff" textAnchor="middle">{d.kind === 'gain' ? '+' : ''}{fmtMoney(d.value, { decimals: 1 })}</text>
            <text x={x + w / 2} y={height - 46} fontSize={11} fill="rgba(255,255,255,0.55)" textAnchor="middle" style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
              <tspan x={x + w/2} dy={0}>{d.label.split('|')[0]}</tspan>
              {d.label.includes('|') && <tspan x={x + w/2} dy={14}>{d.label.split('|')[1]}</tspan>}
            </text>
          </g>
        );
      })}
      <defs>
        <linearGradient id="gainGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8C99FF" /><stop offset="100%" stopColor="#2A3BC9" /></linearGradient>
        <linearGradient id="totalGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#E0ED80" /><stop offset="100%" stopColor="#8C99FF" /></linearGradient>
      </defs>
    </svg>
  );
}
function cumMax(data) {
  let r = 0;
  return data.map(d => { if (d.kind === 'base' || d.kind === 'total') { r = d.value; return r; } if (d.kind === 'gain') { r += d.value; return r; } r -= d.value; return r; });
}

function LineChart({ series, width = 900, height = 360, yMax = 100, yMin = 80 }) {
  const pad = { l: 52, r: 20, t: 24, b: 40 };
  const plotW = width - pad.l - pad.r; const plotH = height - pad.t - pad.b;
  const xMax = Math.max(...series[0].points.map(p => p.x)); const xMin = Math.min(...series[0].points.map(p => p.x));
  const sx = (x) => pad.l + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y) => pad.t + plotH - ((y - yMin) / (yMax - yMin)) * plotH;
  return (
    <svg width={width} height={height} style={{ fontFamily: 'Titillium Web, sans-serif' }}>
      {[yMin, yMin + (yMax-yMin)*0.25, yMin + (yMax-yMin)*0.5, yMin + (yMax-yMin)*0.75, yMax].map((y, i) => (
        <g key={i}><line x1={pad.l} x2={width - pad.r} y1={sy(y)} y2={sy(y)} stroke="rgba(255,255,255,0.05)" /><text x={pad.l - 8} y={sy(y) + 4} fontSize={11} fill="rgba(255,255,255,0.4)" textAnchor="end">{y.toFixed(0)}%</text></g>
      ))}
      {series[0].points.map((p, i) => <text key={i} x={sx(p.x)} y={height - 14} fontSize={11} fill="rgba(255,255,255,0.4)" textAnchor="middle">{p.label || ''}</text>)}
      {series.map((s, i) => {
        const d = 'M ' + s.points.map(p => sx(p.x) + ' ' + sy(p.y)).join(' L ');
        return (
          <g key={i} className="draw-in" style={{ '--len': 1500 }}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2.4} strokeDasharray={s.dashed ? '6 6' : undefined} />
            {!s.dashed && s.points.map((p, j) => <circle key={j} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={s.color} />)}
          </g>
        );
      })}
      <g transform={'translate(' + pad.l + ', 12)'}>
        {series.map((s, i) => <g key={i} transform={'translate(' + (i * 170) + ', 0)'}><circle cx={6} cy={6} r={5} fill={s.color} /><text x={18} y={10} fontSize={12} fill="rgba(255,255,255,0.7)">{s.name}</text></g>)}
      </g>
    </svg>
  );
}

function WorldMap({ pins = [], style = {} }) {
  const project = (lat, lng) => ({ x: (lng + 180) / 360 * 1600, y: (90 - lat) / 180 * 800 });
  return (
    <div style={{ position: 'relative', width: 1600, height: 720, ...style }}>
      <svg width={1600} height={720} viewBox="0 0 1600 800">
        {generateWorldDots().map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={1.4} fill="rgba(255,255,255,0.14)" />)}
      </svg>
      {pins.map((p, i) => { const { x, y } = project(p.lat, p.lng); return <div key={i} className={'map-pin ' + (p.size === 'lg' ? 'lg' : '')} style={{ left: x - 5, top: y * (720/800) - 5, animationDelay: (i * 120) + 'ms' }} />; })}
    </div>
  );
}
function generateWorldDots() {
  const regions = [{ x0: 180, y0: 100, x1: 480, y1: 380, density: 0.35 },{ x0: 380, y0: 380, x1: 520, y1: 680, density: 0.32 },{ x0: 780, y0: 120, x1: 920, y1: 300, density: 0.42 },{ x0: 780, y0: 300, x1: 960, y1: 620, density: 0.30 },{ x0: 920, y0: 200, x1: 1050, y1: 380, density: 0.34 },{ x0: 1000, y0: 140, x1: 1340, y1: 460, density: 0.33 },{ x0: 1240, y0: 440, x1: 1420, y1: 640, density: 0.35 }];
  const dots = []; let seed = 1;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  regions.forEach(r => { const step = 12; for (let y = r.y0; y < r.y1; y += step) for (let x = r.x0; x < r.x1; x += step) if (rand() < r.density) dots.push({ x, y }); });
  return dots;
}

function FanOut({ providers = [], label = 'yuno orchestration', style = {} }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <div className="t-label" style={{ color: '#E0ED80', marginBottom: 12, textAlign: 'center' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {providers.map((p, i) => <div key={i} className="prov-pill anim-in" style={{ animationDelay: (180 + i * 60) + 'ms' }}>{p}</div>)}
      </div>
    </div>
  );
}

Object.assign(window, { fmtMoney, fmtNum, fmtPct, fmtBps, KPI, Waterfall, LineChart, WorldMap, FanOut });

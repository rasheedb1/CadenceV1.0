/* Business Case Deck — Additional components */

// Currency support. Each slide that receives `data` calls setBCCurrency(data.currency)
// at its top so fmtMoney picks up the right symbol/suffix without threading currency
// through ~135 callsites. No FX conversion — the AE enters all amounts in the chosen
// currency, and that's the unit displayed everywhere.
const CURRENCY_META = {
  USD: { symbol: '$',  showCode: false },
  MXN: { symbol: '$',  showCode: true  },
  BRL: { symbol: 'R$', showCode: true  },
  COP: { symbol: '$',  showCode: true  },
  ARS: { symbol: '$',  showCode: true  },
  CLP: { symbol: '$',  showCode: true  },
  PEN: { symbol: 'S/', showCode: true  },
  EUR: { symbol: '€',  showCode: false },
  GBP: { symbol: '£',  showCode: false },
};
let __bcCurrency = 'USD';
function setBCCurrency(c) { __bcCurrency = (c && CURRENCY_META[c]) ? c : 'USD'; }

// Drop trailing zeros after the decimal point, e.g. "7.50" -> "7.5", "8.00" -> "8".
// Integer strings like "100" are left alone.
function trimZeros(s) {
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

function fmtMoney(v, { compact = true, decimals = 1, currency } = {}) {
  const code = currency && CURRENCY_META[currency] ? currency : __bcCurrency;
  const meta = CURRENCY_META[code] || CURRENCY_META.USD;
  const sym = meta.symbol;
  const suffix = meta.showCode ? ' ' + code : '';
  let body;
  if (v >= 1e9) body = trimZeros((v / 1e9).toFixed(decimals)) + 'B';
  else if (v >= 1e6) body = trimZeros((v / 1e6).toFixed(decimals)) + 'M';
  else if (v >= 1e3) body = trimZeros((v / 1e3).toFixed(decimals)) + 'K';
  else body = Math.round(v).toLocaleString();
  return sym + body + suffix;
}
function fmtNum(v) { return Math.round(v).toLocaleString(); }
function fmtPct(v, decimals = 1) { return v.toFixed(decimals) + '%'; }
function fmtBps(v) { return v.toFixed(0) + ' bps'; }
// Per-tx rate. 3 decimals so adjacent tramos like 0.085 / 0.090 don't both
// display as 0.09. Trim a single trailing zero so 0.10 stays as 0.10 (not 0.100).
function fmtRate(v) {
  let s = Number(v).toFixed(3);
  if (s.endsWith('0')) s = s.slice(0, -1);
  return s;
}
// Sub-cent rate display for additional-services slide. Always 4 decimals
// (e.g. 0.0305) with currency symbol + ISO code suffix when ambiguous.
function fmtPriceRate(v) {
  const code = __bcCurrency;
  const meta = CURRENCY_META[code] || CURRENCY_META.USD;
  return meta.symbol + Number(v).toFixed(4) + (meta.showCode ? ' ' + code : '');
}

// Canonical list of additional services. Default prices from the published
// rate card (USD per approved tx). The form lets the AE toggle each one and
// override prices; the slide renders enabled ones with the price and disabled
// ones as "incluido en el pricing".
const ADDITIONAL_SERVICES = [
  { id: 'risk_conditions',          defaultPrice: 0.0305 },
  { id: 'external_3ds_api',         defaultPrice: 0.0207 },
  { id: 'monitoring_alerts',        defaultPrice: 0.0103 },
  { id: 'smart_routing',            defaultPrice: 0.0101 },
  { id: 'network_tokens',           defaultPrice: 0.0150 },
  { id: 'fraud_prevention_success', defaultPrice: 0.0202 },
  { id: '3ds_transaction',          defaultPrice: 0.0353 },
];

// i18n strings for the additional-services slide. Accessed via getServiceI18n(locale).
const SERVICE_I18N = {
  es: {
    title: 'Servicios adicionales',
    valuesIn: 'valores en',
    included: 'incluido en el pricing',
    colService: 'servicio',
    colDefinition: 'descripción',
    colPrice: 'precio unitario',
    items: {
      risk_conditions:          { name: 'Condiciones de riesgo',                    desc: 'Condiciones específicas bajo las cuales Yuno aplica un fee adicional por riesgo de fraude o comportamiento anómalo.' },
      external_3ds_api:         { name: 'Llamada API 3DS externo',                  desc: 'Solicitud a un servidor 3DS externo para autenticación, versionado o verificación, sin importar el resultado.' },
      monitoring_alerts:        { name: 'Monitoreo y alertas',                      desc: 'Monitoreo de transacciones con envío de alertas ante patrones sospechosos o anómalos.' },
      smart_routing:            { name: 'Smart Routing',                            desc: 'Tecnología Yuno que dirige las transacciones a la red más eficiente y rentable según parámetros operativos.' },
      network_tokens:           { name: 'Network Tokens',                           desc: 'Solicitudes de tokens generadas por Yuno para pagos a través de redes. Cada solicitud se cobra como una transacción independiente.' },
      fraud_prevention_success: { name: 'Transacción exitosa (Prevención de fraude)', desc: 'Llamada API exitosa a la plataforma antifraude de partners, sin importar si el motor de fraude acepta o rechaza la transacción.' },
      '3ds_transaction':        { name: 'Transacción 3DS',                          desc: 'Transacción de pago autenticada con protocolo 3-D Secure.' },
    },
  },
  en: {
    title: 'Additional services',
    valuesIn: 'values in',
    included: 'included in the pricing',
    colService: 'service',
    colDefinition: 'definition',
    colPrice: 'unit price',
    items: {
      risk_conditions:          { name: 'Risk conditions',                  desc: 'Specific conditions under which Yuno applies an additional fee due to fraud risk or anomalous behavior.' },
      external_3ds_api:         { name: 'External 3DS API call',            desc: 'Request made to an external 3DS server for authentication, versioning, or verification, regardless of result.' },
      monitoring_alerts:        { name: 'Monitoring and alerts',            desc: 'Transaction monitoring with alert sending upon suspicious or anomalous patterns.' },
      smart_routing:            { name: 'Smart Routing',                    desc: 'Yuno technology that directs transactions to the most efficient and cost-effective network based on operational parameters.' },
      network_tokens:           { name: 'Network Tokens',                   desc: 'Token requests generated by Yuno for payments through payment networks. Each request is charged as an independent transaction.' },
      fraud_prevention_success: { name: 'Successful transaction (fraud prevention)', desc: 'Successful API call to partners’ antifraud platform, regardless of whether the fraud engine accepts or rejects the transaction.' },
      '3ds_transaction':        { name: '3DS transaction',                  desc: 'Payment transaction authenticated with the 3-D Secure protocol.' },
    },
  },
  pt: {
    title: 'Serviços adicionais',
    valuesIn: 'valores em',
    included: 'incluído no pricing',
    colService: 'serviço',
    colDefinition: 'descrição',
    colPrice: 'preço unitário',
    items: {
      risk_conditions:          { name: 'Condições de risco',                  desc: 'Condições específicas sob as quais a Yuno aplica uma taxa adicional por risco de fraude ou comportamento anômalo.' },
      external_3ds_api:         { name: 'Chamada API 3DS externo',             desc: 'Solicitação a um servidor 3DS externo para autenticação, versionamento ou verificação, independentemente do resultado.' },
      monitoring_alerts:        { name: 'Monitoramento e alertas',             desc: 'Monitoramento de transações com envio de alertas sobre padrões suspeitos ou anômalos.' },
      smart_routing:            { name: 'Smart Routing',                       desc: 'Tecnologia Yuno que direciona transações à rede mais eficiente e econômica com base em parâmetros operacionais.' },
      network_tokens:           { name: 'Network Tokens',                      desc: 'Solicitações de token geradas pela Yuno para pagamentos através de redes. Cada solicitação é cobrada como uma transação independente.' },
      fraud_prevention_success: { name: 'Transação bem-sucedida (Prevenção de fraude)', desc: 'Chamada API bem-sucedida à plataforma antifraude de parceiros, independentemente de o motor de fraude aceitar ou rejeitar a transação.' },
      '3ds_transaction':        { name: 'Transação 3DS',                       desc: 'Transação de pagamento autenticada com protocolo 3-D Secure.' },
    },
  },
};
function getServiceI18n(locale) { return SERVICE_I18N[locale] || SERVICE_I18N.en; }

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

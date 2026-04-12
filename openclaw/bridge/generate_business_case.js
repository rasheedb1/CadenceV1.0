/**
 * Yuno Business Case Generator — module version for bridge integration.
 * Exports generateBusinessCase(config) that returns a Buffer of the PPTX.
 */
const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

let sharp;
try { sharp = require("sharp"); } catch { sharp = null; }

const fmt = (n) => { if (n >= 1e6) return `$${(n/1e6).toFixed(1)}M`; if (n >= 1e3) return `$${(n/1e3).toFixed(0)}K`; return `$${n.toFixed(0)}`; };
const fmtNum = (n) => n.toLocaleString("en-US");

const YUNO_BLUE = "3E4FE0", DEEP_BLUE = "1227AD", HARMONY_LILAC = "E8EAF5";
const UNITY_BLACK = "282A30", SECURITY_GRAY = "92959B";
const SOFT_BLUE = "BDC3F6", MID_GRAY = "616366", WHITE = "FFFFFF";
const FONT = "Titillium Web";
const mkShadow = () => ({ type: "outer", color: "000000", blur: 10, offset: 3, angle: 135, opacity: 0.08 });

async function createLogos(clientName) {
  const logoDir = path.join("/tmp", "bc_logos_" + Date.now());
  fs.mkdirSync(logoDir, { recursive: true });
  const clientSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="16" fill="white"/><text x="60" y="65" font-family="Arial" font-weight="900" font-size="${clientName.length > 8 ? 14 : 22}" fill="#333" text-anchor="middle">${clientName}</text></svg>`;
  const yunoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="16" fill="#3E4FE0"/><text x="60" y="55" font-family="Arial" font-weight="700" font-size="14" fill="white" text-anchor="middle" letter-spacing="4">yuno</text></svg>`;
  let clientLogoPath, yunoLogoPath;
  if (sharp) {
    clientLogoPath = path.join(logoDir, "client.png");
    yunoLogoPath = path.join(logoDir, "yuno.png");
    await sharp(Buffer.from(clientSvg)).png().toFile(clientLogoPath);
    await sharp(Buffer.from(yunoSvg)).png().toFile(yunoLogoPath);
  }
  return { clientLogoPath, yunoLogoPath, logoDir };
}

async function generateBusinessCase(cfg) {
  const clientName = cfg.clientName;
  const countries = cfg.countries || [];
  const ticketPromedio = cfg.ticketPromedio;
  const totalTxnMes = cfg.totalTxnMes;
  const totalTPVMensual = cfg.totalTPVMensual || totalTxnMes * ticketPromedio;
  const mdrActual = cfg.mdrActual;
  const mdrNuevo = cfg.mdrNuevo;
  const ahorroMDRMensual = (mdrActual - mdrNuevo) * totalTPVMensual;
  const aprobacionActual = cfg.aprobacionActual;
  const aprobacionNueva = cfg.aprobacionNueva;
  const deltaAprobacion = aprobacionNueva - aprobacionActual;
  const aumentoTPV = deltaAprobacion * totalTPVMensual;
  const margenProducto = cfg.margenProducto || 0;
  const aumentoRevenue = margenProducto > 0 ? aumentoTPV * margenProducto : aumentoTPV;
  const ahorroConciliacion = cfg.ahorroConciliacion || 5000;
  const ahorroOperativo = cfg.ahorroOperativo || 5000;
  const totalMensual = aumentoRevenue + ahorroMDRMensual + ahorroConciliacion + ahorroOperativo;
  const pricingType = cfg.pricingType || "flat";
  const flatPrice = cfg.flatPrice || 0.10;
  const tranches = cfg.tranches || [];
  const minimoTransaccional = cfg.minimoTransaccional || "segun acuerdo";
  const saasFee = cfg.saasFee || 0;
  const propuestaValidaHasta = cfg.propuestaValidaHasta || "segun acuerdo";

  const { clientLogoPath, yunoLogoPath, logoDir } = await createLogos(clientName);
  const hasLogos = !!clientLogoPath && fs.existsSync(clientLogoPath);

  const approvalLabel = margenProducto > 0
    ? `Aumento Aprobacion\n(${(margenProducto*100).toFixed(0)}% margen)`
    : "Aumento Aprobacion\n(TPV adicional)";
  const approvalDetail = margenProducto > 0
    ? `+${(deltaAprobacion*100).toFixed(0)}% = ${fmt(aumentoTPV)} TPV x ${(margenProducto*100).toFixed(0)}%`
    : `+${(deltaAprobacion*100).toFixed(0)}% = ${fmt(aumentoTPV)} TPV/mes`;

  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Chief AI - Yuno";
  pres.title = `Business Case - ${clientName} - Yuno`;

  // S1: COVER
  let s1 = pres.addSlide(); s1.background = { color: UNITY_BLACK };
  s1.addShape(pres.shapes.RECTANGLE, { x: 4, y: -1, w: 7, h: 7.6, fill: { color: YUNO_BLUE, transparency: 78 } });
  s1.addText("yuno", { x: 0.6, y: 0.4, w: 2, h: 0.35, fontSize: 22, fontFace: FONT, color: WHITE, bold: true });
  s1.addText("impulsando el flujo de dinero\nglobal sin fricciones", { x: 0.6, y: 1.4, w: 8.5, h: 1.8, fontSize: 40, fontFace: FONT, color: WHITE });
  if (hasLogos) { s1.addImage({ path: clientLogoPath, x: 3.0, y: 3.95, w: 0.85, h: 0.85 }); s1.addImage({ path: yunoLogoPath, x: 4.1, y: 3.95, w: 0.85, h: 0.85 }); }
  s1.addText(`Hecho para: ${clientName}`, { x: 6, y: 5.15, w: 3.5, h: 0.3, fontSize: 9, fontFace: FONT, color: SECURITY_GRAY, align: "right" });

  // S2: SOLUTION
  let s2 = pres.addSlide(); s2.background = { color: HARMONY_LILAC };
  s2.addText("yuno impulsa tu equipo de pagos global", { x: 0.6, y: 0.4, w: 7, h: 0.55, fontSize: 26, fontFace: FONT, color: UNITY_BLACK });
  [["PROCESAMIENTO\nY ORQUESTACION",["Orquestacion multi-proveedor","Rutas inteligentes"]],["CHECKOUT Y\nMANEJO DE PAGOS",["Checkout personalizado","Suscripciones"]],["SEGURIDAD Y\nCONTROL DE FRAUDE",["Network tokens","3DS"]],["METRICAS Y\nOPERACIONES",["Payout","Reconciliacion","Analitica"]]].forEach(([title, items], i) => {
    const px = 0.4 + i * 2.27;
    s2.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: px, y: 1.5, w: 2.15, h: 0.55, fill: { color: YUNO_BLUE }, rectRadius: 0.06 });
    s2.addText(title, { x: px, y: 1.5, w: 2.15, h: 0.55, fontSize: 8, fontFace: FONT, color: WHITE, bold: true, align: "center", valign: "middle" });
    items.forEach((item, j) => { s2.addText("• " + item, { x: px + 0.1, y: 2.15 + j * 0.35, w: 2, h: 0.3, fontSize: 8, fontFace: FONT, color: UNITY_BLACK }); });
  });

  // S3: BUSINESS CASE TEXT
  let s3 = pres.addSlide(); s3.background = { color: UNITY_BLACK };
  s3.addShape(pres.shapes.RECTANGLE, { x: 5, y: -0.5, w: 6, h: 6.6, fill: { color: YUNO_BLUE, transparency: 80 } });
  s3.addText(`caso de negocios para ${clientName.toLowerCase()}`, { x: 0.6, y: 0.4, w: 8.8, h: 0.7, fontSize: 30, fontFace: FONT, color: WHITE, align: "center" });
  s3.addText(`${clientName} procesa ~${fmtNum(totalTxnMes)} txns/mes con ticket $${ticketPromedio} USD = ${fmt(totalTPVMensual)} TPV/mes.\n\nMDR ${(mdrActual*100).toFixed(1)}% a ${(mdrNuevo*100).toFixed(1)}% = ahorro ${fmt(ahorroMDRMensual)}/mes.\n\nAprobacion ${(aprobacionActual*100).toFixed(0)}% a ${(aprobacionNueva*100).toFixed(0)}% = +${fmt(aumentoRevenue)}/mes.`, { x: 0.6, y: 1.4, w: 8.8, h: 3.5, fontSize: 14, fontFace: FONT, color: SOFT_BLUE, lineSpacingMultiple: 1.4 });

  // S4: VOLUME TABLE
  let s4 = pres.addSlide(); s4.background = { color: HARMONY_LILAC };
  s4.addText("volumen procesado por pais", { x: 0.5, y: 0.3, w: 7, h: 0.5, fontSize: 24, fontFace: FONT, color: UNITY_BLACK });
  const tH = { fill: { color: YUNO_BLUE }, color: WHITE, bold: true, fontSize: 9, fontFace: FONT, align: "center", valign: "middle" };
  const tC = { fontSize: 9.5, fontFace: FONT, color: UNITY_BLACK, align: "right", valign: "middle" };
  const tL = { ...tC, align: "left" };
  const rows = [[{ text: "PAIS", options: { ...tH, align: "left" } },{ text: "TXNS/MES", options: tH },{ text: "TPV/MES", options: tH },{ text: "MDR", options: tH },{ text: "COSTO/MES", options: tH }]];
  countries.forEach((c, i) => { const tpv = c.txnPerMonth * ticketPromedio; const rf = i % 2 === 0 ? { fill: { color: WHITE } } : { fill: { color: HARMONY_LILAC } }; rows.push([{ text: c.country, options: { ...tL, ...rf } },{ text: fmtNum(c.txnPerMonth), options: { ...tC, ...rf } },{ text: `$${fmtNum(tpv)}`, options: { ...tC, ...rf } },{ text: `${(mdrActual*100).toFixed(1)}%`, options: { ...tC, ...rf } },{ text: `$${fmtNum(Math.round(tpv * mdrActual))}`, options: { ...tC, ...rf } }]); });
  rows.push([{ text: "TOTAL", options: { ...tL, bold: true, fill: { color: YUNO_BLUE }, color: WHITE } },{ text: fmtNum(totalTxnMes), options: { ...tC, bold: true, fill: { color: YUNO_BLUE }, color: WHITE } },{ text: `$${fmtNum(totalTPVMensual)}`, options: { ...tC, bold: true, fill: { color: YUNO_BLUE }, color: WHITE } },{ text: `${(mdrActual*100).toFixed(1)}%`, options: { ...tC, bold: true, fill: { color: YUNO_BLUE }, color: WHITE } },{ text: `$${fmtNum(Math.round(totalTPVMensual * mdrActual))}`, options: { ...tC, bold: true, fill: { color: YUNO_BLUE }, color: WHITE } }]);
  s4.addTable(rows, { x: 0.5, y: 1.0, w: 9, colW: [1.5, 2, 2, 1.3, 2.2], border: { pt: 0.3, color: SOFT_BLUE }, rowH: rows.map(() => 0.4) });

  // S5: EFECTO YUNO
  let s5 = pres.addSlide(); s5.background = { color: HARMONY_LILAC };
  s5.addText("efecto yuno", { x: 0.5, y: 0.3, w: 7, h: 0.55, fontSize: 26, fontFace: FONT, color: UNITY_BLACK });
  const eH = { fill: { color: YUNO_BLUE }, color: WHITE, bold: true, fontSize: 12, fontFace: FONT, align: "center", valign: "middle" };
  const eC = { fontSize: 12, fontFace: FONT, color: UNITY_BLACK, valign: "middle" };
  s5.addTable([[{ text: "CONCEPTO", options: { ...eH, align: "left" } },{ text: "DETALLE", options: eH },{ text: "AHORRO/MES", options: eH }],[{ text: approvalLabel, options: { ...eC, fill: { color: WHITE } } },{ text: approvalDetail, options: { ...eC, fill: { color: WHITE }, align: "center", fontSize: 10 } },{ text: fmt(aumentoRevenue), options: { ...eC, fill: { color: WHITE }, align: "center", bold: true, color: YUNO_BLUE } }],[{ text: "Reduccion MDR", options: { ...eC, fill: { color: HARMONY_LILAC } } },{ text: `${(mdrActual*100).toFixed(1)}% a ${(mdrNuevo*100).toFixed(1)}%`, options: { ...eC, fill: { color: HARMONY_LILAC }, align: "center" } },{ text: fmt(ahorroMDRMensual), options: { ...eC, fill: { color: HARMONY_LILAC }, align: "center", bold: true, color: YUNO_BLUE } }],[{ text: "Conciliacion", options: { ...eC, fill: { color: WHITE } } },{ text: "Fijo", options: { ...eC, fill: { color: WHITE }, align: "center" } },{ text: `$${fmtNum(ahorroConciliacion)}`, options: { ...eC, fill: { color: WHITE }, align: "center", bold: true, color: YUNO_BLUE } }],[{ text: "Ahorro Operativo", options: { ...eC, fill: { color: HARMONY_LILAC } } },{ text: "Fijo", options: { ...eC, fill: { color: HARMONY_LILAC }, align: "center" } },{ text: `$${fmtNum(ahorroOperativo)}`, options: { ...eC, fill: { color: HARMONY_LILAC }, align: "center", bold: true, color: YUNO_BLUE } }]], { x: 0.5, y: 1.1, w: 9, colW: [3.5, 2.5, 3], border: { pt: 0.3, color: SOFT_BLUE }, rowH: [0.45,0.45,0.45,0.45,0.45] });
  s5.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 3, y: 3.85, w: 4, h: 0.65, fill: { color: YUNO_BLUE }, rectRadius: 0.08 });
  s5.addText(`total impacto mensual: ${fmt(totalMensual)}`, { x: 3, y: 3.85, w: 4, h: 0.65, fontSize: 16, fontFace: FONT, color: WHITE, bold: true, align: "center", valign: "middle" });

  // S6: IMPACT SUMMARY
  let s6 = pres.addSlide(); s6.background = { color: UNITY_BLACK };
  s6.addText("impacto economico estimado (USD)", { x: 0.6, y: 0.4, w: 8.8, h: 0.5, fontSize: 22, fontFace: FONT, color: WHITE });
  [[`AUMENTO APROBACION`, `${fmt(aumentoRevenue)}/MES`],[`REDUCCION MDR`, `${fmt(ahorroMDRMensual)}/MES`],[`AHORRO OPERATIVO`, `$${(ahorroOperativo/1000).toFixed(0)}K/MES`],[`AHORRO CONCILIACION`, `$${(ahorroConciliacion/1000).toFixed(0)}K/MES`]].forEach(([label, value], i) => {
    const mx = 0.6 + (i % 2) * 4.6, my = 1.2 + Math.floor(i / 2) * 1.5;
    s6.addText(label, { x: mx, y: my, w: 4, h: 0.3, fontSize: 10, fontFace: FONT, color: SECURITY_GRAY });
    s6.addText(value, { x: mx, y: my + 0.35, w: 4, h: 0.6, fontSize: 28, fontFace: FONT, color: YUNO_BLUE, bold: true });
  });
  s6.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 3, y: 4.3, w: 4, h: 0.65, fill: { color: YUNO_BLUE }, rectRadius: 0.08 });
  s6.addText(`${fmt(totalMensual)}/MES`, { x: 3, y: 4.3, w: 4, h: 0.65, fontSize: 24, fontFace: FONT, color: WHITE, bold: true, align: "center", valign: "middle" });

  // S7: COMMERCIAL PROPOSAL
  let s7 = pres.addSlide(); s7.background = { color: HARMONY_LILAC };
  s7.addText("propuesta comercial", { x: 0.6, y: 0.35, w: 5, h: 0.6, fontSize: 28, fontFace: FONT, color: UNITY_BLACK });
  [`Minimo transaccional: ${minimoTransaccional}`, saasFee > 0 ? `Fee SaaS: $${fmtNum(saasFee)}/mes` : "Sin fee SaaS", "KAM, TAM, 3DS, Conciliacion incluida", `Valido hasta ${propuestaValidaHasta}`].forEach((t, i) => {
    s7.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 1.2 + i * 0.72, w: 4.3, h: 0.6, fill: { color: WHITE }, rectRadius: 0.08, shadow: mkShadow() });
    s7.addText(`0${i+1}. ${t}`, { x: 0.7, y: 1.2 + i * 0.72, w: 3.9, h: 0.6, fontSize: 11, fontFace: FONT, color: UNITY_BLACK, valign: "middle" });
  });
  s7.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.2, y: 0.95, w: 4.4, h: 3.5, fill: { color: WHITE }, rectRadius: 0.12, shadow: mkShadow() });
  s7.addText("PRECIO POR TXN APROBADA", { x: 5.4, y: 1.1, w: 4, h: 0.4, fontSize: 11, fontFace: FONT, color: UNITY_BLACK, bold: true, align: "center" });
  if (pricingType === "flat") {
    s7.addText(`$${flatPrice.toFixed(2)}`, { x: 5.4, y: 2.0, w: 4, h: 1.2, fontSize: 72, fontFace: FONT, color: YUNO_BLUE, bold: true, align: "center", valign: "middle" });
  } else if (tranches.length > 0) {
    const trH2 = { fill: { color: YUNO_BLUE }, color: WHITE, bold: true, fontSize: 9.5, fontFace: FONT, align: "center", valign: "middle" };
    const trC2 = { fontSize: 11, fontFace: FONT, color: UNITY_BLACK, align: "center", valign: "middle" };
    const trR2 = [[{ text: "TRANCHE", options: trH2 },{ text: "RANGO", options: trH2 },{ text: "PRECIO", options: trH2 }]];
    tranches.forEach((t, i) => { const rf = i % 2 === 0 ? { fill: { color: HARMONY_LILAC } } : { fill: { color: WHITE } }; trR2.push([{ text: t.name, options: { ...trC2, ...rf, bold: true } },{ text: t.range, options: { ...trC2, ...rf } },{ text: `$${t.price < 0.1 ? t.price.toFixed(4) : t.price.toFixed(2)}`, options: { ...trC2, ...rf, bold: true, color: YUNO_BLUE } }]); });
    s7.addTable(trR2, { x: 5.4, y: 1.6, w: 4, colW: [1.0, 1.5, 1.5], border: { pt: 0.3, color: SOFT_BLUE }, rowH: Array(trR2.length).fill(0.4) });
  }

  // S8: CLOSING
  let s8 = pres.addSlide(); s8.background = { color: UNITY_BLACK };
  s8.addShape(pres.shapes.RECTANGLE, { x: 5, y: -0.5, w: 6, h: 6.6, fill: { color: YUNO_BLUE, transparency: 80 } });
  s8.addText("yuno", { x: 0.6, y: 0.4, w: 2, h: 0.35, fontSize: 22, fontFace: FONT, color: WHITE, bold: true });
  s8.addText("crezcamos juntos", { x: 0.6, y: 1.8, w: 8, h: 1.2, fontSize: 48, fontFace: FONT, color: WHITE });
  s8.addText("agendemos un 1:1 para mas detalles", { x: 0.6, y: 3.1, w: 8, h: 0.4, fontSize: 16, fontFace: FONT, color: SECURITY_GRAY });

  const buffer = await pres.write({ outputType: "nodebuffer" });
  try { fs.rmSync(logoDir, { recursive: true }); } catch {}

  return { buffer, summary: { clientName, totalTPVMensual, totalTxnMes, ahorroMDRMensual, aumentoRevenue, totalMensual, slides: 8 } };
}

module.exports = { generateBusinessCase };

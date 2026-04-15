/**
 * Yuno Business Case Generator — 16-slide branded PPTX.
 * Exports generateBusinessCase(config) that returns { buffer, summary }.
 *
 * Slides: Cover, Solution, Pain Points, Business Case Text, Divider,
 * Volume Table, Divider, Efecto Yuno, Dev Cost, Impact Summary,
 * Commercial Proposal, Divider, 3x Case Studies, Closing.
 */
const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

let sharp;
try { sharp = require("sharp"); } catch { sharp = null; }

// ============ HELPERS ============
const fmt = (n) => { if (n >= 1e6) return `$${(n/1e6).toFixed(1)}M`; if (n >= 1e3) return `$${(n/1e3).toFixed(0)}K`; return `$${n.toFixed(0)}`; };
const fmtNum = (n) => n.toLocaleString("en-US");

// ============ BRAND ============
const YUNO_BLUE = "3E4FE0", DEEP_BLUE = "1227AD", HARMONY_LILAC = "E8EAF5";
const UNITY_BLACK = "282A30", SECURITY_GRAY = "92959B", LIGHT_BLUE = "7C89EF";
const SOFT_BLUE = "BDC3F6", MID_BLUE = "5967E4", MID_GRAY = "616366", WHITE = "FFFFFF";
const FONT = "Titillium Web";
const mkShadow = () => ({ type: "outer", color: "000000", blur: 10, offset: 3, angle: 135, opacity: 0.08 });

async function createLogos(clientName) {
  const logoDir = path.join("/tmp", "bc_logos_" + Date.now());
  fs.mkdirSync(logoDir, { recursive: true });
  const clientSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="16" fill="white"/><text x="60" y="65" font-family="Arial" font-weight="900" font-size="${clientName.length > 8 ? 14 : 22}" fill="#333" text-anchor="middle">${clientName}</text></svg>`;
  const yunoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="16" fill="#3E4FE0"/><text x="60" y="48" font-family="Arial" font-weight="700" font-size="14" fill="white" text-anchor="middle" letter-spacing="4">yuno</text><g fill="white" opacity="0.9"><circle cx="35" cy="70" r="3"/><circle cx="48" cy="70" r="3"/><circle cx="61" cy="70" r="3"/><circle cx="74" cy="70" r="3"/><circle cx="87" cy="70" r="3"/><circle cx="35" cy="83" r="3"/><circle cx="48" cy="83" r="3"/><circle cx="61" cy="83" r="3"/><circle cx="74" cy="83" r="3"/><circle cx="87" cy="83" r="3"/><circle cx="35" cy="96" r="3"/><circle cx="48" cy="96" r="3"/><circle cx="61" cy="96" r="3"/><circle cx="74" cy="96" r="3"/><circle cx="87" cy="96" r="3"/></g></svg>`;
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
  const totalTPVAnual = totalTPVMensual * 12;
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

  // Approval label logic
  const approvalLabel = margenProducto > 0
    ? `Aumento de Aprobacion\n(${(margenProducto*100).toFixed(0)}% margen sobre TPV)`
    : "Aumento de Aprobacion\n(TPV adicional)";
  const approvalDetail = margenProducto > 0
    ? `+${(deltaAprobacion*100).toFixed(0)}% = ${fmt(aumentoTPV)} TPV\nx ${(margenProducto*100).toFixed(0)}% margen`
    : `+${(deltaAprobacion*100).toFixed(0)}% aprobacion\n= ${fmt(aumentoTPV)} TPV/mes`;
  const approvalMetricLabel = margenProducto > 0
    ? `AUMENTO APROBACION\n(REVENUE ${(margenProducto*100).toFixed(0)}% MARGEN)`
    : "AUMENTO APROBACION\n(TPV ADICIONAL)";
  const s4ApprovalText = margenProducto > 0
    ? `Siendo conservadores, con el ruteo inteligente se estima un aumento del ${(deltaAprobacion*100).toFixed(0)}% en aprobacion (de ${(aprobacionActual*100).toFixed(0)}% a ${(aprobacionNueva*100).toFixed(0)}%), generando +${fmt(aumentoTPV)} USD/mes en TPV. Considerando un margen del ${(margenProducto*100).toFixed(0)}% (referencia industria), el impacto real en revenue seria de ${fmt(aumentoRevenue)} USD/mes.`
    : `Siendo conservadores, con el ruteo inteligente se estima un aumento del ${(deltaAprobacion*100).toFixed(0)}% en aprobacion (de ${(aprobacionActual*100).toFixed(0)}% a ${(aprobacionNueva*100).toFixed(0)}%), generando un aumento de TPV estimado de +${fmt(aumentoTPV)} USD/mes en ingresos adicionales.`;

  // ============ BUILD PPTX ============
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Rasheed Bayter";
  pres.title = `Business Case - ${clientName} - Yuno`;

  // --- SLIDE 1: COVER ---
  let s1 = pres.addSlide();
  s1.background = { color: UNITY_BLACK };
  s1.addShape(pres.shapes.RECTANGLE, { x: 4, y: -1, w: 7, h: 7.6, fill: { color: YUNO_BLUE, transparency: 78 } });
  s1.addShape(pres.shapes.RECTANGLE, { x: 7, y: -0.5, w: 4, h: 6.6, fill: { color: DEEP_BLUE, transparency: 60 } });
  s1.addText("yuno", { x: 0.6, y: 0.4, w: 2, h: 0.35, fontSize: 22, fontFace: FONT, color: WHITE, bold: true });
  s1.addText("W W W . Y . U N O", { x: 7.2, y: 0.4, w: 2.3, h: 0.35, fontSize: 9, fontFace: FONT, color: SECURITY_GRAY, align: "right", charSpacing: 2 });
  s1.addText("impulsando el flujo de dinero\nglobal sin fricciones", { x: 0.6, y: 1.4, w: 8.5, h: 1.8, fontSize: 40, fontFace: FONT, color: WHITE, lineSpacingMultiple: 1.05 });
  s1.addText("ORQUESTACION E INFRAESTRUCTURA DE PAGOS A ESCALA MUNDIAL", { x: 0.6, y: 3.3, w: 8, h: 0.4, fontSize: 11, fontFace: FONT, color: SECURITY_GRAY, charSpacing: 1.5 });
  if (hasLogos) {
    s1.addImage({ path: clientLogoPath, x: 3.0, y: 3.95, w: 0.85, h: 0.85 });
    s1.addImage({ path: yunoLogoPath, x: 4.1, y: 3.95, w: 0.85, h: 0.85 });
  }
  s1.addText("Presentado por:", { x: 0.6, y: 4.05, w: 2.2, h: 0.25, fontSize: 10, fontFace: FONT, color: SECURITY_GRAY });
  s1.addText("Rasheed Bayter", { x: 0.6, y: 4.3, w: 2.2, h: 0.3, fontSize: 13, fontFace: FONT, color: WHITE, bold: true });
  s1.addShape(pres.shapes.LINE, { x: 0.6, y: 5.05, w: 8.8, h: 0, line: { color: MID_GRAY, width: 0.4 } });
  s1.addText([{ text: "1,000+ ", options: { color: YUNO_BLUE, bold: true } },{ text: "Metodos de pago   /   ", options: { color: SECURITY_GRAY } },{ text: "180+ ", options: { color: YUNO_BLUE, bold: true } },{ text: "Monedas   /   ", options: { color: SECURITY_GRAY } },{ text: "194+ ", options: { color: YUNO_BLUE, bold: true } },{ text: "Paises", options: { color: SECURITY_GRAY } }], { x: 0.6, y: 5.15, w: 5.5, h: 0.3, fontSize: 9, fontFace: FONT });
  s1.addText(`Hecho estrategicamente para: ${clientName}`, { x: 6, y: 5.15, w: 3.5, h: 0.3, fontSize: 9, fontFace: FONT, color: SECURITY_GRAY, align: "right" });

  // --- SLIDE 2: SOLUTION DIAGRAM ---
  let s2 = pres.addSlide();
  s2.background = { color: HARMONY_LILAC };
  s2.addText("yuno impulsa tu equipo de pagos global", { x: 0.6, y: 0.4, w: 7, h: 0.55, fontSize: 26, fontFace: FONT, color: UNITY_BLACK, margin: 0 });
  s2.addText("SOLUCION", { x: 8.2, y: 0.4, w: 1.3, h: 0.35, fontSize: 10, fontFace: FONT, color: SECURITY_GRAY, align: "right" });
  if (hasLogos) {
    s2.addImage({ path: clientLogoPath, x: 4.55, y: 1.15, w: 0.6, h: 0.6 });
    s2.addShape(pres.shapes.LINE, { x: 4.85, y: 1.8, w: 0, h: 0.25, line: { color: YUNO_BLUE, width: 2 } });
    s2.addImage({ path: yunoLogoPath, x: 4.55, y: 2.1, w: 0.6, h: 0.6 });
  }
  const pillars = [
    { title: "PROCESAMIENTO DE PAGO\nY ORQUESTACION", items: [["Orquestacion","Multiples proveedores a nivel global"],["Rutas inteligentes","Optimizar rutas de pago automaticamente"]] },
    { title: "CHECKOUT Y MANEJO\nDE PAGOS", items: [["Checkout personalizado","Metodos de pago relevantes y locales"],["Manejo de suscripciones","Pagos recurrentes sin esfuerzo"]] },
    { title: "SEGURIDAD Y CONTROL\nDE FRAUDE", items: [["Network tokens","Proteger y actualizar tarjetas"],["Autenticacion 3DS","Reforzar seguridad, reducir fraude"]] },
    { title: "METRICAS\nY OPERACIONES", items: [["Payout","Centralizar transacciones globalmente"],["Reconciliacion","Unificar el manejo de pagos"],["Analitica","Decisiones basadas en datos"]] },
  ];
  const pw = 2.15, pgap = 0.12, pStartX = 0.4, pY = 2.95;
  pillars.forEach((p, i) => {
    const px = pStartX + i * (pw + pgap);
    s2.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: px, y: pY, w: pw, h: 0.55, fill: { color: YUNO_BLUE }, rectRadius: 0.06 });
    s2.addText(p.title, { x: px, y: pY, w: pw, h: 0.55, fontSize: 8, fontFace: FONT, color: WHITE, bold: true, align: "center", valign: "middle", margin: 0 });
    let iy = pY + 0.65;
    p.items.forEach(([h, d]) => {
      s2.addText([{ text: h, options: { bold: true, fontSize: 8.5, color: UNITY_BLACK, breakLine: true } },{ text: d, options: { fontSize: 7.5, color: SECURITY_GRAY } }], { x: px + 0.08, y: iy, w: pw - 0.16, h: 0.48, fontFace: FONT, valign: "top" });
      iy += 0.48;
    });
  });
  s2.addText("impulsar la eficiencia, simplificar los pagos y escalar a nivel global.", { x: 1, y: 5.15, w: 8, h: 0.3, fontSize: 10, fontFace: FONT, color: SECURITY_GRAY, align: "center", italic: true });

  // --- SLIDE 3: PAIN POINTS ---
  let s3 = pres.addSlide();
  s3.background = { color: HARMONY_LILAC };
  s3.addText("ANALISIS", { x: 8.2, y: 0.4, w: 1.3, h: 0.3, fontSize: 10, fontFace: FONT, color: SECURITY_GRAY, align: "right" });
  s3.addText("analizamos en profundidad\nsus operaciones de pago\ny los retos que presentan", { x: 0.6, y: 0.4, w: 4.5, h: 2.2, fontSize: 28, fontFace: FONT, color: UNITY_BLACK, lineSpacingMultiple: 1.0 });
  const retos = [
    { title: "Rutas sin fallback", desc: "entre proveedores, generando perdida de ventas ante caidas del procesador primario" },
    { title: "Multiples dashboards", desc: "al tener varios proveedores, cada uno con su propio panel y reporteria independiente" },
    { title: "Centralizacion necesaria", desc: "podrian unificar todos sus proveedores bajo una sola API y un solo dashboard" },
    { title: "Conciliacion dispersa", desc: "con muchos archivos de liquidacion de diferentes adquirentes y proveedores" },
    { title: "Cambio de rutas agil", desc: "necesidad de modificar rutas con solo clicks y no deploys desde el backend" },
  ];
  retos.forEach((r, i) => {
    const ry = 0.6 + i * 0.85;
    s3.addShape(pres.shapes.OVAL, { x: 5.15, y: ry + 0.08, w: 0.12, h: 0.12, fill: { color: YUNO_BLUE } });
    s3.addText([{ text: r.title + " ", options: { bold: true, color: UNITY_BLACK, fontSize: 12 } },{ text: r.desc, options: { color: MID_GRAY, fontSize: 11 } }], { x: 5.4, y: ry, w: 4.1, h: 0.75, fontFace: FONT, valign: "top" });
  });

  // --- SLIDE 4: BUSINESS CASE TEXT ---
  let s4 = pres.addSlide();
  s4.background = { color: UNITY_BLACK };
  s4.addShape(pres.shapes.RECTANGLE, { x: 5, y: -0.5, w: 6, h: 6.6, fill: { color: YUNO_BLUE, transparency: 80 } });
  s4.addText(`caso de negocios para ${clientName.toLowerCase()}`, { x: 0.6, y: 0.4, w: 8.8, h: 0.7, fontSize: 30, fontFace: FONT, color: WHITE, align: "center" });
  s4.addText("OPTIMIZACION DE COSTOS POR COMISIONES", { x: 0.6, y: 1.3, w: 8.8, h: 0.3, fontSize: 10, fontFace: FONT, color: SOFT_BLUE, charSpacing: 1.5 });
  s4.addText(`Actualmente ${clientName} procesa un estimado de ${fmtNum(totalTxnMes)} transacciones al mes con un ticket promedio de $${ticketPromedio} USD, equivalente a $${(totalTPVMensual/1e6).toFixed(1)}M USD/mes en TPV. Con un MDR promedio del ${(mdrActual*100).toFixed(1)}%, mediante la optimizacion de rutas a traves de Yuno se podria reducir a ${(mdrNuevo*100).toFixed(1)}%, generando un ahorro de ${fmt(ahorroMDRMensual)} USD/mes (${fmt(ahorroMDRMensual*12)}/ano).`, { x: 0.6, y: 1.65, w: 8.8, h: 0.85, fontSize: 11, fontFace: FONT, color: SOFT_BLUE, lineSpacingMultiple: 1.3 });
  s4.addText("AUMENTO DE APROBACION", { x: 0.6, y: 2.65, w: 8.8, h: 0.3, fontSize: 10, fontFace: FONT, color: SOFT_BLUE, charSpacing: 1.5 });
  s4.addText(s4ApprovalText, { x: 0.6, y: 3.0, w: 8.8, h: 0.8, fontSize: 11, fontFace: FONT, color: SOFT_BLUE, lineSpacingMultiple: 1.3 });
  s4.addText(`El valor conciliatorio entre adquirentes se optimiza: ahorro mensual de $${fmtNum(ahorroConciliacion)} USD. La activacion de nuevas integraciones genera un ahorro proyectado de $186,570 USD considerando 3 meses por integracion y el valor-hora de los equipos involucrados.`, { x: 0.6, y: 4.0, w: 8.8, h: 0.8, fontSize: 11, fontFace: FONT, color: SOFT_BLUE, lineSpacingMultiple: 1.3 });

  // --- SLIDE 5: DIVIDER ---
  let s5 = pres.addSlide();
  s5.background = { color: UNITY_BLACK };
  s5.addShape(pres.shapes.RECTANGLE, { x: 3.5, y: 0, w: 6.5, h: 5.625, fill: { color: YUNO_BLUE, transparency: 82 } });
  s5.addText("escenario actual", { x: 1, y: 1.8, w: 8, h: 2, fontSize: 44, fontFace: FONT, color: WHITE, align: "center", valign: "middle" });

  // --- SLIDE 6: VOLUME TABLE ---
  let s6 = pres.addSlide();
  s6.background = { color: HARMONY_LILAC };
  s6.addText("volumen procesado por pais", { x: 0.5, y: 0.3, w: 7, h: 0.5, fontSize: 24, fontFace: FONT, color: UNITY_BLACK, margin: 0 });
  s6.addText("CASO DE NEGOCIO", { x: 7.5, y: 0.3, w: 2, h: 0.35, fontSize: 10, fontFace: FONT, color: SECURITY_GRAY, align: "right" });
  const tHdr = { fill: { color: YUNO_BLUE }, color: WHITE, bold: true, fontSize: 9, fontFace: FONT, align: "center", valign: "middle" };
  const tCell = { fontSize: 9.5, fontFace: FONT, color: UNITY_BLACK, align: "right", valign: "middle" };
  const tCellL = { fontSize: 9.5, fontFace: FONT, color: UNITY_BLACK, align: "left", valign: "middle" };
  const tRows = [[{ text: "PAIS", options: { ...tHdr, align: "left" } },{ text: "TRANSACCIONES/MES", options: tHdr },{ text: "TPV/MES (USD)", options: tHdr },{ text: "MDR ACTUAL", options: tHdr },{ text: "COSTO ADQUIRENCIAS/MES", options: tHdr }]];
  countries.forEach((c, i) => {
    const tpv = c.txnPerMonth * ticketPromedio;
    const costo = tpv * mdrActual;
    const rf = i % 2 === 0 ? { fill: { color: WHITE } } : { fill: { color: HARMONY_LILAC } };
    tRows.push([{ text: c.country, options: { ...tCellL, ...rf } },{ text: fmtNum(c.txnPerMonth), options: { ...tCell, ...rf } },{ text: `$${fmtNum(tpv)}`, options: { ...tCell, ...rf } },{ text: `${(mdrActual*100).toFixed(1)}%`, options: { ...tCell, ...rf } },{ text: `$${fmtNum(Math.round(costo))}`, options: { ...tCell, ...rf } }]);
  });
  const totalTxnT = countries.reduce((s,c) => s + c.txnPerMonth, 0);
  const totalTPVT = totalTxnT * ticketPromedio;
  tRows.push([{ text: "TOTAL", options: { ...tCellL, bold: true, fill: { color: YUNO_BLUE }, color: WHITE } },{ text: fmtNum(totalTxnT), options: { ...tCell, bold: true, fill: { color: YUNO_BLUE }, color: WHITE } },{ text: `$${fmtNum(totalTPVT)}`, options: { ...tCell, bold: true, fill: { color: YUNO_BLUE }, color: WHITE } },{ text: `${(mdrActual*100).toFixed(1)}%`, options: { ...tCell, bold: true, fill: { color: YUNO_BLUE }, color: WHITE } },{ text: `$${fmtNum(Math.round(totalTPVT * mdrActual))}`, options: { ...tCell, bold: true, fill: { color: YUNO_BLUE }, color: WHITE } }]);
  s6.addTable(tRows, { x: 0.5, y: 0.95, w: 9, colW: [1.5, 2, 2, 1.3, 2.2], border: { pt: 0.3, color: SOFT_BLUE }, rowH: tRows.map(() => 0.4) });
  const footY = 0.95 + tRows.length * 0.4 + 0.2;
  s6.addText(`Ticket promedio: $${ticketPromedio} USD por operacion. Total: ${fmtNum(totalTxnMes)} txns/mes ($${(totalTPVMensual/1e6).toFixed(1)}M USD TPV/mes).`, { x: 0.5, y: footY, w: 9, h: 0.4, fontSize: 9, fontFace: FONT, color: SECURITY_GRAY, italic: true });

  // --- SLIDE 7: DIVIDER ---
  let s7 = pres.addSlide();
  s7.background = { color: UNITY_BLACK };
  s7.addShape(pres.shapes.RECTANGLE, { x: 3.5, y: 0, w: 6.5, h: 5.625, fill: { color: YUNO_BLUE, transparency: 82 } });
  s7.addText("escenario con yuno", { x: 1, y: 1.8, w: 8, h: 2, fontSize: 44, fontFace: FONT, color: WHITE, align: "center", valign: "middle" });

  // --- SLIDE 8: EFECTO YUNO ---
  let s8 = pres.addSlide();
  s8.background = { color: HARMONY_LILAC };
  s8.addText("efecto yuno", { x: 0.5, y: 0.3, w: 7, h: 0.55, fontSize: 26, fontFace: FONT, color: UNITY_BLACK, margin: 0 });
  s8.addText("CASO DE NEGOCIO", { x: 7.5, y: 0.3, w: 2, h: 0.35, fontSize: 10, fontFace: FONT, color: SECURITY_GRAY, align: "right" });
  const eHdr = { fill: { color: YUNO_BLUE }, color: WHITE, bold: true, fontSize: 12, fontFace: FONT, align: "center", valign: "middle" };
  const eCell = { fontSize: 12, fontFace: FONT, color: UNITY_BLACK, valign: "middle" };
  const eRows = [
    [{ text: "CONCEPTO", options: { ...eHdr, align: "left" } }, { text: "DETALLE", options: eHdr }, { text: "AHORRO / AUMENTO - MES", options: eHdr }],
    [{ text: approvalLabel, options: { ...eCell, fill: { color: WHITE } } },{ text: approvalDetail, options: { ...eCell, fill: { color: WHITE }, align: "center", fontSize: 10 } },{ text: fmt(aumentoRevenue), options: { ...eCell, fill: { color: WHITE }, align: "center", bold: true, color: YUNO_BLUE } }],
    [{ text: "Reduccion Comision (MDR)", options: { ...eCell, fill: { color: HARMONY_LILAC } } },{ text: `De ${(mdrActual*100).toFixed(1)}% a ${(mdrNuevo*100).toFixed(1)}%`, options: { ...eCell, fill: { color: HARMONY_LILAC }, align: "center" } },{ text: fmt(ahorroMDRMensual), options: { ...eCell, fill: { color: HARMONY_LILAC }, align: "center", bold: true, color: YUNO_BLUE } }],
    [{ text: "Conciliacion", options: { ...eCell, fill: { color: WHITE } } },{ text: "Fijo", options: { ...eCell, fill: { color: WHITE }, align: "center" } },{ text: `$${fmtNum(ahorroConciliacion)}`, options: { ...eCell, fill: { color: WHITE }, align: "center", bold: true, color: YUNO_BLUE } }],
    [{ text: "Ahorro Operativo", options: { ...eCell, fill: { color: HARMONY_LILAC } } },{ text: "Fijo", options: { ...eCell, fill: { color: HARMONY_LILAC }, align: "center" } },{ text: `$${fmtNum(ahorroOperativo)}`, options: { ...eCell, fill: { color: HARMONY_LILAC }, align: "center", bold: true, color: YUNO_BLUE } }],
  ];
  s8.addTable(eRows, { x: 0.5, y: 1.1, w: 9, colW: [3.5, 2.5, 3], border: { pt: 0.3, color: SOFT_BLUE }, rowH: [0.45, 0.45, 0.45, 0.45, 0.45] });
  s8.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 3, y: 3.85, w: 4, h: 0.65, fill: { color: YUNO_BLUE }, rectRadius: 0.08 });
  s8.addText(`total impacto mensual: ${fmt(totalMensual)}`, { x: 3, y: 3.85, w: 4, h: 0.65, fontSize: 16, fontFace: FONT, color: WHITE, bold: true, align: "center", valign: "middle" });

  // --- SLIDE 9: DEV COST TABLE ---
  let s9 = pres.addSlide();
  s9.background = { color: HARMONY_LILAC };
  s9.addText("costo de desarrollo global", { x: 0.5, y: 0.25, w: 7, h: 0.5, fontSize: 22, fontFace: FONT, color: UNITY_BLACK, margin: 0 });
  s9.addText("BUSINESS CASE", { x: 7.5, y: 0.25, w: 2, h: 0.35, fontSize: 10, fontFace: FONT, color: SECURITY_GRAY, align: "right" });
  const devTeams = [{e:"Producto",c:2250,t:"50%",ci:3375,ct:20250},{e:"Ingenieria",c:5000,t:"90%",ci:13500,ct:81000},{e:"Pagos",c:2250,t:"70%",ci:4725,ct:28350},{e:"Tesoreria",c:1350,t:"40%",ci:1620,ct:9720},{e:"Compliance/Legal",c:1500,t:"40%",ci:1800,ct:10800},{e:"Finanzas",c:1125,t:"40%",ci:1350,ct:8100},{e:"Operaciones",c:2625,t:"60%",ci:4725,ct:28350}];
  const dH = { fill: { color: YUNO_BLUE }, color: WHITE, bold: true, fontSize: 7.5, fontFace: FONT, align: "center", valign: "middle" };
  const dC = { fontSize: 8, fontFace: FONT, color: UNITY_BLACK, valign: "middle" };
  const dR = [[{ text: "EQUIPOS INVOLUCRADOS", options: { ...dH, align: "left" } },{ text: "COSTO POR\nEQUIPO/MES", options: dH },{ text: "TIEMPO\nINVERTIDO", options: dH },{ text: "TOTAL COSTO POR\nINTEGRAR (3 MESES)", options: dH },{ text: "TOTAL COSTO POR\nEQUIPO (APMs +\nNUEVOS PROCESADORES)", options: dH }]];
  devTeams.forEach((t, i) => {
    const rf = i % 2 === 0 ? { fill: { color: WHITE } } : { fill: { color: HARMONY_LILAC } };
    dR.push([{ text: t.e, options: { ...dC, ...rf } },{ text: `$${fmtNum(t.c)}`, options: { ...dC, ...rf, align: "center" } },{ text: t.t, options: { ...dC, ...rf, align: "center" } },{ text: `$${fmtNum(t.ci)}`, options: { ...dC, ...rf, align: "center" } },{ text: `$${fmtNum(t.ct)}`, options: { ...dC, ...rf, align: "center" } }]);
  });
  dR.push([{ text: "TOTAL", options: { ...dC, bold: true, fill: { color: YUNO_BLUE }, color: WHITE } },{ text: "$16,100", options: { ...dC, bold: true, fill: { color: YUNO_BLUE }, color: WHITE, align: "center" } },{ text: "-", options: { ...dC, bold: true, fill: { color: YUNO_BLUE }, color: WHITE, align: "center" } },{ text: "$31,095", options: { ...dC, bold: true, fill: { color: YUNO_BLUE }, color: WHITE, align: "center" } },{ text: "$186,570", options: { ...dC, bold: true, fill: { color: YUNO_BLUE }, color: WHITE, align: "center" } }]);
  s9.addTable(dR, { x: 0.3, y: 0.85, w: 6.2, colW: [1.4, 1.1, 0.9, 1.3, 1.5], border: { pt: 0.3, color: SOFT_BLUE }, rowH: [0.42, 0.33, 0.33, 0.33, 0.33, 0.33, 0.33, 0.33, 0.36] });
  s9.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 6.7, y: 0.85, w: 3, h: 3.7, fill: { color: WHITE }, rectRadius: 0.12, shadow: mkShadow() });
  s9.addText("CONCLUSIONES", { x: 6.9, y: 1.0, w: 2.6, h: 0.35, fontSize: 12, fontFace: FONT, color: UNITY_BLACK, bold: true });
  s9.addText("Al centralizar las nuevas integraciones de pago a traves de la unica API de Yuno:", { x: 6.9, y: 1.45, w: 2.6, h: 0.7, fontSize: 9.5, fontFace: FONT, color: MID_GRAY, lineSpacingMultiple: 1.3 });
  s9.addText([{ text: `${clientName} `, options: { italic: true, bold: true, color: UNITY_BLACK } },{ text: "se ahorrara hasta ", options: { color: MID_GRAY } },{ text: "$186,570 USD\n", options: { bold: true, color: YUNO_BLUE } },{ text: "en costo de desarrollo asociado a nuevas integraciones de pago", options: { color: MID_GRAY } }], { x: 6.9, y: 2.2, w: 2.6, h: 1.0, fontSize: 10, fontFace: FONT, lineSpacingMultiple: 1.3 });
  s9.addText([{ text: "Un estimado de ", options: { color: MID_GRAY } },{ text: "18 meses de trabajo de ingenieros ", options: { bold: true, color: UNITY_BLACK } },{ text: "podrian ser ahorrados alocados en otras tareas mas relevantes para la innovacion", options: { color: MID_GRAY } }], { x: 6.9, y: 3.2, w: 2.6, h: 1.1, fontSize: 9.5, fontFace: FONT, lineSpacingMultiple: 1.3 });

  // --- SLIDE 10: IMPACT SUMMARY ---
  let s10 = pres.addSlide();
  s10.background = { color: UNITY_BLACK };
  s10.addText("IMPACTO", { x: 0.6, y: 0.35, w: 2, h: 0.25, fontSize: 10, fontFace: FONT, color: SECURITY_GRAY, charSpacing: 1.5 });
  s10.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.4, y: 0.8, w: 3, h: 4.4, fill: { color: "1E2026" }, rectRadius: 0.12 });
  s10.addText("impacto economico\nestimado (USD)", { x: 0.6, y: 1.1, w: 2.6, h: 0.7, fontSize: 17, fontFace: FONT, color: WHITE });
  s10.addText("Ahorro Costo Nuevas\nIntegraciones", { x: 0.6, y: 2.3, w: 2.6, h: 0.4, fontSize: 11, fontFace: FONT, color: SECURITY_GRAY });
  s10.addText("$186K/ANO", { x: 0.6, y: 2.8, w: 2.6, h: 0.5, fontSize: 22, fontFace: FONT, color: YUNO_BLUE, bold: true });
  s10.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 3.6, y: 0.8, w: 6.1, h: 4.4, fill: { color: "1E2026" }, rectRadius: 0.12 });
  s10.addText("impacto economico (USD)", { x: 3.9, y: 0.95, w: 5.4, h: 0.35, fontSize: 17, fontFace: FONT, color: WHITE });
  const mets = [
    { label: approvalMetricLabel, value: `${fmt(aumentoRevenue)}/MES`, y: 1.6 },
    { label: "REDUCCION COMISION (MDR)", value: `${fmt(ahorroMDRMensual)}/MES`, y: 1.6 },
    { label: "AHORRO OPERATIVO", value: `$${(ahorroOperativo/1000).toFixed(0)}K/MES`, y: 3.3 },
    { label: "AHORRO CONCILIACION", value: `$${(ahorroConciliacion/1000).toFixed(0)}K/MES`, y: 3.3 },
  ];
  mets.forEach((m, i) => {
    const mx = i % 2 === 0 ? 3.9 : 7.0;
    s10.addText(m.label, { x: mx, y: m.y, w: 2.8, h: 0.3, fontSize: 9, fontFace: FONT, color: SECURITY_GRAY, charSpacing: 0.5 });
    s10.addText(m.value, { x: mx, y: m.y + 0.35, w: 2.8, h: 0.55, fontSize: 22, fontFace: FONT, color: YUNO_BLUE, bold: true });
  });
  s10.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 4.7, y: 4.3, w: 3.6, h: 0.65, fill: { color: YUNO_BLUE }, rectRadius: 0.08 });
  s10.addText(`${fmt(totalMensual)}/MES`, { x: 4.7, y: 4.3, w: 3.6, h: 0.65, fontSize: 22, fontFace: FONT, color: WHITE, bold: true, align: "center", valign: "middle" });

  // --- SLIDE 11: COMMERCIAL PROPOSAL ---
  let s11 = pres.addSlide();
  s11.background = { color: HARMONY_LILAC };
  s11.addText("propuesta comercial", { x: 0.6, y: 0.35, w: 5, h: 0.6, fontSize: 28, fontFace: FONT, color: UNITY_BLACK, margin: 0 });
  const terms = [
    { num: "01.", text: `Minimo transaccional: ${minimoTransaccional}` },
    { num: "02.", text: saasFee > 0 ? `Fee fijo SaaS mensual: ${fmtNum(saasFee)} USD` : "Sin fee fijo SaaS mensual" },
    { num: "03.", text: "KAM, TAM, 3DS, Conciliacion y\nBoveda agnostica incluida" },
    { num: "04.", text: `Propuesta valida hasta ${propuestaValidaHasta}` },
    { num: "05.", text: "No incluye IVA" },
  ];
  terms.forEach((t, i) => {
    const ty = 1.2 + i * 0.72;
    s11.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: ty, w: 4.3, h: 0.6, fill: { color: WHITE }, rectRadius: 0.08, shadow: mkShadow() });
    s11.addText([{ text: t.num + " ", options: { bold: true, color: YUNO_BLUE, fontSize: 13 } },{ text: t.text, options: { color: UNITY_BLACK, fontSize: 10.5 } }], { x: 0.7, y: ty, w: 3.9, h: 0.6, fontFace: FONT, valign: "middle" });
  });
  s11.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.2, y: 0.95, w: 4.4, h: 4.2, fill: { color: WHITE }, rectRadius: 0.12, shadow: mkShadow() });
  s11.addText("PRECIO POR TRANSACCION APROBADA (USD)", { x: 5.4, y: pricingType === "flat" ? 1.3 : 1.1, w: 4, h: 0.4, fontSize: 10, fontFace: FONT, color: UNITY_BLACK, bold: true, align: "center", charSpacing: 0.5 });
  if (pricingType === "flat") {
    s11.addText(`$${flatPrice.toFixed(2)}`, { x: 5.4, y: 2.2, w: 4, h: 1.2, fontSize: 72, fontFace: FONT, color: YUNO_BLUE, bold: true, align: "center", valign: "middle" });
    s11.addText("USD por transaccion aprobada", { x: 5.4, y: 3.4, w: 4, h: 0.35, fontSize: 12, fontFace: FONT, color: SECURITY_GRAY, align: "center" });
    s11.addText("tarifa unica sin tranches", { x: 5.4, y: 3.9, w: 4, h: 0.35, fontSize: 10, fontFace: FONT, color: SECURITY_GRAY, italic: true, align: "center" });
  } else {
    const trH = { fill: { color: YUNO_BLUE }, color: WHITE, bold: true, fontSize: 9.5, fontFace: FONT, align: "center", valign: "middle" };
    const trC = { fontSize: 11, fontFace: FONT, color: UNITY_BLACK, align: "center", valign: "middle" };
    const trR = [[{ text: "TRANCHE", options: trH }, { text: "RANGO TXNS/MES", options: trH }, { text: "PRECIO (USD)", options: trH }]];
    tranches.forEach((t, i) => {
      const rf = i % 2 === 0 ? { fill: { color: HARMONY_LILAC } } : { fill: { color: WHITE } };
      const priceStr = t.price < 0.1 ? `$${t.price.toFixed(4)}` : `$${t.price.toFixed(2)}`;
      trR.push([{ text: t.name, options: { ...trC, ...rf, bold: true } },{ text: t.range, options: { ...trC, ...rf } },{ text: priceStr, options: { ...trC, ...rf, bold: true, color: YUNO_BLUE, fontSize: 14 } }]);
    });
    s11.addTable(trR, { x: 5.4, y: 1.6, w: 4, colW: [1.0, 1.5, 1.5], border: { pt: 0.3, color: SOFT_BLUE }, rowH: Array(trR.length).fill(0.4) });
    s11.addText("precio decrece por volumen de transacciones", { x: 5.4, y: 1.6 + trR.length * 0.4 + 0.15, w: 4, h: 0.35, fontSize: 9, fontFace: FONT, color: SECURITY_GRAY, italic: true, align: "center" });
  }
  s11.addText("yuno", { x: 0.5, y: 5.05, w: 1.5, h: 0.3, fontSize: 18, fontFace: FONT, color: YUNO_BLUE, bold: true });

  // --- SLIDE 12: DIVIDER ---
  let s12 = pres.addSlide();
  s12.background = { color: UNITY_BLACK };
  s12.addShape(pres.shapes.RECTANGLE, { x: 3.5, y: 0, w: 6.5, h: 5.625, fill: { color: YUNO_BLUE, transparency: 82 } });
  s12.addText("casos de exito", { x: 1, y: 1.8, w: 8, h: 2, fontSize: 44, fontFace: FONT, color: WHITE, align: "center", valign: "middle" });

  // --- SLIDES 13-15: CASE STUDIES ---
  function makeCase(title, stats, footnote) {
    let sl = pres.addSlide();
    sl.background = { color: HARMONY_LILAC };
    sl.addText(title, { x: 0.5, y: 0.35, w: 7.5, h: 0.5, fontSize: 20, fontFace: FONT, color: UNITY_BLACK, margin: 0 });
    sl.addText("SOLUCION", { x: 8.2, y: 0.35, w: 1.3, h: 0.35, fontSize: 10, fontFace: FONT, color: SECURITY_GRAY, align: "right" });
    stats.forEach((c, i) => {
      const cx = 0.6 + i * 4.6;
      const ac = i === 0 ? "34A853" : YUNO_BLUE;
      sl.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx, y: 1.1, w: 4, h: 1.8, fill: { color: WHITE }, rectRadius: 0.1, shadow: mkShadow() });
      sl.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx, y: 1.1, w: 0.07, h: 1.8, fill: { color: ac }, rectRadius: 0.035 });
      sl.addText(c.label, { x: cx + 0.25, y: 1.2, w: 3.4, h: 0.25, fontSize: 11, fontFace: FONT, color: SECURITY_GRAY });
      sl.addText(c.value, { x: cx + 0.25, y: 1.5, w: 3.4, h: 0.6, fontSize: 36, fontFace: FONT, color: ac, bold: true });
      sl.addText(c.sub, { x: cx + 0.25, y: 2.2, w: 3.4, h: 0.25, fontSize: 9.5, fontFace: FONT, color: SECURITY_GRAY });
    });
    sl.addText(footnote, { x: 0.6, y: 3.3, w: 8.8, h: 0.35, fontSize: 10, fontFace: FONT, color: SECURITY_GRAY, italic: true });
  }
  makeCase("delivery superapp - suscripciones", [{ label: "Con retries", value: "90.40%", sub: "5.42M pagos exitosos" },{ label: "Sin retries", value: "85.09%", sub: "5.1M pagos exitosos" }], "Tasa de aprobacion mensual de tarjetas con y sin retries (Ago - Nov 2025)");
  makeCase("cadena de gimnasios - subscripcion", [{ label: "Con retries", value: "84.07%", sub: "648.71K pagos exitosos" },{ label: "Sin retries", value: "81.40%", sub: "628.08K pagos exitosos" }], "Mejora de ~79% a ~87% en tasa de aprobacion con retries inteligentes (Jul - Oct 2025)");
  makeCase("empresa seguros CO - caida de primer proveedor", [{ label: "Con retries (fallback)", value: "80.23%", sub: "338.27K pagos exitosos" },{ label: "Sin retries", value: "72.41%", sub: "305.32K pagos exitosos" }], "Sin el fallback de Yuno, la tasa cayo de 72% a 63% al fallar el proveedor primario (Oct 2025)");

  // --- SLIDE 16: CLOSING ---
  let s16 = pres.addSlide();
  s16.background = { color: UNITY_BLACK };
  s16.addShape(pres.shapes.RECTANGLE, { x: 5, y: -0.5, w: 6, h: 6.6, fill: { color: YUNO_BLUE, transparency: 80 } });
  s16.addText("yuno", { x: 0.6, y: 0.4, w: 2, h: 0.35, fontSize: 22, fontFace: FONT, color: WHITE, bold: true });
  s16.addText("W W W . Y . U N O", { x: 7.2, y: 0.4, w: 2.3, h: 0.35, fontSize: 9, fontFace: FONT, color: SECURITY_GRAY, align: "right", charSpacing: 2 });
  s16.addText("crezcamos juntos", { x: 0.6, y: 1.8, w: 8, h: 1.2, fontSize: 48, fontFace: FONT, color: WHITE });
  s16.addText("agendemos un 1:1 para mas detalles", { x: 0.6, y: 3.1, w: 8, h: 0.4, fontSize: 16, fontFace: FONT, color: SECURITY_GRAY });
  s16.addText("Rasheed Bayter", { x: 5.5, y: 3.9, w: 3, h: 0.3, fontSize: 13, fontFace: FONT, color: WHITE, bold: true });
  s16.addText("RASHEED@Y.UNO", { x: 5.5, y: 4.2, w: 3, h: 0.25, fontSize: 10, fontFace: FONT, color: SECURITY_GRAY });
  s16.addShape(pres.shapes.LINE, { x: 0.6, y: 5.05, w: 8.8, h: 0, line: { color: MID_GRAY, width: 0.4 } });
  s16.addText([{ text: "AGENDAR UN DEMO: ", options: { color: SECURITY_GRAY, fontSize: 9 } },{ text: "WWW.Y.UNO/BOOK-A-DEMO", options: { color: WHITE, bold: true, fontSize: 9 } }], { x: 5, y: 5.15, w: 4.5, h: 0.25, fontFace: FONT, align: "right" });

  // ============ RETURN BUFFER ============
  const buffer = await pres.write({ outputType: "nodebuffer" });
  try { fs.rmSync(logoDir, { recursive: true }); } catch {}

  return { buffer, summary: { clientName, totalTPVMensual, totalTxnMes, ahorroMDRMensual, aumentoRevenue, totalMensual, slides: 16 } };
}

module.exports = { generateBusinessCase };

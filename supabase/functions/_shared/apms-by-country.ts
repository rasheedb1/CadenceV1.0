// Per-country APM catalog for the SDR BC's "Proposed APMs" slide.
// Source: tasks/metodos-pago-por-pais.txt (2026-05-11 snapshot).
//
// Used downstream by sdr-bc-generate:
//   1. Look up the country's APM list by ISO
//   2. Diff against `existing_apms` detected in deep-research
//   3. Recommend the top-3 of what's missing (preserves the table order,
//      which is curated by strategic relevance to Yuno)
//
// Country names in the source file use English (matches SimilarWeb's
// `country_name`). We re-key to ISO-2 here so the lookup is uniform with
// the rest of the regions module.

import { isoFromCountryName } from './regions.ts'

// Mirrored exactly from tasks/metodos-pago-por-pais.txt — DO NOT reorder
// items without updating that file. Order = strategic recommendation order.
const RAW: Record<string, string[]> = {
  'United States':       ['PayPal', 'Apple Pay', 'Google Pay', 'Venmo', 'Cash App', 'Zelle', 'ACH', 'Pay by Bank', 'FedNow', 'Affirm', 'Klarna', 'Afterpay', 'PayPal Pay in 4'],
  'Canada':              ['Interac e-Transfer', 'Interac Online', 'Apple Pay', 'Google Pay', 'PayPal', 'Klarna', 'Afterpay', 'Sezzle'],
  'Mexico':              ['SPEI', 'CoDi', 'DiMo', 'OXXO Pay', 'Mercado Pago', 'PayPal', 'Apple Pay', 'Google Pay', 'Kueski Pay', 'Spin by OXXO', 'Bait', 'Paynet', 'Todito Cash'],
  'Brazil':              ['Pix', 'Boleto Bancario', 'Mercado Pago', 'PicPay', 'Ame Digital', 'PayPal', 'Apple Pay', 'Google Pay', 'Nubank wallet', 'PagBank'],
  'Argentina':           ['Mercado Pago', 'MODO', 'Transferencias 3.0', 'Uala', 'Cuenta DNI', 'Naranja X', 'Personal Pay', 'Rapipago', 'Pago Facil'],
  'Colombia':            ['PSE', 'Nequi', 'Daviplata', 'Boton Bancolombia', 'Bre-B', 'Movii', 'Bancolombia a la Mano', 'Tpaga', 'Efecty', 'Baloto', 'Apple Pay', 'Google Pay'],
  'Chile':               ['Webpay Plus', 'Mercado Pago', 'Mach', 'Khipu', 'Fintoc', 'Fpay', 'Onepay', 'Servipag', 'Klap', 'Multicaja', 'Apple Pay', 'Google Pay'],
  'Peru':                ['Yape', 'Plin', 'PagoEfectivo', 'Mercado Pago', 'Tunki', 'BIM', 'SafetyPay', 'Apple Pay', 'Google Pay'],
  'Ecuador':             ['DeUna', 'PayPhone', 'Pichincha Mi Vecino', 'Western Union', 'Tia Pagos', 'PayPal'],
  'Uruguay':             ['Mercado Pago', 'Abitab', 'Redpagos', 'Prex', 'Itau Link', 'Antel', 'Plin UY'],
  'Bolivia':             ['Tigo Money', 'QR Simple', 'BCP Wallet', 'Yolopago'],
  'Costa Rica':          ['Sinpe Movil', 'Kash', 'Pinpa', 'Tucan', 'Servimas'],
  'Panama':              ['Yappy', 'Nequi', 'ACH Xpress', 'Banistmo Wallet'],
  'Dominican Republic':  ['tPago', 'AZUL Wallet', 'Pagos al Instante', 'Caja Ahorros app'],
  'Paraguay':            ['Bancard', 'Personal Pay', 'Tigo Money', 'Practi Pago', 'Aqui Pago', 'Zimple'],
  'Guatemala':           ['Tigo Money', 'Bantrab Yo', 'Visa Direct', 'Akisi'],
  'Venezuela':           ['Pago Movil BCV', 'Zelle', 'Cashea', 'Reserve', 'Mercantil En Linea'],
  'United Kingdom':      ['PayPal', 'Apple Pay', 'Google Pay', 'Klarna', 'Clearpay', 'Open Banking', 'Pay by Bank', 'Trustly', 'Revolut Pay'],
  'Germany':             ['PayPal', 'SEPA Direct Debit', 'Klarna', 'Giropay', 'Wero', 'Apple Pay', 'Google Pay', 'Paysafecard'],
  'France':              ['Cartes Bancaires (CB)', 'PayPal', 'Apple Pay', 'Google Pay', 'Paylib', 'Lydia', 'Wero', 'Klarna', 'Alma', 'Oney'],
  'Spain':               ['Bizum', 'PayPal', 'Apple Pay', 'Google Pay', 'Klarna', 'MyBank', 'Aplazame', 'SeQura'],
  'Italy':               ['PayPal', 'Satispay', 'Postepay', 'Bancomat Pay', 'Apple Pay', 'Google Pay', 'Scalapay', 'Klarna', 'MyBank'],
  'Netherlands':         ['iDEAL', 'PayPal', 'Apple Pay', 'Google Pay', 'Klarna', 'Tikkie', 'Riverty', 'Bancontact'],
  'Belgium':             ['Bancontact', 'Payconiq', 'KBC Mobile', 'PayPal', 'Apple Pay', 'Google Pay', 'Klarna'],
  'Switzerland':         ['TWINT', 'PayPal', 'Apple Pay', 'Google Pay', 'PostFinance Pay'],
  'Austria':             ['EPS-Uberweisung', 'PayPal', 'Apple Pay', 'Google Pay', 'Klarna', 'Paysafecard'],
  'Portugal':            ['Multibanco', 'MB WAY', 'PayPal', 'Apple Pay', 'Google Pay'],
  'Ireland':             ['PayPal', 'Apple Pay', 'Google Pay', 'Revolut Pay', 'Klarna'],
  'Sweden':              ['Swish', 'Klarna', 'PayPal', 'Apple Pay', 'Google Pay', 'Trustly'],
  'Norway':              ['Vipps', 'Klarna', 'PayPal', 'Apple Pay', 'Google Pay'],
  'Denmark':             ['MobilePay', 'Klarna', 'PayPal', 'Apple Pay', 'Google Pay'],
  'Finland':             ['MobilePay', 'Pivo', 'Siirto', 'OP Mobile', 'Klarna', 'PayPal'],
  'Poland':              ['BLIK', 'Przelewy24', 'PayU', 'Tpay', 'PayPal', 'Apple Pay', 'Google Pay'],
  'Czech Republic':      ['Apple Pay', 'Google Pay', 'PayPal', 'CSOB Platba 24', 'KB Platba 24', 'Twisto', 'MallPay'],
  'Slovakia':            ['Tatra Pay', 'VUB ePlatby', 'PayPal', 'Apple Pay', 'Google Pay'],
  'Hungary':             ['Barion', 'OTP SimplePay', 'PayPal', 'Apple Pay', 'Google Pay'],
  'Romania':             ['Netopia', 'PayU', 'PayPal', 'Apple Pay', 'Google Pay', 'Revolut Pay'],
  'Greece':              ['IRIS Online Payments', 'Viva Wallet', 'PayPal', 'Apple Pay', 'Google Pay'],
  'Turkey':              ['Papara', 'BKM Express', 'iyzico', 'Garanti Bonus', 'Maximum Mobile', 'Ininal', 'Tosla', 'Apple Pay', 'Google Pay'],
  'UAE':                 ['Apple Pay', 'Google Pay', 'Samsung Pay', 'Aani', 'Careem Pay', 'e& money', 'PayBy', 'Tabby', 'Tamara', 'Postpay'],
  'Saudi Arabia':        ['Mada Pay', 'STC Pay', 'urpay', 'Sarie', 'Apple Pay', 'Google Pay', 'Tabby', 'Tamara'],
  'Qatar':               ['NaqPay', 'Ooredoo Money', 'Apple Pay', 'Google Pay'],
  'Bahrain':             ['BenefitPay', 'Apple Pay', 'Google Pay'],
  'Kuwait':              ['KNET', 'MyFatoorah', 'Tap Payments', 'Apple Pay'],
  'Oman':                ['OmanNet', 'Thawani', 'Apple Pay'],
  'Israel':              ['Bit', 'PayBox', 'Apple Pay', 'Google Pay', 'PayPal', 'Max Pay'],
  'Egypt':               ['Fawry', 'Vodafone Cash', 'InstaPay', 'Meeza Digital', 'Aman', 'ValU', 'Etisalat Cash'],
  'Jordan':              ['CliQ', 'eFAWATEERcom', 'Zain Cash', 'Orange Money', 'Dinarak'],
  'South Africa':        ['Ozow', 'PayFast', 'Stitch', 'SnapScan', 'Zapper', 'PayShap', 'Apple Pay', 'Google Pay', 'Mobicred', 'PayJustNow'],
  'Nigeria':             ['NIBSS Instant Transfer', 'OPay', 'PalmPay', 'Moniepoint', 'Paystack', 'Flutterwave', 'USSD', 'Verve'],
  'Kenya':               ['M-Pesa', 'Airtel Money', 'T-kash', 'Pesalink'],
  'Ghana':               ['MTN MoMo', 'AirtelTigo Money', 'Telecel Cash', 'GhIPSS Instant Pay'],
  'Tanzania':            ['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'Halopesa'],
  'Uganda':              ['MTN MoMo', 'Airtel Money'],
  'Morocco':             ['CashPlus', 'Wafacash', 'Barid Bank Mobile', 'M-Wallet'],
  "Cote d'Ivoire":       ['Orange Money', 'MTN MoMo', 'Moov Money', 'Wave'],
  'Senegal':             ['Wave', 'Orange Money', 'Free Money'],
  'China':               ['Alipay', 'WeChat Pay', 'UnionPay QuickPass', 'Apple Pay', 'Digital Yuan'],
  'Japan':               ['PayPay', 'Rakuten Pay', 'd Barai', 'au PAY', 'LINE Pay', 'Merpay', 'Konbini', 'Pay-easy', 'Apple Pay', 'Amazon Pay'],
  'South Korea':         ['KakaoPay', 'Naver Pay', 'Samsung Pay', 'Toss', 'Payco', 'Apple Pay'],
  'India':               ['UPI', 'PhonePe', 'Google Pay', 'Paytm', 'BHIM', 'Paytm Wallet', 'RuPay', 'NetBanking', 'NEFT', 'IMPS', 'Razorpay Pay Later', 'Simpl', 'LazyPay'],
  'Indonesia':           ['GoPay', 'OVO', 'DANA', 'ShopeePay', 'LinkAja', 'QRIS', 'Virtual Account BCA', 'Virtual Account Mandiri', 'Virtual Account BNI', 'Virtual Account BRI', 'Alfamart', 'Indomaret', 'Akulaku', 'Kredivo'],
  'Thailand':            ['PromptPay', 'TrueMoney Wallet', 'Rabbit LINE Pay', 'ShopeePay', 'K PLUS', 'SCB Easy'],
  'Vietnam':             ['MoMo', 'ZaloPay', 'VNPay', 'VietQR', 'ShopeePay', 'Viettel Money'],
  'Philippines':         ['GCash', 'Maya', 'GrabPay', 'ShopeePay', 'InstaPay', 'PESONet', '7-Eleven', 'Cebuana Lhuillier', 'Bayad Center'],
  'Malaysia':            ['Touch n Go eWallet', 'DuitNow QR', 'Boost', 'GrabPay', 'ShopeePay', 'MAE by Maybank', 'FPX'],
  'Singapore':           ['PayNow', 'GrabPay', 'DBS PayLah!', 'NETS', 'NETS QR', 'Apple Pay', 'Google Pay', 'ShopeePay'],
  'Hong Kong':           ['Octopus', 'AlipayHK', 'WeChat Pay HK', 'FPS', 'PayMe by HSBC', 'Apple Pay', 'Google Pay'],
  'Taiwan':              ['LINE Pay', 'JKoPay', 'Apple Pay', 'Google Pay', 'Easy Wallet', 'iPASS MONEY', 'Pi Wallet'],
  'Australia':           ['PayID', 'PayTo', 'BPAY', 'Apple Pay', 'Google Pay', 'Afterpay', 'Zip', 'Beem'],
  'New Zealand':         ['Account2Account', 'Windcave', 'POLi', 'Afterpay', 'Laybuy', 'Apple Pay', 'Google Pay', 'Online EFTPOS'],
  'Pakistan':            ['Easypaisa', 'JazzCash', 'Raast', 'NayaPay', 'SadaPay'],
  'Bangladesh':          ['bKash', 'Nagad', 'Rocket', 'Upay'],
  'Sri Lanka':           ['LankaQR', 'eZ Cash', 'mCash', 'FriMi'],
}

// Re-key by ISO-2 (matches the country naming we use everywhere else).
export const APMS_BY_ISO: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {}
  for (const [name, apms] of Object.entries(RAW)) {
    const iso = isoFromCountryName(name)
    if (iso) out[iso] = apms
  }
  return out
})()

// Normalize an APM name for comparison: lowercase, drop non-alphanumeric.
// "Mercado Pago" / "MercadoPago" / "mercado_pago" → "mercadopago".
function normalizeApm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Given a country and the LLM-detected existing APMs, return the top-N (default 3)
// recommendations from the country's catalog — i.e. the first N catalog entries
// that don't match (via fuzzy contains) any of the existing entries.
export function recommendApms(
  iso: string,
  existingApms: string[],
  topN = 3,
): string[] {
  const catalog = APMS_BY_ISO[iso.toUpperCase()] || []
  if (catalog.length === 0) return []
  const existingNorms = existingApms.map(normalizeApm).filter(Boolean)
  const recommendations: string[] = []
  for (const candidate of catalog) {
    const candNorm = normalizeApm(candidate)
    if (!candNorm) continue
    const isAlreadyAccepted = existingNorms.some(
      e => e === candNorm || e.includes(candNorm) || candNorm.includes(e),
    )
    if (isAlreadyAccepted) continue
    recommendations.push(candidate)
    if (recommendations.length >= topN) break
  }
  return recommendations
}

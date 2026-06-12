import HalftoneBg from '../primitives/HalftoneBg'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { fmtPct, fmtMoney } from '../../lib/format'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

// PSP arena — A/B competition that justifies the blended MDR.
// Default roster = Coppel (MX): BBVA + EVO son los incumbentes; Getnet,
// Prosa y Banorte son los nuevos entrantes que Yuno trae a la subasta.
// Weighted average ≈ target MDR (1.50%). Override per-deck via
// `inputs.psp_arena_roster` (e.g. BCI Seguros → roster chileno).
const PSP_ROSTER_DEFAULT = [
  { name: 'Getnet',  bid: 1.46, share: 30, status: 'winning' },
  { name: 'Prosa',   bid: 1.50, share: 24, status: 'active'  },
  { name: 'Banorte', bid: 1.52, share: 18, status: 'active'  },
  { name: 'BBVA',    bid: 1.55, share: 16, status: 'active'  },
  { name: 'EVO',     bid: 1.58, share: 12, status: 'probing' },
]

function StatusPill({ status, lang }) {
  const t = (path) => tr(STRINGS, lang, path)
  const map = {
    winning: { label: t('leverMDR.statusWinning'), bg: 'rgba(224,237,128,0.20)', bd: 'rgba(180,200,60,0.55)', fg: '#6B7A1F' },
    active:  { label: t('leverMDR.statusActive'),  bg: 'rgba(62,79,224,0.10)',   bd: 'rgba(62,79,224,0.35)',  fg: 'var(--yuno-blue)' },
    probing: { label: t('leverMDR.statusProbing'), bg: 'rgba(40,42,48,0.06)',    bd: 'rgba(40,42,48,0.15)',   fg: 'var(--gray-alt)' },
  }
  const s = map[status] || map.active
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px', borderRadius: 999,
      background: s.bg, border: `1px solid ${s.bd}`,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: s.fg, whiteSpace: 'nowrap',
    }}>
      {status === 'winning' && (
        <span style={{
          width: 5, height: 5, borderRadius: '50%', background: '#9CB22A',
          animation: 'splitPulseWin 1.4s ease-in-out infinite',
        }} />
      )}
      {s.label}
    </span>
  )
}

// Card explícita por método (crédito / débito). Tres filas:
//   1. header con title + rate transition (hoy → yuno)
//   2. costo anual hoy
//   3. ahorro anual con Yuno
// El AE puede señalar cada número uno a uno sin ambigüedad.
function MethodCard({ accent, title, rateFrom, rateTo, rateUnit, costNow, costNew, savings, formula, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  return (
    <div style={{
      flex: 1,
      padding: '18px 22px',
      background: '#fff',
      border: '1px solid rgba(40,42,48,0.10)',
      borderRadius: 14,
      display: 'flex', flexDirection: 'column', gap: 12,
      boxShadow: '0 4px 18px rgba(40,42,48,0.05)',
      position: 'relative', overflow: 'hidden',
    }}>
      <span aria-hidden style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: 3,
        background: `linear-gradient(180deg, ${accent}cc 0%, ${accent}00 100%)`,
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div className="t-label" style={{ fontSize: 10, color: 'var(--gray-alt)', marginBottom: 4 }}>
            {rateUnit}
          </div>
          <div style={{
            fontFamily: 'Titillium Web', fontWeight: 700, fontSize: 18,
            color: 'var(--unity-black)', letterSpacing: '-0.02em',
          }}>{title}</div>
        </div>
        <div className="num-tabular" style={{
          fontSize: 16, fontWeight: 500, color: accent,
        }}>
          <span style={{
            color: 'var(--gray-alt)', textDecoration: 'line-through',
            textDecorationThickness: 1, marginRight: 8, fontWeight: 400,
          }}>{rateFrom}</span>
          {rateTo}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        borderTop: '1px solid rgba(40,42,48,0.08)', paddingTop: 12,
      }}>
        <div>
          <div className="t-label" style={{ fontSize: 9, color: 'var(--gray-alt)', marginBottom: 4 }}>
            {t('leverMDR.cardCostTodayLabel')}
          </div>
          <div className="num-tabular" style={{
            fontSize: 22, fontWeight: 400, color: 'var(--unity-black)',
            letterSpacing: '-0.02em', lineHeight: 1,
          }}>{costNow}</div>
        </div>
        <div>
          <div className="t-label" style={{ fontSize: 9, color: 'var(--gray-alt)', marginBottom: 4 }}>
            {t('leverMDR.cardCostNewLabel')}
          </div>
          <div className="num-tabular" style={{
            fontSize: 22, fontWeight: 400, color: 'var(--gray-alt)',
            letterSpacing: '-0.02em', lineHeight: 1,
          }}>{costNew}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="t-label" style={{ fontSize: 9, color: accent, marginBottom: 4 }}>
            {t('leverMDR.cardSavingsLabel')}
          </div>
          <div className="num-tabular" style={{
            fontSize: 24, fontWeight: 600, color: accent,
            letterSpacing: '-0.02em', lineHeight: 1,
          }}>{savings}</div>
        </div>
      </div>

      {formula && (
        <div className="mono" style={{
          fontSize: 10, color: 'var(--gray-alt)', letterSpacing: '0.02em',
          paddingTop: 6, borderTop: '1px dashed rgba(40,42,48,0.10)',
        }}>{formula}</div>
      )}
    </div>
  )
}

function PspRow({ row, isLeader, lang }) {
  return (
    <div style={{
      position: 'relative',
      padding: '9px 14px',
      borderRadius: 10,
      background: isLeader ? 'rgba(62,79,224,0.06)' : 'rgba(255,255,255,0.65)',
      border: `1px solid ${isLeader ? 'rgba(62,79,224,0.30)' : 'rgba(40,42,48,0.08)'}`,
      animation: isLeader ? 'winnerBreathe 3.2s ease-in-out infinite' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span className="t-label" style={{
          fontSize: 9, color: 'var(--gray-alt)', minWidth: 18,
        }}>#{row.rank}</span>
        <span style={{
          fontFamily: 'Titillium Web', fontSize: 16, fontWeight: 600,
          color: 'var(--unity-black)', flex: 1, letterSpacing: '-0.01em',
        }}>{row.name}</span>
        <span className="num-tabular" style={{
          fontFamily: 'Geist Mono, ui-monospace, monospace',
          fontSize: 13, color: 'var(--unity-black)', fontWeight: 500,
        }}>{tr(STRINGS, lang, 'leverMDR.bidLabel')} {fmtPct(row.bid, 2)}</span>
        <StatusPill status={row.status} lang={lang} />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          flex: 1, height: 6, borderRadius: 3, overflow: 'hidden',
          background: 'rgba(40,42,48,0.08)',
        }}>
          <div style={{
            width: `${row.share}%`, height: '100%',
            background: isLeader
              ? 'linear-gradient(90deg, var(--yuno-blue) 0%, var(--yuno-blue-light) 100%)'
              : 'var(--gray-alt)',
            opacity: isLeader ? 1 : 0.55,
          }} />
        </div>
        <span className="num-tabular" style={{
          fontSize: 12, fontWeight: 600, color: 'var(--unity-black)',
          minWidth: 42, textAlign: 'right',
        }}>{row.share}% {tr(STRINGS, lang, 'leverMDR.shareSuffix')}</span>
      </div>
    </div>
  )
}

export default function SlideLeverMDR({ data, pageNum, total, lang = 'es', currency: currencyProp }) {
  const t = (path) => tr(STRINGS, lang, path)
  const inputs = data?.INPUTS || {}
  const bc = data?.BUSINESS_CASE || {}
  const currency = currencyProp || inputs.currency || bc.currency || 'USD'
  const m = (v, opts) => fmtMoney(v, currency, lang, opts)
  const cs = currency === 'EUR' ? '€' : '$'

  // Modelo nuevo: rates por método. Fallback al modelo legacy single-rate.
  // Débito en dos sabores: $/tx aprobada (Coppel MX) o % sobre TPV débito
  // (BCI Seguros CL) — pct-mode toma precedencia, mismo patrón que el engine
  // y SlideLeversOverview.
  const creditMdrNow = Number(inputs.current_credit_mdr_pct) || Number(inputs.current_mdr_pct) || 2.37
  const creditMdrNew = Number(inputs.target_credit_mdr_pct) || Number(inputs.target_mdr_pct) || 2.10
  const debitMdrNow = Number(inputs.current_debit_mdr_per_tx) || 0
  const debitMdrNew = Number(inputs.target_debit_mdr_per_tx) || 0
  const debitMdrPctNow = Number(inputs.current_debit_mdr_pct) || 0
  const debitMdrPctNew = Number(inputs.target_debit_mdr_pct) || 0
  const debitPctMode = debitMdrPctNow > 0
  const hasDebit = debitPctMode || debitMdrNow > 0

  const creditSavings = Number(bc.mdr_credit_savings_annual) || 0
  const debitSavings = Number(bc.mdr_debit_savings_annual) || 0
  const mdrSavings = Number(bc.mdr_savings_annual_usd) || (creditSavings + debitSavings)
  const annualTPV = Number(bc.tpv_annual_usd) || 0

  // Costos actuales — sumados across verticals desde bc.verticals[]
  const bcVerticals = Array.isArray(bc.verticals) ? bc.verticals : []
  const costCreditNow = bcVerticals.reduce((s, v) => s + (Number(v.cost_mdr_credit_current) || 0), 0)
  const costDebitNow = bcVerticals.reduce((s, v) => s + (Number(v.cost_mdr_debit_current) || 0), 0)
  const costCreditNew = Math.max(0, costCreditNow - creditSavings)
  const costDebitNew = Math.max(0, costDebitNow - debitSavings)

  const roster = Array.isArray(inputs.psp_arena_roster) && inputs.psp_arena_roster.length > 0
    ? inputs.psp_arena_roster
    : PSP_ROSTER_DEFAULT
  const ranked = [...roster]
    .sort((a, b) => b.share - a.share)
    .map((p, i) => ({ ...p, rank: i + 1 }))

  return (
    <div className="slide theme-light">
      <SectionLabel>{t('leverMDR.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1300,
        color: 'var(--unity-black)',
      }}>
        {hasDebit ? (
          <>
            {t('leverMDR.creditWord')} {fmtPct(creditMdrNow, 2, lang)} → {fmtPct(creditMdrNew, 2, lang)}<br/>
            {debitPctMode ? (
              <>{t('leverMDR.debitWord')} {fmtPct(debitMdrPctNow, 2, lang)} → <span style={{ color: 'var(--yuno-blue)' }}>{fmtPct(debitMdrPctNew, 2, lang)}</span></>
            ) : (
              <>{t('leverMDR.debitWord')} {cs}{debitMdrNow.toFixed(2)} → <span style={{ color: 'var(--yuno-blue)' }}>{cs}{debitMdrNew.toFixed(2)}</span> {t('leverMDR.perTxSuffix')}</>
            )}
          </>
        ) : (
          <>
            {t('leverMDR.titleConnectorFrom')} {fmtPct(creditMdrNow, 2, lang)} {t('leverMDR.titleConnector')} {fmtPct(creditMdrNew, 2, lang)}
            <br/>
            {t('leverMDR.titleInLine')} <span style={{ color: 'var(--yuno-blue)' }}>{t('leverMDR.titleDiscountRate')}</span>
          </>
        )}
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 360, left: 80, fontSize: 18,
        color: 'var(--gray-alt)', maxWidth: 720, lineHeight: 1.5,
      }}>
        {t('leverMDR.body')} <strong style={{ color: 'var(--unity-black)' }}>{t('leverMDR.bodyStrong')}</strong>{t('leverMDR.bodyClose')}
      </div>

      {/* PSP Arena — replaces simple hoy-vs-yuno bars */}
      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 470, left: 80, right: 720, bottom: 130,
        padding: 24, background: 'var(--harmony-lilac)', borderRadius: 16,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: '#9CB22A',
              animation: 'splitPulseWin 1.4s ease-in-out infinite',
            }} />
            <span className="t-label" style={{ color: 'var(--unity-black)' }}>
              {t('leverMDR.arenaLabel')}
            </span>
          </div>
          <span className="mono" style={{
            fontSize: 10, color: 'var(--gray-alt)',
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            {t('leverMDR.arenaCaption')}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          {ranked.map((p) => (
            <PspRow key={p.name} row={p} isLeader={p.rank === 1} lang={lang} />
          ))}
        </div>

        <div style={{
          marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(40,42,48,0.12)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 16,
        }}>
          <div style={{ fontSize: 12, color: 'var(--gray-alt)', lineHeight: 1.4, maxWidth: 460 }}>
            {t('leverMDR.arenaFooter')}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="t-label" style={{
              fontSize: 9, color: 'var(--gray-alt)', marginBottom: 2,
            }}>{hasDebit ? t('leverMDR.creditBlendedLabel') : t('leverMDR.blendedLabel')}</div>
            <div className="num-tabular" style={{
              fontSize: 26, fontWeight: 300, color: 'var(--yuno-blue)',
              letterSpacing: '-0.02em', lineHeight: 1,
            }}>
              {fmtPct(creditMdrNew, 2, lang)}
              <span style={{
                fontSize: 11, color: 'var(--gray-alt)', marginLeft: 8,
                textDecoration: 'line-through', fontWeight: 400,
              }}>{fmtPct(creditMdrNow, 2, lang)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right column · stacked sections per método (crédito / débito) +
          total al fondo. Cada sección muestra costo hoy y ahorro de forma
          explícita para que el AE pueda señalar cada número uno a uno. */}
      <div className="anim-in anim-in-4" style={{
        position: 'absolute', top: 360, right: 80, width: 580, bottom: 110,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <MethodCard
          accent="#3E4FE0"
          title={t('leverMDR.cardTitleCredit')}
          rateFrom={fmtPct(creditMdrNow, 2, lang)}
          rateTo={fmtPct(creditMdrNew, 2, lang)}
          rateUnit={t('leverMDR.rateUnitCredit')}
          costNow={m(costCreditNow)}
          costNew={m(costCreditNew)}
          savings={m(creditSavings)}
          formula={`TPVcrédito × ${fmtPct(creditMdrNow, 2, lang)} − TPVcrédito × ${fmtPct(creditMdrNew, 2, lang)}`}
          lang={lang}
        />
        {hasDebit && (
          <MethodCard
            accent="#5967E4"
            title={t('leverMDR.cardTitleDebit')}
            rateFrom={debitPctMode ? fmtPct(debitMdrPctNow, 2, lang) : `${cs}${debitMdrNow.toFixed(2)}`}
            rateTo={debitPctMode ? fmtPct(debitMdrPctNew, 2, lang) : `${cs}${debitMdrNew.toFixed(2)}`}
            rateUnit={debitPctMode ? t('leverMDR.rateUnitDebitPct') : t('leverMDR.rateUnitDebit')}
            costNow={m(costDebitNow)}
            costNew={m(costDebitNew)}
            savings={m(debitSavings)}
            formula={debitPctMode
              ? `TPVdébito × ${fmtPct(debitMdrPctNow, 2, lang)} − TPVdébito × ${fmtPct(debitMdrPctNew, 2, lang)}`
              : `aprobadas-débito × (${cs}${debitMdrNow.toFixed(2)} − ${cs}${debitMdrNew.toFixed(2)})`}
            lang={lang}
          />
        )}
        <div style={{
          padding: '12px 18px', borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(224,237,128,0.18), rgba(62,79,224,0.18))',
          border: '1px solid rgba(224,237,128,0.40)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span className="t-label" style={{ color: 'var(--unity-black)', fontSize: 11 }}>
            {t('leverMDR.totalSavingsLabel')}
          </span>
          <span className="num-tabular" style={{
            fontSize: 34, fontWeight: 300, color: 'var(--yuno-blue-deep)',
            letterSpacing: '-0.02em',
          }}>{m(mdrSavings)}</span>
        </div>
      </div>

      <SlideFooter section={t('leverMDR.footerSection')} pageNum={pageNum} total={total} />
    </div>
  )
}

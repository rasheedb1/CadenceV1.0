import { useState, useEffect, useRef } from 'react'
import { Bank, Handshake, Storefront } from '@phosphor-icons/react'
import { resolveMerchant } from '../data/merchants.generated'
import { resolveBank } from '../data/banks.generated'
import { resolvePartner } from '../data/partners.generated'

const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    // Sit content in the upper third so there is real room for the dropdown
    // below the input on short viewports (~620px). Was 'center' which pushed
    // the input to ~75% of the viewport height with the dropdown clipping.
    justifyContent: 'flex-start',
    paddingTop: 'clamp(48px, 9vh, 140px)',
    background: 'radial-gradient(ellipse at 30% 20%, #1726A6 0%, #000000 40%, #000000 100%)',
    position: 'relative',
    overflow: 'hidden',
  },
  // Animated orbs
  orb1: {
    position: 'absolute',
    top: '-20%',
    left: '-15%',
    width: '70vw',
    height: '70vw',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(62,79,224,0.25) 0%, rgba(62,79,224,0) 60%)',
    filter: 'blur(60px)',
    animation: 'float 12s ease-in-out infinite',
  },
  orb2: {
    position: 'absolute',
    bottom: '-30%',
    right: '-15%',
    width: '60vw',
    height: '60vw',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(62,79,224,0.18) 0%, rgba(62,79,224,0) 60%)',
    filter: 'blur(60px)',
    animation: 'float 15s ease-in-out infinite reverse',
  },
  stripe1: {
    position: 'absolute',
    top: '-30%',
    right: '-8%',
    width: '42%',
    height: '160%',
    background: 'linear-gradient(160deg, rgba(62,79,224,0.15) 0%, rgba(189,195,246,0.06) 100%)',
    transform: 'rotate(-20deg)',
    borderRadius: '80px',
  },
  stripe2: {
    position: 'absolute',
    top: '-20%',
    right: '8%',
    width: '25%',
    height: '140%',
    background: 'linear-gradient(160deg, rgba(189,195,246,0.08) 0%, rgba(124,137,239,0.03) 100%)',
    transform: 'rotate(-20deg)',
    borderRadius: '80px',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'clamp(24px, 4.5vh, 44px)',
    padding: '0 24px',
    width: '100%',
    maxWidth: '860px',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '12px',
    padding: '9px 18px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '100px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '1.8px',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(12px)',
    animation: 'fadeInUp 0.6s ease-out',
  },
  badgeDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #3E4FE0 0%, #BDC3F6 100%)',
    boxShadow: '0 0 10px rgba(62,79,224,0.6)',
    animation: 'pulse 2s infinite',
  },
  yunoLogo: {
    height: '18px',
    opacity: 0.95,
  },
  divider: {
    width: '1px',
    height: '12px',
    background: 'rgba(255,255,255,0.25)',
  },
  titleStack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(44px, 5.4vw, 74px)',
    fontWeight: 700,
    letterSpacing: '-1.6px',
    lineHeight: 1.02,
    textAlign: 'center',
    maxWidth: '14em',
    color: '#fff',
    animation: 'fadeInUp 0.7s ease-out 0.1s both',
  },
  titleAccent: {
    background: 'linear-gradient(135deg, #3E4FE0 0%, #BDC3F6 50%, #BDC3F6 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundSize: '200% 200%',
    animation: 'gradientShift 8s ease-in-out infinite',
  },
  subtitle: {
    fontSize: '16px',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.58)',
    textAlign: 'center',
    maxWidth: '520px',
    lineHeight: 1.65,
    animation: 'fadeInUp 0.7s ease-out 0.2s both',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },
  searchWrapper: {
    position: 'relative',
    width: '100%',
    maxWidth: '540px',
    animation: 'fadeInUp 0.7s ease-out 0.3s both',
  },
  inputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '16px',
    padding: '6px',
    transition: 'all 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
    backdropFilter: 'blur(24px)',
  },
  inputGroupFocused: {
    background: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(62,79,224,0.55)',
    boxShadow: '0 0 0 4px rgba(62,79,224,0.12), 0 12px 40px rgba(62,79,224,0.22)',
  },
  input: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 400,
    fontFamily: 'var(--font)',
    padding: '16px 22px',
    letterSpacing: '0',
  },
  button: {
    background: 'linear-gradient(135deg, #3E4FE0 0%, #5967E4 50%, #5967E4 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    padding: '15px 28px',
    fontSize: '14px',
    fontWeight: 700,
    fontFamily: 'var(--font)',
    cursor: 'pointer',
    letterSpacing: '0.2px',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    backgroundSize: '200% 200%',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 12px)',
    left: 0,
    right: 0,
    // Reserve ~360px above the input (badge + title + subtitle + paddings)
    // so the dropdown bottom stays inside the viewport at any height.
    // Hard floor at 160px so very short windows still show a couple of items.
    maxHeight: 'max(160px, min(360px, calc(100vh - 360px)))',
    overflowY: 'auto',
    background: 'rgba(0,0,0,0.92)',
    backdropFilter: 'blur(28px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px',
    padding: '8px',
    boxShadow: '0 28px 72px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02) inset',
    zIndex: 10,
    animation: 'fadeInUp 0.2s ease-out',
  },
  dropdownItem: {
    padding: '11px 14px',
    fontSize: '14px',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.88)',
    borderRadius: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    transition: 'background 0.12s ease',
  },
  dropdownLogo: {
    width: '32px',
    height: '22px',
    objectFit: 'contain',
    display: 'block',
    flexShrink: 0,
    opacity: 0.9,
    // Render every merchant wordmark as white on the dark dropdown row,
    // same treatment used in the slide merchant nodes. Keeps dark-asset
    // brands (Hostinger, United Airlines, etc.) from disappearing.
    filter: 'brightness(0) invert(1)',
  },
  // Phosphor Bank glyph used next to the synthetic "Banking" vertical
  // entry so it reads as a category marker, not a brand wordmark.
  dropdownBankIcon: {
    color: 'rgba(255,255,255,0.85)',
    flexShrink: 0,
    marginLeft: '5px',
  },
  dropdownLogoEmpty: {
    width: '36px',
    height: '28px',
    borderRadius: '6px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px dashed rgba(255,255,255,0.1)',
    flexShrink: 0,
  },
  dropdownName: {
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontWeight: 600,
    letterSpacing: '-0.1px',
  },
  // Small grey tag at the right of each dropdown row indicating the
  // audience type (Merchant / Acquiring Bank / Partner). Visual only —
  // not clickable. Uses a pale grey so it doesn't compete with the name.
  dropdownTypeTag: {
    flexShrink: 0,
    fontSize: '10.5px',
    fontWeight: 600,
    letterSpacing: '1.2px',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)',
    padding: '3px 9px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  bottom: {
    position: 'absolute',
    bottom: '36px',
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.32)',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    animation: 'fadeIn 1s ease-out 0.5s both',
  },
  bottomDivider: {
    width: '1px',
    height: '10px',
    background: 'rgba(255,255,255,0.16)',
  },
}

// Parses a simple one-column CSV (header row + one name per line) into
// entries tagged with the given audience type.
function parseNameCsv(text, type) {
  return text
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => ({ name: line.split(',')[0]?.trim(), type }))
    .filter((m) => m.name)
}

const TYPE_LABEL = {
  merchant: 'Merchant',
  bank: 'Acquiring Bank',
  partner: 'Partner',
}

// Synthetic "Banking" entry — surfaces the generic Banking deck in the
// dropdown so any bank not in banks.csv can still pull up the unbranded
// vertical pitch. Routed as type='bank' with name='Banking', which the
// SlideCover sentinel uses to render the generic header (no merchant
// logo, no possessive greeting).
const SYNTHETIC_ENTRIES = [
  { name: 'Banking', type: 'bank', tag: 'Generic vertical' },
]

export default function LandingPage({ onGenerate }) {
  const [merchant, setMerchant] = useState('')
  const [focused, setFocused] = useState(false)
  const [entries, setEntries] = useState([]) // merchants + banks + partners
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const [hoveringBtn, setHoveringBtn] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/ss-deck-assets/merchants.csv').then((r) => r.text()).then((t) => parseNameCsv(t, 'merchant')),
      fetch('/ss-deck-assets/banks.csv').then((r) => r.text()).then((t) => parseNameCsv(t, 'bank')),
      fetch('/ss-deck-assets/partners.csv').then((r) => r.text()).then((t) => parseNameCsv(t, 'partner')),
    ]).then(([m, b, p]) => setEntries([...SYNTHETIC_ENTRIES, ...m, ...b, ...p]))
  }, [])

  const filtered = merchant.trim()
    ? entries
        .filter((e) => e.name.toLowerCase().includes(merchant.toLowerCase()))
        .slice(0, 8)
    : []

  const handleSubmit = (e) => {
    e.preventDefault()
    const pick = filtered[highlightIdx]
    if (pick) {
      onGenerate({ name: pick.name, type: pick.type })
    } else if (merchant.trim()) {
      // Free-text fallback: assume merchant.
      onGenerate({ name: merchant.trim(), type: 'merchant' })
    }
  }

  const handleKey = (e) => {
    if (!showDropdown || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    }
  }

  return (
    <div style={styles.container} className="noise-overlay">
      <div style={styles.orb1} />
      <div style={styles.orb2} />
      <div style={styles.stripe1} />
      <div style={styles.stripe2} />

      <div style={styles.content}>
        <div style={styles.badge}>
          <div style={styles.badgeDot} />
          <img src="/ss-deck-assets/assets/yuno-logo-white.svg" alt="Yuno" style={styles.yunoLogo} />
        </div>

        <div style={styles.titleStack}>
          <h1 style={styles.title}>
            Powering financial infrastructure<br />
            <span style={styles.titleAccent}>at global scale.</span>
          </h1>

          <div style={styles.subtitle}>
            <span>Select a merchant, acquirer bank, or partner to generate their tailored brief.</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={styles.searchWrapper}>
          <div
            style={{
              ...styles.inputGroup,
              ...(focused ? styles.inputGroupFocused : {}),
            }}
          >
            <input
              style={styles.input}
              type="text"
              placeholder="Search merchant, bank, or partner..."
              value={merchant}
              onChange={(e) => {
                setMerchant(e.target.value)
                setShowDropdown(true)
                setHighlightIdx(0)
              }}
              onFocus={() => {
                setFocused(true)
                setShowDropdown(true)
              }}
              onBlur={() => {
                setFocused(false)
                setTimeout(() => setShowDropdown(false), 200)
              }}
              onKeyDown={handleKey}
              autoFocus
              autoComplete="off"
            />
            <button
              type="submit"
              style={{
                ...styles.button,
                transform: hoveringBtn ? 'scale(1.03)' : 'scale(1)',
                boxShadow: hoveringBtn
                  ? '0 8px 32px rgba(62,79,224,0.5), 0 0 0 1px rgba(255,255,255,0.2) inset'
                  : '0 4px 20px rgba(62,79,224,0.3)',
              }}
              onMouseEnter={() => setHoveringBtn(true)}
              onMouseLeave={() => setHoveringBtn(false)}
            >
              Let's start →
            </button>
          </div>

          {showDropdown && filtered.length > 0 && (
            <div style={styles.dropdown}>
              {filtered.map((m, i) => {
                // Resolve a white-silhouette logo based on the entry type.
                // Falls back to the category icon when the manifest has no
                // logo path (e.g. small regional banks with no sourceable
                // asset).
                const resolved =
                  m.type === 'merchant' ? resolveMerchant(m.name)
                  : m.type === 'bank' ? resolveBank(m.name)
                  : m.type === 'partner' ? resolvePartner(m.name)
                  : null
                const CategoryIcon = m.type === 'bank' ? Bank : m.type === 'partner' ? Handshake : Storefront
                return (
                  <div
                    key={`${m.type}:${m.name}`}
                    style={{
                      ...styles.dropdownItem,
                      background:
                        i === highlightIdx ? 'rgba(62,79,224,0.12)' : 'transparent',
                    }}
                    onMouseEnter={() => setHighlightIdx(i)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onGenerate({ name: m.name, type: m.type })
                    }}
                  >
                    {resolved?.logo ? (
                      <img src={resolved.logo} alt="" style={styles.dropdownLogo} />
                    ) : (
                      <CategoryIcon size={22} weight="regular" style={styles.dropdownBankIcon} aria-hidden />
                    )}
                    <span style={styles.dropdownName}>{m.name}</span>
                    <span style={styles.dropdownTypeTag}>{m.tag || TYPE_LABEL[m.type]}</span>
                  </div>
                )
              })}
            </div>
          )}
        </form>
      </div>

    </div>
  )
}

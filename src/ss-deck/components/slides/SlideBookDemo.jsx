const styles = {
  slide: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: 'var(--font)',
  },
  bg: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse at 20% 30%, #3E4FE0 0%, #1726A6 35%, #0B0E3E 70%, #000000 100%)',
  },
  orb1: {
    position: 'absolute',
    bottom: '-30%',
    left: '-15%',
    width: '70vw',
    height: '70vw',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(62,79,224,0.25) 0%, transparent 60%)',
    filter: 'blur(80px)',
    animation: 'float 12s ease-in-out infinite',
  },
  orb2: {
    position: 'absolute',
    top: '-20%',
    right: '-15%',
    width: '50vw',
    height: '50vw',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(62,79,224,0.18) 0%, transparent 60%)',
    filter: 'blur(80px)',
    animation: 'float 14s ease-in-out infinite reverse',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    height: '100%',
    padding: 'clamp(32px, 4%, 72px) clamp(40px, 5%, 96px) clamp(60px, 6.5%, 100px)',
    display: 'flex',
    flexDirection: 'column',
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  yunoLogo: {
    height: 'clamp(16px, 1.5vw, 26px)',
    opacity: 0.9,
  },
  main: {
    flex: 1,
    display: 'flex',
    gap: '4%',
    alignItems: 'center',
    paddingTop: 'clamp(20px, 2vw, 40px)',
  },
  left: {
    flex: 1.1,
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(18px, 2vw, 32px)',
  },
  sectionLabel: {
    fontSize: 'clamp(10px, 0.75vw, 12px)',
    fontWeight: 700,
    letterSpacing: '2.2px',
    textTransform: 'uppercase',
    color: 'rgba(189,195,246,0.78)',
  },
  sectionDivider: {
    width: '48px',
    height: '1px',
    background: 'rgba(255,255,255,0.22)',
    marginTop: '10px',
  },
  title: {
    fontFamily: 'var(--font-display)',
    // Reduced from 34–72px so the one-line composition fits at 1920px.
    fontSize: 'clamp(26px, 2.7vw, 50px)',
    fontWeight: 700,
    letterSpacing: '-1px',
    lineHeight: 1.05,
    color: '#fff',
    whiteSpace: 'nowrap',
  },
  titleFaded: {
    color: 'rgba(155,165,255,0.55)',
  },
  subtitle: {
    fontSize: 'clamp(14px, 1.1vw, 18px)',
    fontWeight: 400,
    lineHeight: 1.6,
    color: 'rgba(255,255,255,0.72)',
    maxWidth: '92%',
  },
  statsRow: {
    display: 'flex',
    gap: 'clamp(32px, 3vw, 56px)',
    marginTop: 'clamp(12px, 1.2vw, 20px)',
    paddingTop: 'clamp(20px, 2vw, 32px)',
    borderTop: '1px solid rgba(255,255,255,0.12)',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  statNum: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(30px, 2.9vw, 54px)',
    fontWeight: 400,
    color: '#fff',
    letterSpacing: '-1px',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  statLabel: {
    fontSize: 'clamp(11.5px, 0.85vw, 14.5px)',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: '0.4px',
    lineHeight: 1.35,
    marginTop: '6px',
  },
  right: {
    flex: 0.9,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCard: {
    background: 'linear-gradient(160deg, rgba(11,14,62,0.75) 0%, rgba(0,0,0,0.92) 100%)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 'clamp(18px, 1.6vw, 28px)',
    padding: 'clamp(20px, 2.2vw, 38px)',
    backdropFilter: 'blur(24px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'clamp(14px, 1.4vw, 24px)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.45)',
    width: '100%',
    maxWidth: 'clamp(320px, 30vw, 520px)',
  },
  qrLabel: {
    fontSize: 'clamp(10px, 0.7vw, 12px)',
    fontWeight: 700,
    letterSpacing: '2.2px',
    textTransform: 'uppercase',
    color: 'rgba(155,165,255,0.82)',
  },
  qrHeadline: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(17px, 1.35vw, 25px)',
    fontWeight: 700,
    color: '#fff',
    textAlign: 'center',
    letterSpacing: '-0.1px',
    lineHeight: 1.3,
  },
  qrImgWrap: {
    width: '100%',
    aspectRatio: '1 / 1',
    background: '#fff',
    borderRadius: 'clamp(12px, 1vw, 18px)',
    padding: 'clamp(12px, 1.2vw, 20px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  },
  qrImg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
  },
  qrUrl: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(14px, 1.05vw, 20px)',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0px',
  },
  qrFooter: {
    fontSize: 'clamp(9px, 0.65vw, 11px)',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  slideNumber: {
    position: 'absolute',
    bottom: 'clamp(18px, 2.4%, 40px)',
    left: 'clamp(36px, 4.8%, 90px)',
    fontSize: 'clamp(10px, 0.72vw, 12px)',
    fontWeight: 700,
    color: 'rgba(255,255,255,0.3)',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '1.5px',
    zIndex: 2,
  },
}

export default function SlideBookDemo({ data }) {
  return (
    <div style={styles.slide}>
      <div style={styles.bg} />
      <div style={styles.orb1} />
      <div style={styles.orb2} />

      <div style={styles.content}>
        <div style={styles.topRow}>
          <img src="/ss-deck-assets/assets/yuno-logo-white.svg" alt="Yuno" style={styles.yunoLogo} />
        </div>

        <div style={styles.main}>
          <div style={styles.left}>
            <div>
              <div style={styles.sectionLabel}>The Ask</div>
              <div style={styles.sectionDivider} />
            </div>

            <h2 style={styles.title}>
              Let's build the payment stack of the internet economy,{' '}
              <span style={styles.titleFaded}>together</span>
            </h2>

            <p style={styles.subtitle}>
              Yuno will be{' '}
              <strong style={{ color: '#fff', fontWeight: 600 }}>{data.COMPANY_NAME}</strong>'s{' '}
              last payment integration ever
            </p>

            <div style={styles.statsRow}>
              {[
                { n: '+3–8%', l: 'authorization uplift' },
                { n: '25%+', l: 'of declines recovered' },
                { n: 'Weeks', l: 'to launch new markets' },
              ].map((s) => (
                <div key={s.l} style={styles.stat}>
                  <div style={styles.statNum}>{s.n}</div>
                  <div style={styles.statLabel}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.right}>
            <div style={styles.qrCard}>
              <span style={styles.qrLabel}>Book a Demo</span>
              <div style={styles.qrHeadline}>
                Scan to schedule a<br />follow-up this week.
              </div>
              <div style={styles.qrImgWrap}>
                <img
                  src="/ss-deck-assets/book-a-demo-qr.png"
                  alt="Book a demo QR code"
                  style={styles.qrImg}
                />
              </div>
              <div style={styles.qrUrl}>y.uno/book-a-demo</div>
              <div style={styles.qrFooter}>Point your camera · We'll bring the right people</div>
            </div>
          </div>
        </div>
      </div>

      <div style={styles.slideNumber}>08 / 09</div>
    </div>
  )
}

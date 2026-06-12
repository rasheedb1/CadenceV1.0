// Ambient module declarations for the JSX-only SS-deck module.
// The slide components are ported verbatim from yuno-sales-pitch-maker
// (which is JS-only) so we keep them as .jsx instead of rewriting to TSX.
// This file lets TS imports through without losing strict-mode coverage
// for the rest of Chief.

declare module '@/ss-deck/SSDeckRoute' {
  const SSDeckRoute: React.ComponentType
  export default SSDeckRoute
}

declare module '@/ss-deck/SSDeckPrintRoute' {
  const SSDeckPrintRoute: React.ComponentType
  export default SSDeckPrintRoute
}

// Ambient module declarations for the JSX-only workshops-bc module.
// Mirrors src/ss-deck/ss-deck.d.ts so TS imports of the lazy route
// boundaries pass strict-mode without rewriting the JSX to TSX.

declare module '@/workshops-bc/WorkshopRoute' {
  const WorkshopRoute: React.ComponentType
  export default WorkshopRoute
}

declare module '@/workshops-bc/WorkshopPrintRoute' {
  const WorkshopPrintRoute: React.ComponentType
  export default WorkshopPrintRoute
}

declare module '@/workshops-bc/PricingRoute' {
  const PricingRoute: React.ComponentType
  export default PricingRoute
}

declare module '@/workshops-bc/PricingPrintRoute' {
  const PricingPrintRoute: React.ComponentType
  export default PricingPrintRoute
}

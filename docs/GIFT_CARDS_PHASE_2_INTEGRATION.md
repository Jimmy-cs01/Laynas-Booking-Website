# Gift Cards — required Phase 2 integration

Urgent standalone feature added November 20, 2026 using the original production design. This release does not incorporate the separate `codex/phase2-design-prototype` work.

All future Phase 2 work must retain:

- Public `/gift-cards` route, direct navigation/refresh and the current `.html` alias convention.
- Visible **Gift Cards** navigation entry on desktop and mobile, alongside Reviews and existing destinations.
- Exact Square gift-card purchase destination: `https://app.squareup.com/gift/MLPQE4SK8RTXT/order`.
- Accessible purchase CTA and visible keyboard focus, readable mobile layout and secure Square handoff explanation.
- Existing Square Appointments booking links, which are separate from gift-card purchasing.

Restyle the Gift Cards page to the approved future design system during Phase 2. Preserve the actual content and avoid inventing denominations, expiration, redemption, refund or offer terms. Payment collection remains on Square. Include Gift Cards in Phase 2.2 navigation, relevant page styling, and Phase 2.6 route/checkout-link regression checks.

When bringing production changes into the Phase 2 branch, carry this focused feature forward. Do not overwrite the new page/nav entry with older prototype markup. The Phase 2 prototype and design documentation remain preserved in their original working checkout.

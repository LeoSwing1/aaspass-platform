# AasPass Cross-App UI System

This is a UI/UX-only block. Business logic, API contracts, pricing, payment semantics and permission semantics are not changed.

## Customer — Flutter
Premium grocery-commerce hierarchy: location → search → promo → category → nearby vendors → product rails → basket.

## Vendor — Flutter
Mobile-first store operations: store health → order queue → catalog → store → more/finance/support.

## Delivery — Flutter
Availability → nearby jobs → pickup/drop → earnings → profile/safety.

## Support + Admin — Web
Dense desktop-first command center layouts with stronger cards, tables, hierarchy and responsive states.

## Accessibility / layout
- minimum 48dp primary controls
- avoid fixed-height text containers where text can wrap
- responsive grids based on available width
- content scrolls behind sticky actions
- semantic labels on icon-only controls

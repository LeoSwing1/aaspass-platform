# AasPass UI/UX Block — Test Checklist

Scope: visual and interaction polish only. Business logic, API contracts, pricing, authentication semantics, payment semantics and permissions are unchanged.

## Customer — Flutter
- Test 360x640 and larger phones.
- Check Shop by Category and product cards for zero overflow.
- Check 48dp+ touch targets.
- Verify large system font layouts.
- Verify long vendor/product names ellipsize safely.
- Verify banner swipe/auto-advance and reduced-motion behavior.
- Verify location blocked/denied/settings states are understandable.
- Verify checkout sticky action stays above system navigation.
- Verify skeleton/empty/error states where present.

## Vendor — Flutter
- Test login card at 360dp width.
- Test dashboard hero and KPI cards with large fonts.
- Test order filters and cards in portrait.
- Test catalog list with long product names.
- Test store controls and bottom navigation safe area.
- Verify no UI-only refactor changes API endpoint behavior.

## Delivery Partner — Flutter
- Test online/offline hero state.
- Test job cards with long addresses.
- Test earnings cards on narrow phones.
- Test profile cards and bottom navigation.
- Verify location-disabled state does not overflow.
- Verify delivery API callbacks remain unchanged.

## Web Support + Admin
- Test 1024px, 1280px and 1440px desktop widths.
- Confirm dense cards/tables remain readable.
- Confirm responsive controls do not overlap.
- Confirm support/admin logic and permissions are unchanged.

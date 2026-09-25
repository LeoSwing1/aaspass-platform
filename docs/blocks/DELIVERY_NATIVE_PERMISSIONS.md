# Delivery Partner Native Permissions

AndroidManifest.xml should include:
- ACCESS_FINE_LOCATION
- ACCESS_COARSE_LOCATION

Add background location only after the exact Android background-location product flow and disclosure are approved; do not request it by default.

iOS Info.plist:
- NSLocationWhenInUseUsageDescription

Background location, if later required for active deliveries, must follow the platform's background-location policy and be limited to an active delivery workflow.

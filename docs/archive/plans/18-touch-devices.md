# Plan 18: Touch Gestures & Device Emulation Profiles

**Priority:** Tier 3 — Lower Impact / Niche
**Personas:** Mobile App Developer (PWAs, responsive sites)
**New commands:** `gesture`, `devices`

---

## Problem

`responsive` handles viewport breakpoints, but there's no built-in library of real device profiles with accurate UA/DPR/touch settings. And there are no touch gesture commands — pinch-to-zoom, swipe, long-press — needed for testing mobile-specific interactions.

## Design

### Device Profiles

#### `browse devices` command

```bash
# List all available device profiles
browse devices list

# Search for a device
browse devices search "iphone"

# Show device details
browse devices info "iPhone 15 Pro"

# Apply a device profile
browse goto https://example.com --device "iPhone 15 Pro"
```

#### Built-in Device Database

Maintain a curated set of ~30 popular devices:

```json
{
  "iPhone 15 Pro": {
    "viewport": { "width": 393, "height": 852 },
    "deviceScaleFactor": 3,
    "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)...",
    "isMobile": true,
    "hasTouch": true,
    "defaultBrowserType": "webkit"
  },
  "Pixel 8": {
    "viewport": { "width": 412, "height": 915 },
    "deviceScaleFactor": 2.625,
    "userAgent": "Mozilla/5.0 (Linux; Android 14; Pixel 8)...",
    "isMobile": true,
    "hasTouch": true,
    "defaultBrowserType": "chromium"
  }
}
```

**Categories:**
- iPhones: 12, 13, 14, 15 (regular + Pro + Pro Max)
- iPads: Air, Pro 11", Pro 12.9"
- Android phones: Pixel 7/8, Samsung Galaxy S23/S24, OnePlus
- Android tablets: Samsung Galaxy Tab S9
- Other: Surface Pro, Kindle Fire

Supplement with Playwright's built-in `playwright.devices` where available, extend with newer models.

### Touch Gestures

#### `browse gesture` command

```bash
# Swipe left
browse gesture swipe left [--speed fast|slow] [--distance 200]

# Swipe on a specific element
browse gesture swipe up @e3

# Pinch to zoom
browse gesture pinch in [--scale 0.5]   # zoom out
browse gesture pinch out [--scale 2.0]  # zoom in

# Long press
browse gesture long-press @e5 [--duration 1000]

# Double tap
browse gesture double-tap @e3

# Drag and drop
browse gesture drag @e3 --to @e5
browse gesture drag @e3 --offset 200,100

# Custom touch sequence
browse gesture touch --points "100,200 → 100,400" --duration 500
```

### Implementation

**File:** `src/commands/gesture.ts` (~250 lines)
**File:** `src/commands/devices.ts` (~100 lines)
**File:** `src/device-profiles.ts` (~200 lines, device database)
**File:** `src/touch-engine.ts` (~300 lines)

#### Device Profiles

1. **Static database** in `src/device-profiles.ts`:
   - Export a `Map<string, DeviceProfile>` with ~30 entries
   - Include viewport, DPR, UA, touch, mobile flags
   - Merge with `playwright.devices` for completeness

2. **Profile application**:
   - When `--device` is used on `goto` or `viewport`, look up the profile
   - Apply all settings via Playwright context options
   - Enhance existing `--device` flag (currently takes Playwright device names)

#### Touch Gestures

All gestures use CDP `Input.dispatchTouchEvent` for precise control:

1. **Swipe**:
   - Calculate start/end coordinates based on direction and element position
   - Dispatch sequence: `touchStart` → multiple `touchMove` events (interpolated) → `touchEnd`
   - `--speed` controls the time between move events
   - `--distance` controls total pixel distance

2. **Pinch**:
   - Two-finger gesture: dispatch two simultaneous touch points
   - Points move toward each other (pinch in) or apart (pinch out)
   - `--scale` determines final zoom level

3. **Long press**:
   - `touchStart` → wait `--duration` ms → `touchEnd`
   - Default duration: 500ms (matches Android long-press threshold)

4. **Double tap**:
   - Two rapid `touchStart` → `touchEnd` sequences, ~100ms apart

5. **Drag and drop**:
   - Resolve source and target positions
   - `touchStart` on source → slow `touchMove` to target → `touchEnd`

6. **Custom touch sequence**:
   - Parse coordinate path and duration
   - Interpolate touch move events along the path

### Integration with Flows

```json
{
  "steps": [
    { "goto": "{{base_url}}/gallery", "device": "iPhone 15 Pro" },
    { "gesture": { "type": "swipe", "direction": "left" } },
    { "gesture": { "type": "pinch", "direction": "out", "scale": 2.0 } },
    { "screenshot": true }
  ]
}
```

### Browser Compatibility

- Touch events: Chromium and WebKit support CDP touch dispatch
- Firefox: limited touch support via `page.touchscreen` API
- Pinch gesture: Chromium-only (requires multi-touch CDP)
- Swipe/tap: all browsers via `page.touchscreen`

## Testing

**File:** `test/gesture.test.ts`

- Test coordinate calculation for each gesture type
- Test touch event sequence generation
- Test device profile lookup and application
- Mock CDP session and verify touch event dispatch

**File:** `test/devices.test.ts`

- Test device search and listing
- Test profile merging with Playwright defaults
- Test device info output format

## Dependencies

- No new dependencies — uses CDP `Input.dispatchTouchEvent`

## Estimated Scope

- `src/commands/gesture.ts` — ~250 lines
- `src/commands/devices.ts` — ~100 lines
- `src/device-profiles.ts` — ~200 lines
- `src/touch-engine.ts` — ~300 lines
- `test/gesture.test.ts` — ~200 lines
- `test/devices.test.ts` — ~100 lines
- Help, protocol, daemon wiring — ~60 lines

# BSEED Development App - Overview

**Created:** 2026-01-30
**Purpose:** Separate minimal app for BSEED wall switch development with full debugging support

## Why This App Exists

The main Universal Tuya Zigbee app (`com.tuya.zigbee`) became too large (14MB with 109 drivers) to use `homey app run` for debugging. Homey's remote debug session has a ~10MB payload limit, causing "Payload Too Large" errors.

**Solution:** Created this minimal development app with only the BSEED drivers being actively developed.

## What's Included

### Drivers (3 total)
1. **wall_switch_1gang_1way** - Single gang wall switch (TS0001)
   - Manufacturer: _TZ3000_blhvsaqf, _TZ3000_ysdv91bk
   - ZCL-only mode

2. **wall_switch_2gang_1way** - Dual gang wall switch (TS0012/TS0003)
   - Manufacturer: _TZ3000_xk5udnd6, _TZ3000_l9brjwau
   - Custom gang names, backlight control
   - **Has debug settings** showing last action, gang status, protocol mode

3. **wall_dimmer_1gang_1way** - Dimmer switch (TS0601/TS004F)
   - Manufacturer: _TZE200_*, _TZ3000_4fjiwweb
   - Tuya DP protocol support

### Library Structure

The app includes necessary libraries from the main app:

```
lib/
├── devices/        408KB - BaseHybridDevice, HybridSwitchBase, TuyaHybridDevice
├── tuya/          716KB - Tuya protocol support, EF00 manager, DP parsers
├── utils/         444KB - Helper functions, data parsing
├── managers/      312KB - Flow cards, capabilities management
├── mixins/         64KB - PhysicalButtonMixin, VirtualButtonMixin
├── helpers/       192KB - Device data helpers
├── clusters/       92KB - Custom ZigBee clusters
└── other/         ~800KB - Protocol handlers, flow management, etc.
```

**Total lib size:** 2.9MB (optimized from original 5.2MB)

### What Was Removed from lib/

To keep the app small, these were removed (not needed for wall switches):

- ❌ `lib/battery/` - Wall switches don't have batteries
- ❌ `lib/data/` - Fingerprint databases (672KB)
- ❌ `lib/analytics/`, `lib/discovery/`, `lib/emergency/`
- ❌ `lib/intelligent/`, `lib/lighting/` (RGB control)
- ❌ `lib/ota/`, `lib/pairing/`, `lib/security/`
- ❌ `lib/smartadapt/`, `lib/templates/`, `lib/xiaomi/`
- ❌ Device classes: HybridSensorBase, ButtonDevice, HybridPlugBase, etc.
- ❌ Large data files: DeviceFingerprintDB.js, TuyaDataPoints*.js

## Size Optimization Journey

```
Original universal app:     14.0 MB (109 drivers)
├─ app.json:                 1.9 MB (77k lines)
├─ lib/:                     4.8 MB
├─ drivers:                  4.8 MB
└─ node_modules:             2.1 MB

Initial BSEED app:           7.9 MB (3 drivers)
├─ app.json:                27 KB (967 lines)
├─ lib/:                     5.2 MB
├─ drivers:                 312 KB
└─ node_modules:             1.7 MB

After lib cleanup:           5.4 MB
├─ lib/ reduced to:          2.9 MB

Final optimized:             5.1 MB ✨
├─ Removed test files
├─ Cleaned changelog
├─ Optimized assets
```

## Build Size Breakdown

```
Total: 5.1 MB
├── lib/              3.0 MB (59%)  Core framework
├── node_modules/     1.7 MB (33%)  Runtime dependencies
├── drivers/          324 KB (6%)   3 drivers + assets
└── other/            ~100 KB (2%)  app.json, package files
```

### Why 5.1MB is Reasonable

The size comes from:

1. **BaseHybridDevice** (167KB / 4204 lines) - Auto-detects Tuya DP vs ZCL protocol
2. **Tuya Protocol Stack** (716KB) - EF00 cluster, DP mappings, parsers
3. **ZigBee Libraries** (1.1MB) - homey-zigbeedriver + zigbee-clusters
4. **Universal Compatibility** - Supports multiple manufacturers/protocols

**Alternative:** Pure ZCL drivers would be ~2MB but lose Tuya DP support and advanced features.

## How to Use

### Development Commands

```bash
cd /Users/attilla/dev/homey/bseed

# Run with live logs (works!)
homey app run

# Install to Homey
homey app install

# Build
homey app build

# Validate
homey app validate
```

### Debugging wall_switch_2gang_1way

The 2-gang driver includes debug output in device settings:

1. Install/run the app
2. Open device in Homey app
3. Go to Settings → "🔍 Debug Information"
4. See real-time updates:
   - **Last Action**: What command was executed
   - **Gang 1/2 Status**: Current ON/OFF state
   - **Protocol Mode**: Tuya DP or ZCL

### Viewing Logs

When using `homey app run`:
- Live logs appear in terminal
- Chrome DevTools debugger available at `about://inspect`
- Press Ctrl+C to stop

## Development History

### Issue: Gang Control Problem

The wall_switch_2gang_1way driver had an issue where both gangs would turn on/off together instead of independently.

**Debugging approach added:**
- Debug info in device settings (timestamps, last action, protocol mode)
- Explicit endpoint routing in `_registerCapabilityListeners()`
- Console logging at key points

See `WALL_SWITCH_2GANG_1WAY_STATUS.md` in main app for detailed troubleshooting history.

## Relationship to Main App

**Main app:** `/Users/attilla/dev/homey/com.tuya.zigbee-packet/`
- Universal Tuya Zigbee app
- 109 drivers supporting 4200+ devices
- 14MB build (too large for remote debugging)
- Production app for Homey App Store

**This app (BSEED):** `/Users/attilla/dev/homey/bseed/`
- Development-only app
- 3 BSEED drivers
- 5.1MB build (works with `homey app run`)
- Not intended for App Store

### Syncing Changes Back

When development is complete:

1. Test changes in this BSEED app with `homey app run`
2. Copy working driver code back to main app:
   ```bash
   cp -r drivers/wall_switch_2gang_1way/ ../com.tuya.zigbee-packet/drivers/
   ```
3. Update main app's `app.json` if needed
4. Test in main app with `homey app install`
5. Publish main app to store

## Files Structure

```
/Users/attilla/dev/homey/bseed/
├── app.json                    App metadata (27KB, 3 drivers + flow cards)
├── app.js                      Main app class
├── package.json                Dependencies (minimal)
├── .homeyignore               Build exclusions
├── .homeychangelog.json       Version history
├── README.md                   Quick reference
├── DEV_NOTES.md               This file
│
├── drivers/
│   ├── wall_switch_1gang_1way/
│   ├── wall_switch_2gang_1way/    ← Active development
│   └── wall_dimmer_1gang_1way/
│
├── lib/                        2.9MB optimized libraries
│   ├── devices/               BaseHybridDevice, HybridSwitchBase
│   ├── tuya/                  Tuya protocol support
│   ├── mixins/                PhysicalButtonMixin, VirtualButtonMixin
│   └── ...                    Utils, managers, helpers
│
└── assets/
    ├── icon.svg
    └── images/                App icons (small, large, xlarge)
```

## Dependencies

**Runtime:**
- `homey-zigbeedriver: ^2.2.2` - Official Homey ZigBee SDK

**Development:**
- `homey: ^3.12.2` - Homey CLI tools
  - Note: Includes `openai` (7.4MB) for `homey app translate` command
  - OpenAI is NOT included in build (devDependency only)

**Build includes only:**
- homey-zigbeedriver (~800KB)
- zigbee-clusters (~324KB)
- tinycolor2 (~200KB after removing tests)
- Supporting libs (~400KB)
- Total: 1.7MB runtime dependencies

## Future Considerations

### If App Grows Too Large Again

Options:
1. Remove one of the 3 drivers
2. Create separate apps per driver type (switches, dimmers, etc.)
3. Strip down lib/ further (lose some compatibility)

### Merging Back to Main App

When BSEED drivers are stable:
- Consider keeping this as a permanent dev app
- OR merge back and create a different minimal app for next driver development

## Known Issues

### Build Process
- `.homeybuild/` must be cleaned between major changes
- Sometimes need `rm -rf .homeybuild && homey app build`

### Dependencies
- Don't accidentally add devDependencies that bloat node_modules
- Always check build size after `npm install`

## Tips & Tricks

### Fast Iteration
```bash
# Keep homey app run running, save changes, app auto-reloads
homey app run

# In another terminal, make changes to drivers/
# Save file → app reloads automatically
```

### Debugging Protocol Detection
Check device settings → Debug Information → Protocol Mode
- "Tuya DP" = Using Tuya specific cluster
- "ZCL" = Using standard ZigBee clusters

### Testing Both Gangs
```javascript
// In device settings debug output:
// "Last Action: Gang 1 ON → Endpoint 1 (14:23:45)"
// "Last Action: Gang 2 OFF → Endpoint 2 (14:23:47)"
```

### Common Issues

**"Payload Too Large" error:**
- App exceeded 10MB limit
- Check: `du -sh .homeybuild`
- Fix: Remove more from lib/ or reduce drivers

**Build fails after cleanup:**
- Removed a required lib file
- Restore from main app: `cp ../com.tuya.zigbee-packet/lib/path/to/file.js lib/path/to/`

**Driver not loading:**
- Check app.json has driver entry
- Verify driver.compose.json is valid
- Check driver.js exports properly

## Resources

### Documentation
- [Homey Apps SDK v3](https://apps-sdk-v3.developer.homey.app/)
- [Homey ZigBee Driver](https://athombv.github.io/node-homey-zigbeedriver/)
- [ZigBee Clusters](https://github.com/Koenkk/zigbee-herdsman-converters)

### Main App Reference
- Main app structure: `/Users/attilla/dev/homey/com.tuya.zigbee-packet/`
- Full lib implementation: `../com.tuya.zigbee-packet/lib/`
- All 109 drivers: `../com.tuya.zigbee-packet/drivers/`

---

**Last Updated:** 2026-01-30
**Maintained By:** Attilla de Groot (attilla@packet.ninja)
**Main App:** Universal Tuya Zigbee (com.dlnraja.tuya.zigbee) by Dylan Rajasekaram

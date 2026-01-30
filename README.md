# BSEED Development App

> **Minimal development app for BSEED wall switches with full debugging support**

This is a streamlined version of the Universal Tuya Zigbee app, containing only 3 BSEED drivers (5.1MB vs 14MB) to enable `homey app run` debugging.

## Quick Start

```bash
# Run with live logs (works!)
homey app run

# Install to Homey
homey app install

# Build
homey app build
```

## Included Drivers

- **wall_switch_1gang_1way** - Single gang (TS0001)
- **wall_switch_2gang_1way** - Dual gang (TS0012/TS0003) ⭐ _Has debug settings_
- **wall_dimmer_1gang_1way** - Dimmer (TS0601/TS004F)

## Documentation

- **DEV_NOTES.md** - Complete documentation, development history, troubleshooting
- **Main app:** `/Users/attilla/dev/homey/com.tuya.zigbee-packet/`

## Why This Exists

The main Universal Tuya Zigbee app (109 drivers, 14MB) exceeds Homey's remote debug payload limit (~10MB), causing "Payload Too Large" errors with `homey app run`. This minimal app solves that problem.

---

**Author:** Attilla de Groot (attilla@packet.ninja)
**Based on:** Universal Tuya Zigbee by Dylan Rajasekaram

# BSEED Zigbee App for Homey (Personal Fork)

> **⚠️ Personal Use Only** - This is a personal fork of the Universal Tuya Zigbee app, tailored specifically for BSEED devices. Not an official Homey app (yet).

## About This Fork

This app is forked from [dlnraja/com.tuya.zigbee](https://github.com/dlnraja/com.tuya.zigbee) by Dylan Rajasekaram.

**Why a separate fork?**
- The original Universal Tuya Zigbee app supports 100+ devices but is challenging to maintain for specific device issues
- This focused app allows faster iteration and debugging for BSEED-specific implementations
- Smaller codebase (3 drivers vs 109) enables `homey app run` debugging without payload size issues

**Credit:** All core architecture, Tuya protocol handling, and foundational work comes from Dylan Rajasekaram's excellent Universal Tuya Zigbee app. This fork simply provides a focused testing ground for BSEED devices.

## Current Status

**Working:**
- ✅ 1-gang wall switch (TS0001) - Fully tested, working
- ✅ 1-gang dimmer (TS0601/TS004F) - Fully tested, working
- ✅ **2-gang wall switch (TS0012)** - **Sub-device implementation complete!** Each gang is now a separate device card
- ⏳ **3-gang wall switch (TS0003)** - Sub-device implementation complete, awaiting community testing

**Recent Fixes:**
- 🎉 **2-gang mirroring issue SOLVED!** (January 2026)
  - **Root cause:** Homey firmware limitation handling multi-endpoint clusters
  - **Solution:** Homey 12.10.0 update added "support for devices that use the same cluster multiple times"
  - **Status:** Working perfectly - each gang controls independently

- 🎉 **Sub-device implementation complete!** (February 2026)
  - 2-gang creates 2 separate device cards (confirmed working)
  - 3-gang creates 3 separate device cards (pending community testing)
  - Benefits: Natural voice control, zone assignment per gang, cleaner UI

## Included Drivers

- **wall_switch_1gang_1way** - Single gang switch (TS0001, TS0011)
- **wall_switch_2gang_1way** - Dual gang switch (TS0012, TS0013) - ✅ _Sub-device support (2 separate devices)_
- **wall_switch_3gang_1way** - Triple gang switch (TS0003) - ⏳ _Sub-device support (3 separate devices, pending testing)_
- **wall_dimmer_1gang_1way** - Touch dimmer (TS0601, TS004F)

## Quick Start

```bash
# Run with live debugging (works!)
homey app run

# Install to Homey
homey app install

# Build distributable
homey app build
```

## Why This Exists

The Universal Tuya Zigbee app (109 drivers, 14MB) exceeds Homey's remote debug payload limit (~10MB), causing "Payload Too Large" errors with `homey app run`. This focused app:

1. **Enables debugging** - Small enough for live debugging
2. **Faster iteration** - Focused codebase for BSEED devices
3. **Learning platform** - Understand Tuya protocol implementation
4. **Personal testing** - Validate fixes before contributing upstream

## Architecture Highlights

- **HybridSwitchBase** - Supports both Tuya DP and ZCL protocols automatically
- **ProtocolAutoOptimizer** - Auto-detects which protocol the device uses (15-min learning)
- **PhysicalButtonMixin** - Distinguishes physical button presses from app commands
- **VirtualButtonMixin** - Creates virtual buttons for advanced automations
- **ManufacturerVariationManager** - Device-specific configurations
- **Sub-Device Support** - Multi-gang switches create separate device cards per gang

## Sub-Device Benefits

Multi-gang switches (2-gang, 3-gang) now create separate device cards:

**For Users:**
- 🎤 **Natural voice control** - "Turn on Kitchen Light" targets specific gang
- 🏠 **Zone assignment** - Each gang can be in a different room/zone
- 🎨 **Cleaner UI** - Separate device cards instead of one with multiple switches
- 🔄 **Better automations** - Target specific lights directly in flows

**Technical:**
- Each device controls only its endpoint (no mirroring)
- Standard Homey flow cards work (turn on/off)
- Physical button detection per device
- Requires Homey 12.10.0+ for proper multi-endpoint support

## Future Plans

- [x] ~~Resolve 2-gang mirroring issue~~ - **SOLVED by Homey 12.10.0!**
- [x] ~~Implement sub-device support~~ - **COMPLETE for 2-gang and 3-gang!**
- [ ] Test 3-gang switch with community hardware
- [ ] Add 4-gang switch support (with sub-devices)
- [ ] Contribute fixes back to Universal Tuya Zigbee app
- [ ] Potentially release as standalone BSEED-focused app

## Contributing

Since this is a personal fork for development and testing, contributions should generally go to the upstream [Universal Tuya Zigbee app](https://github.com/dlnraja/com.tuya.zigbee). However, if you have BSEED-specific insights or fixes, feel free to open an issue or discussion.

## Development Notes

Detailed development documentation is maintained separately for:
- Architecture and design patterns
- How to add new drivers
- Protocol detection and optimization
- Known issues and investigations

## Credits

- **Original Author:** Dylan Rajasekaram ([dlnraja/com.tuya.zigbee](https://github.com/dlnraja/com.tuya.zigbee))
- **Fork Maintainer:** Attilla de Groot (attilla@packet.ninja)
- **Community:** Homey Community Forum contributors, Zigbee2MQTT project
- **Product Images:** Official BSEED website ([bseed.com](https://www.bseed.com/))

## License

Same as upstream: MIT License

---

**Development Status:** Active (Personal Use)
**Last Updated:** 2026-02-01 - Sub-device implementation complete!

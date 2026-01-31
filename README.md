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
- ⚠️ 2-gang wall switch (TS0012) - Working, but has known mirroring issue (see below)
- 🔄 3-gang wall switch (TS0003) - Implemented, awaiting hardware testing

**Known Issues:**
- **2-gang switch (_TZ3000_xk5udnd6 / TS0012):** Firmware bug causes both gangs to mirror each other when controlled via app/Zigbee. Physical buttons work independently. This is a device firmware issue, not a driver bug.
  - **Root cause:** Device firmware broadcasts OnOff commands to all endpoints via Zigbee groups instead of targeting specific endpoints
  - **Workaround:** Physical buttons work correctly; app control will affect both gangs
  - **Solution:** Waiting for new hardware with updated firmware

## Included Drivers

- **wall_switch_1gang_1way** - Single gang switch (TS0001, TS0011)
- **wall_switch_2gang_1way** - Dual gang switch (TS0012, TS0013) ⚠️ _Known mirroring issue_
- **wall_switch_3gang_1way** - Triple gang switch (TS0003) 🔄 _Untested, community contribution_
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

## Future Plans

- [ ] Resolve 2-gang mirroring issue (waiting for new hardware)
- [ ] Test 3-gang switch with actual hardware
- [ ] Implement sub-device support (separate cards per gang)
- [ ] Add 4-gang switch support
- [ ] Contribute fixes back to Universal Tuya Zigbee app
- [ ] Potentially release as standalone BSEED-focused app

## Contributing

Since this is a personal fork for development and testing, contributions should generally go to the upstream [Universal Tuya Zigbee app](https://github.com/dlnraja/com.tuya.zigbee). However, if you have BSEED-specific insights or fixes, feel free to open an issue or discussion.

## Development Notes

See `.claude/DEVELOPMENT.md` for detailed development documentation including:
- Architecture and design patterns
- How to add new drivers
- Image processing workflow
- Known issues and workarounds

## Credits

- **Original Author:** Dylan Rajasekaram ([dlnraja/com.tuya.zigbee](https://github.com/dlnraja/com.tuya.zigbee))
- **Fork Maintainer:** Attilla de Groot (attilla@packet.ninja)
- **Community:** Homey Community Forum contributors, Zigbee2MQTT project
- **Product Images:** Official BSEED website ([bseed.com](https://www.bseed.com/))

## License

Same as upstream: MIT License

---

**Development Status:** Active (Personal Use)
**Last Updated:** 2026-01-31

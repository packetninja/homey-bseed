# BSEED Development Documentation

## Project Structure

This is a personal fork of the Universal Tuya Zigbee app, focused specifically on BSEED Zigbee devices. The smaller codebase enables `homey app run` debugging without payload size issues.

## Drivers

### Current Drivers

1. **wall_switch_1gang_1way** - Single gang on/off switch
   - Model: TS0001
   - Manufacturers: _TZ3000_blhvsaqf, _TZ3000_ysdv91bk
   - Status: ✅ Working

2. **wall_switch_2gang_1way** - Dual gang on/off switch
   - Model: TS0012
   - Manufacturers: _TZ3000_xk5udnd6, _TZ3000_l9brjwau
   - Status: ⚠️ Known mirroring issue (firmware bug)

3. **wall_switch_3gang_1way** - Triple gang on/off switch
   - Model: TS0003
   - Manufacturer: _TZ3000_qkixdnon
   - Status: 🔄 Untested (community contribution)

4. **wall_dimmer_1gang_1way** - Single gang dimmer
   - Models: TS0601, TS004F
   - Manufacturers: Multiple (see app.json)
   - Status: ✅ Working

## Recent Changes (2026-01-31)

### Added 3-Gang Switch Support

Created complete driver for 3-gang wall switch based on Zigbee interview data:

**Files Created:**
- `drivers/wall_switch_3gang_1way/device.js` - Device implementation with HybridSwitchBase
- `drivers/wall_switch_3gang_1way/driver.js` - Driver with flow card handlers
- `drivers/wall_switch_3gang_1way/driver.compose.json` - Driver configuration
- `drivers/wall_switch_3gang_1way/driver.settings.compose.json` - Settings for gang names
- `drivers/wall_switch_3gang_1way/driver.flow.compose.json` - Flow cards (triggers & actions)
- `drivers/wall_switch_3gang_1way/assets/icon.svg` - Custom 3-gang icon
- `drivers/wall_switch_3gang_1way/assets/images/large.png` - Product photo (500x500)
- `drivers/wall_switch_3gang_1way/assets/images/small.png` - Thumbnail (75x75)

**Files Updated:**
- `app.json` - Added driver registration and flow cards
- `README.md` - Updated driver list and status

**Key Features:**
- 3 independent onoff capabilities (onoff, onoff.gang2, onoff.gang3)
- Physical button detection for all gangs
- Customizable gang names
- LED indicator control
- Flow cards for all gangs
- Debug information in settings

### Updated All Driver Images

Downloaded and processed official BSEED product images from bseed.com:

**Image Sources:**
- Standard switches: https://www.bseed.com/products/bseed-zigbee-1-2-3gang-1-2-3way-switch-wall-smart-light-switch-for-staircase
- Dimmer switches: https://www.bseed.com/products/bseed-zigbee-1-2-3-gang-switch-with-touch-light-dimmer-smart-switch

**Updated Assets:**
- All drivers now have proper product photos (black for switches, white for dimmers)
- Created missing icon.svg files for 2-gang and 3-gang switches
- All images properly sized (large: 500x500, small: 75x75)

## Architecture

### Base Classes

- **HybridSwitchBase** (`lib/devices/HybridSwitchBase.js`)
  - Auto-detection of Tuya DP vs ZCL protocol
  - ZCL onOff cluster support for multi-gang switches
  - Tuya DP support for settings (backlight, etc.)
  - ProtocolAutoOptimizer for automatic protocol detection

### Mixins

- **PhysicalButtonMixin** (`lib/mixins/PhysicalButtonMixin.js`)
  - Physical button press detection
  - Per-gang button detection for multi-gang switches
  - Distinguishes physical presses from app commands

- **VirtualButtonMixin** (`lib/mixins/VirtualButtonMixin.js`)
  - Virtual button support for advanced automations

### Driver Pattern

Each multi-gang driver follows this pattern:

```javascript
class WallSwitchXGang1WayDevice extends PhysicalButtonMixin(VirtualButtonMixin(HybridSwitchBase)) {
  get gangCount() { return X; }

  get dpMappings() {
    return {
      1: { capability: 'onoff', transform: (v) => v === 1 || v === true },
      2: { capability: 'onoff.gang2', transform: (v) => v === 1 || v === true },
      // ... additional gangs
    };
  }

  async onNodeInit({ zclNode }) {
    // Initialize state tracking
    await super.onNodeInit({ zclNode });
    await this.initPhysicalButtonDetection(zclNode);
    await this._applyGangNames();
  }
}
```

## Development Workflow

### Testing

```bash
# Live debugging (works with small codebase)
homey app run

# Install to Homey
homey app install

# Validate app configuration
homey app validate
```

### Adding a New Driver

1. **Create driver directory structure:**
   ```bash
   mkdir -p drivers/new_driver_name/assets/images
   ```

2. **Create required files:**
   - `device.js` - Device implementation (extend HybridSwitchBase)
   - `driver.js` - Driver implementation (extend BaseZigBeeDriver)
   - `driver.compose.json` - Capabilities and Zigbee endpoints
   - `driver.settings.compose.json` - Settings configuration
   - `driver.flow.compose.json` - Flow cards (triggers/actions)

3. **Add assets:**
   - `assets/icon.svg` - Vector icon for the driver
   - `assets/images/large.png` - Product photo (500x500)
   - `assets/images/small.png` - Thumbnail (75x75)

4. **Update app.json:**
   - Add driver entry to `drivers` array
   - Add flow cards to `flow.triggers` and `flow.actions`

5. **Test:**
   ```bash
   homey app validate
   homey app run
   ```

### Image Processing

To download and process product images from BSEED:

```bash
# Download image
curl -s "https://www.bseed.com/cdn/shop/files/[image].jpg" -o /tmp/product.jpg

# Resize with sips (macOS)
sips -Z 500 /tmp/product.jpg --out /tmp/large.png
sips -Z 75 /tmp/product.jpg --out /tmp/small.png

# Copy to driver
cp /tmp/large.png drivers/driver_name/assets/images/
cp /tmp/small.png drivers/driver_name/assets/images/
```

## Known Issues

### 2-Gang Switch Mirroring (_TZ3000_xk5udnd6 / TS0012)

**Symptom:** Both gangs mirror each other when controlled via app/Zigbee. Physical buttons work independently.

**Root Cause:** Device firmware bug - broadcasts OnOff commands to all endpoints via Zigbee groups instead of targeting specific endpoints.

**Workaround:** Physical buttons work correctly. App control affects both gangs.

**Solution:** Waiting for new hardware with updated firmware.

## Future Plans

- [ ] Test 3-gang switch with actual hardware
- [ ] Resolve 2-gang mirroring issue (waiting for new hardware)
- [ ] Implement sub-device support (separate cards per gang)
- [ ] Add 4-gang switch support
- [ ] Contribute fixes back to Universal Tuya Zigbee app
- [ ] Potentially release as standalone BSEED-focused app

## Resources

- **Upstream Repository:** https://github.com/dlnraja/com.tuya.zigbee
- **BSEED Official Site:** https://www.bseed.com/
- **Homey SDK Documentation:** https://apps.developer.homey.app/
- **Zigbee2MQTT Database:** https://zigbee.blakadder.com/

## License

MIT License - Same as upstream (Universal Tuya Zigbee app by Dylan Rajasekaram)

---

**Last Updated:** 2026-01-31
**Maintainer:** Attilla de Groot (attilla@packet.ninja)

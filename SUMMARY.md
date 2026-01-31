# BSEED 2-Gang Switch - Debugging Session Summary

**Date:** 2026-01-31
**Issue:** Gang 1 and Gang 2 mirror each other when controlled via Homey app
**Device:** _TZ3000_xk5udnd6 / TS0012

---

## What We Did

### 1. ✅ Analyzed the Code Structure

**Files reviewed:**
- `drivers/wall_switch_2gang_1way/device.js` (BSEED implementation)
- `lib/devices/HybridSwitchBase.js` (Base class)
- `../com.tuya.zigbee-packet/drivers/wall_switch_2gang_1way/device.js` (Parent app)

**Key findings:**
- BSEED 2-gang uses simplified ZCL-only mode (bypasses HybridSwitchBase)
- Parent app uses full hybrid mode with explicit endpoint routing
- Both use the same command method: `cluster.setOn()` / `cluster.setOff()`
- Commands are sent to specific endpoints (EP1 or EP2)

### 2. ✅ Added Comprehensive Debug Logging

**Enhanced:** `drivers/wall_switch_2gang_1way/device.js`

**Added logging for:**

#### Initialization Phase
- Manufacturer detection process
- ZCL-only mode selection logic
- Endpoint structure (which endpoints exist, which clusters available)
- Cluster object details (methods available)
- Initial state reading

#### Command Phase (When you control via app)
- Which gang is being controlled
- Target endpoint (EP1 or EP2)
- Exact command being sent (`setOn()` or `setOff()`)
- Pending flag state (to distinguish app vs physical)
- Command counter per endpoint

#### Report Phase (Device response)
- Which endpoint reported the change
- Value received (true/false)
- Source identification (APP or PHYSICAL)
- Report counter per endpoint
- State comparison (old vs new)

#### Diagnostics
- Summary method showing full state
- Command vs report counters per endpoint
- Shows if endpoints are receiving unexpected reports

---

## What the Logging Will Tell Us

### Critical Questions

1. **Are commands being sent to the correct endpoint?**
   - Look for: `║  Target: EP1 (onoff)  ║`
   - This confirms we're commanding the right endpoint

2. **How many endpoints report back?**
   - Count `[BSEED-ATTR] EPX REPORT` messages
   - **Expected:** Only the commanded endpoint
   - **Bug:** Both endpoints report

3. **What's the source of each report?**
   - `Source: 📱 APP COMMAND` = We just sent this command
   - `Source: 🔘 PHYSICAL BUTTON` = We didn't command this
   - If EP2 reports as PHYSICAL when we only commanded EP1 → **device is mirroring**

4. **Are command counters balanced with report counters?**
   ```
   EP1: Commands=5, Reports=5  ✅ Normal
   EP2: Commands=0, Reports=5  ❌ BUG - never commanded but received 5 reports!
   ```

---

## Log Examples

### ✅ Expected Behavior (Physical Button Works)

Press physical button 1:
```
════════════════════════════════════════
[BSEED-ATTR] EP1 REPORT #1
  Source: 🔘 PHYSICAL BUTTON
  Value: true
════════════════════════════════════════
```
Only EP1 reports. ✅

### ❌ Bug Behavior (App Command Mirrors)

Turn on Gang 1 via app:
```
╔════════════════════════════════════════╗
║  APP COMMAND TO EP1 #1                 ║
║  Command: ON                           ║
║  Method: onOff.setOn()                 ║
╚════════════════════════════════════════╝

════════════════════════════════════════
[BSEED-ATTR] EP1 REPORT #1
  Source: 📱 APP COMMAND
  Value: true
════════════════════════════════════════

════════════════════════════════════════
[BSEED-ATTR] EP2 REPORT #1    ← ⚠️ UNEXPECTED!
  Source: 🔘 PHYSICAL BUTTON  ← We never commanded EP2
  Value: true
════════════════════════════════════════
```

EP2 also reports even though we only commanded EP1. ❌

---

## Testing Instructions

### 1. Restart Homey
The new logging code needs to be loaded:
```bash
# In the project directory:
homey app run
```

### 2. Open Developer Console
Settings > Advanced > Developer > View logs

### 3. Filter to Your Device
Search for `[BSEED]` or `wall_switch_2gang`

### 4. Run Tests

**Test A: Control Gang 1 via App**
1. Turn Gang 1 ON via Homey app
2. Observe: How many endpoints reported?
3. Check: Does EP2 report as "PHYSICAL"?

**Test B: Control Gang 2 via App**
1. Turn Gang 2 ON via Homey app
2. Observe: How many endpoints reported?
3. Check: Does EP1 report as "PHYSICAL"?

**Test C: Physical Button 1**
1. Press physical button 1 on device
2. Verify: Only EP1 reports ✅

**Test D: Physical Button 2**
1. Press physical button 2 on device
2. Verify: Only EP2 reports ✅

### 5. Review Diagnostics

At any time, remove and re-add the device to see cleanup diagnostics:
```
╔════════════════════════════════════════════════════════════╗
║                    DIAGNOSTICS SUMMARY                     ║
╠════════════════════════════════════════════════════════════╣
║  ENDPOINT 1 (Gang 1):                                      ║
║    Commands: 5                                             ║
║    Reports: 5                                              ║
║                                                            ║
║  ENDPOINT 2 (Gang 2):                                      ║
║    Commands: 0        ← Never commanded                    ║
║    Reports: 5         ← But received 5 reports! ⚠️          ║
╚════════════════════════════════════════════════════════════╝
```

---

## What to Look For

### ✅ Good Signs
- Only commanded endpoint reports back
- Report counters match command counters
- Physical buttons still work correctly

### ❌ Bug Confirmed
- Both endpoints report after single command
- Non-commanded endpoint reports as "PHYSICAL"
- Report counter > command counter for an endpoint

---

## Next Steps Based on Results

### Scenario 1: Bug Still Occurs (Most Likely)

This confirms the issue is at the **device firmware level**, not the driver code.

**Then investigate:**
1. ✅ We've confirmed commands go to correct endpoint
2. ✅ We've confirmed device sends reports from both endpoints
3. ⏭️ Check Zigbee groups membership
4. ⏭️ Try alternative command methods
5. ⏭️ Test with parent app (com.tuya.zigbee-packet)
6. ⏭️ Test with Zigbee2MQTT
7. ⏭️ Research if this device model supports independent Zigbee control

### Scenario 2: Bug Fixed (Unlikely)

If only the commanded endpoint reports, the issue was somehow resolved by the enhanced initialization or state tracking.

**Then:**
- Keep the logging for documentation
- Clean up verbose console logs
- Mark issue as resolved

### Scenario 3: Different Behavior

If logs show something unexpected (e.g., wrong endpoint receiving command), we have a driver bug to fix.

---

## Documents Created

1. **DEBUGGING_GUIDE.md** - Detailed guide on reading the logs
2. **CODE_ANALYSIS.md** - Technical analysis of code structure
3. **TROUBLESHOOTING_BSEED_FIRMWARE_BUG.md** - Previous investigation (already existed)
4. **SUMMARY.md** - This file

---

## Key Code Changes

**File:** `drivers/wall_switch_2gang_1way/device.js`

**Changes:**
- Added extensive console.log debugging
- Added state counters (commandCount, reportCount)
- Added diagnostic summary method
- Enhanced pending flag tracking
- Added timestamp logging
- Added cleanup diagnostics

**No logic changes** - only observability improvements to see what's actually happening.

---

## Questions This Will Answer

✅ Is the correct endpoint receiving commands?
✅ Which endpoint(s) report back after commands?
✅ Are reports marked as APP or PHYSICAL?
✅ How many times has each endpoint been commanded vs reported?
✅ Is the pending flag system working correctly?
✅ What are the exact values being sent/received?

---

## What We Know So Far

From previous troubleshooting (TROUBLESHOOTING_BSEED_FIRMWARE_BUG.md):

✅ **Physical buttons work correctly** - only one gang toggles
✅ **Manufacturer detection works** - _TZ3000_xk5udnd6 detected
✅ **ZCL-only mode activates** - bypasses Tuya DP protocol
✅ **Bindings removed** - device re-paired with empty bindings
❌ **App commands still mirror** - both gangs change together

**Hypothesis:** The device firmware mirrors Zigbee commands across endpoints, but allows physical buttons to work independently.

---

## Ready to Test! 🚀

1. Restart Homey with `homey app run`
2. Open developer console
3. Control Gang 1 and Gang 2 via app
4. Watch the detailed logs
5. Count how many endpoints report
6. Check if reports are marked PHYSICAL or APP
7. Share results for next investigation steps

---

**Status:** Debug logging added, ready for testing
**Next:** Test and analyze logs to determine root cause

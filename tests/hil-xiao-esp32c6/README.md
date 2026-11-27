# XIAO ESP32-C6 Hardware-in-the-Loop (HIL) Test Suite

Physical RF validation suite for **2–3 Seeed Studio XIAO ESP32-C6** boards connected over USB-C (`/dev/ttyACM*`).

## Suites

| Suite | Boards | Projects | Verifies |
| --- | --- | --- | --- |
| `espnow` | 2 | `espnow-tx`, `espnow-rx` | `H-NOW-01` ESP-NOW `radio` number/string/value |
| `wifi-udp` | 1–2 | `wifi-udp-coex` | `H-ANT-01` RF antenna switch, `H-WIF-01` Wi-Fi 6 scan, `H-COEX-01` Wi-Fi + ESP-NOW coex |
| `ble` | 2 | `ble-beacon-tx`, `ble-beacon-rx` | `H-BLE-01` BLE 5.3 beacon + passive scan |
| `thread` | 2 | `thread-node-a`, `thread-node-b` | `H-THR-01` / `H-THR-02` OpenThread IPv6 mesh ping-pong |
| `zigbee` | 2 | `zigbee-coord`, `zigbee-router` | `H-ZB-01` / `H-ZB-02` Zigbee 3.0 Coordinator/Router + HA clusters |

## Usage

### Offline Dry Run (Compile Verification Only)
Verifies all HIL MakeCode projects compile cleanly without physical hardware attached:
```bash
node tests/hil-xiao-esp32c6/run-hil.js --dry-run
```

Include full ESP-IDF native binary builds (`espressif/idf:v5.5.6` Docker):
```bash
node tests/hil-xiao-esp32c6/run-hil.js --dry-run --native
```

### Physical Hardware Execution
Connect two XIAO ESP32-C6 boards via USB-C and run:
```bash
node tests/hil-xiao-esp32c6/run-hil.js --ports /dev/ttyACM0,/dev/ttyACM1 --suite all
```

Options:
- `--suite <name>`: `espnow`, `wifi-udp`, `ble`, `thread`, `zigbee`, or `all` (default: `all`)
- `--ports <p1,p2>`: Comma-separated serial ports (auto-detects `/dev/ttyACM*` if omitted)
- `--skip-flash`: Monitor serial output without reflashing
- `--timeout <ms>`: Per-suite timeout in milliseconds (default: `30000`)

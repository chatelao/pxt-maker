# Seeed Studio XIAO ESP32-C6

The **Seeed Studio XIAO ESP32-C6** is a compact RISC-V development board (160 MHz ESP32-C6, 512 KB SRAM, 4 MB Flash) with integrated 2.4 GHz **Wi-Fi 6 (802.11ax)**, **Bluetooth 5.3 (BLE)**, and **IEEE 802.15.4 (Thread & Zigbee 3.0)** radios.

```sim
forever(function() {

})
```

```package
seeed-xiao-esp32c6
```

## Hardware & Pinout

| Pin | Function | Notes |
| --- | --- | --- |
| `D0`–`D2` | GPIO / ADC | Analog-capable (`pins.A0`–`pins.A2`) |
| `D3`–`D10` | GPIO / PWM | Digital I/O, PWM, Servo, SPI (`D8` SCK, `D9` MISO, `D10` MOSI), I2C (`D4` SDA, `D5` SCL) |
| `D6` / `D7` | UART TX / RX | Hardware serial (`serial`) |
| `LED` | Built-in LED | Active-low yellow user LED (`GPIO15`) |
| `GPIO3` / `GPIO14` | RF Switch | Internal vs. external U.FL antenna switch |

### Switching Between Internal and External Antenna

The XIAO ESP32-C6 includes an onboard ceramic antenna and a U.FL connector for an external 2.4 GHz antenna. By default, the onboard antenna is selected. You can switch to an external antenna at runtime:

```typescript
// Use external U.FL antenna (true) or onboard ceramic antenna (false)
_wifi.setExternalAntenna(true)
```

---

## Wireless & Intercomm Protocols

### 1. ESP-NOW (`radio` / `radio-broadcast`)

Peer-to-peer, connectionless 2.4 GHz messaging compatible with MakeCode `radio` blocks. Great for fast board-to-board telemetry and remote control without a Wi-Fi router.

```typescript
radio.setGroup(42)
radio.onReceivedNumber(function (receivedNumber) {
    serial.writeLine("RX: " + receivedNumber)
})
forever(function () {
    radio.sendNumber(123)
    pause(1000)
})
```

### 2. Wi-Fi 6, UDP & MQTT (`net` / `_wifi` / `mqtt`)

Connect to a Wi-Fi 6 (802.11ax) or 802.11b/g/n access point, start a SoftAP, or exchange UDP datagrams directly with peer boards.

```typescript
const ctrl = net.instance().controller
const aps = ctrl.scanNetworks()
const sock = ctrl.socket()
ctrl.socketConnect(sock, Buffer.fromArray([255, 255, 255, 255]), 12345, net.UDP_MODE)
ctrl.socketWrite(sock, Buffer.fromUTF8("hello-udp"))
ctrl.socketClose(sock)
```

### 3. Bluetooth Low Energy 5.3 (`bluetooth`)

Supports **Nordic UART Service (NUS)** for serial-over-BLE, **non-connectable BLE beacons**, and **passive advertisement scanning** (powered by Apache NimBLE).

```typescript
bluetooth.setDeviceName("XIAO-C6")
bluetooth.startUartService()
bluetooth.onUartDataReceived(function () {
    const msg = bluetooth.uartReadString()
    bluetooth.uartWriteString("Echo: " + msg)
})
```

Beacon broadcast and scanning:

```typescript
// Broadcaster
bluetooth.advertiseString("XIAO-HELLO", 100)

// Scanner
bluetooth.onAdvertisementReceived(function (data, rssi) {
    serial.writeLine("BLE " + rssi + " dBm: " + data.toString())
})
bluetooth.startScanning()
```

### 4. Thread Mesh (`thread`)

Forms or joins an **OpenThread** IPv6 mesh network over IEEE 802.15.4 and exchanges topic/message strings or named numeric values via IPv6 link-local/realm-local multicast (`ff03::1`).

```typescript
thread.joinGroup(15, 0x1234, "MakeCodeThread")
thread.onReceivedString(function (topic, message) {
    serial.writeLine(topic + ": " + message)
})
forever(function () {
    thread.sendString("sensor", "ok")
    pause(2000)
})
```

### 5. Zigbee 3.0 (`zigbee`)

Supports **Coordinator**, **Router**, and **End Device** roles for both custom MakeCode mesh intercomm and standard **Zigbee Home Automation** clusters (On/Off `0x0006` and Temperature Measurement `0x0402`).

```typescript
// Coordinator board
zigbee.startNetwork(ZigbeeRole.Coordinator, 15)
zigbee.onSwitchChanged(function (on) {
    serial.writeLine("Switch: " + on)
})

// Router / End Device board
zigbee.startNetwork(ZigbeeRole.Router, 15)
zigbee.onJoined(function () {
    zigbee.reportTemperature(23.5)
    zigbee.sendValue("light", 1)
})
```

---

## Radio Coexistence & Constraints

- **Wi-Fi + ESP-NOW + BLE**: Can run concurrently using ESP-IDF software coexistence.
- **Thread & Zigbee (IEEE 802.15.4)**: Both protocols share the single 802.15.4 radio hardware. Only **one** 802.15.4 stack (`thread` or `zigbee`) can be initialized per boot; attempting to start both in the same program will fail the second claim cleanly at runtime.

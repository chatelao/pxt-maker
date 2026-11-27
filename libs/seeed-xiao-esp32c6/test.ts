// Comprehensive XIAO ESP32-C6 basic samples & peripheral verification

// 1. Onboard Yellow User LED (GPIO15) Blinky
pins.LED.digitalWrite(false); // active-low ON
pause(100);
pins.LED.digitalWrite(true);  // active-low OFF

// 2. Digital I/O & Edge Interrupts (D0 = GPIO0)
pins.D0.setPull(PinPullMode.PullUp);
let d0Val = pins.D0.digitalRead();
pins.D0.onEvent(PinEvent.Rise, () => {
    pins.LED.digitalWrite(false);
});

// 3. Onboard BOOT Button (GPIO9 -> input.buttonA)
let bootPressed = input.buttonA.isPressed();
input.buttonA.onEvent(ButtonEvent.Click, () => {
    serial.writeLine("BOOT clicked");
});

// 4. 12-bit ADC (A0..A2 -> GPIO0..GPIO2)
let adc0 = pins.A0.analogRead();
let adc1 = pins.A1.analogRead();
let adc2 = pins.A2.analogRead();

// 5. LEDC PWM & Servo (D2..D3)
pins.D2.analogWrite(512);
pins.D3.analogSetPeriod(20000);
pins.D3.servoWrite(90);
pins.D3.servoSetPulse(1500);

// 6. USB-Serial/JTAG Console & Hardware UART (TX=D6/GPIO16, RX=D7/GPIO17)
serial.writeLine("XIAO ESP32-C6 OK");
serial.writeValue("a0", adc0);
serial.redirect(pins.TX, pins.RX, BaudRate.BaudRate115200);

// 7. Hardware I2C (SDA=D4/GPIO22, SCL=D5/GPIO23)
pins.i2cWriteNumber(0x3c, 0x00, NumberFormat.UInt8BE);
let i2cData = pins.i2cReadBuffer(0x3c, 2);

// 8. Hardware SPI (MOSI=D10/18, MISO=D9/20, SCK=D8/19)
pins.spiFrequency(1000000);
pins.spiMode(0);
let spiRx = pins.spiWrite(0x9f);

// 9. Wi-Fi 6, RF Antenna Switch (GPIO3/GPIO14), UDP & MQTT
_wifi.setExternalAntenna(false);
let wifiCtrl = net.instance();
let mqttClient = new mqtt.Client({ host: "test.mosquitto.org", port: 1883, clientId: "xiao-c6-test" });
mqttClient.on("message", (arg?: string | mqtt.IMessage) => {
    if (arg && typeof arg !== "string") {
        serial.writeLine(arg.topic + ": " + arg.content.toString());
    }
});

// 10. Peer-to-Peer Radio (ESP-NOW) & Broadcast Intercomm
radio.setGroup(42);
radio.setTransmitPower(7);
radio.setFrequencyBand(10);
radio.onReceivedNumber((n) => {
    serial.writeValue("rxNum", n);
});
radio.onReceivedValue((name, val) => {
    serial.writeValue(name, val);
});
radio.onReceivedString((s) => {
    serial.writeLine("rxStr: " + s);
});
radio.onReceivedMessage(1, () => {
    serial.writeLine("rxMsg1");
});
radio.sendNumber(123);
radio.sendValue("temp", 25.5);
radio.sendString("hello-c6");
radio.sendBuffer(Buffer.fromUTF8("raw"));
radio.sendMessage(1);
radio.off();
radio.on();

// 11. Bluetooth 5.3 LE (NimBLE UART Service, Beacons & Scanner)
bluetooth.setDeviceName("XIAO-C6-Test");
bluetooth.onConnected(() => {
    bluetooth.uartWriteString("connected");
});
bluetooth.onUartDataReceived(() => {
    let msg = bluetooth.uartReadString();
    serial.writeLine("BLE_UART: " + msg);
});
bluetooth.startUartService();
bluetooth.advertiseString("c6-beacon", 100);
bluetooth.stopAdvertising();
bluetooth.onAdvertisementReceived((data, rssi) => {
    serial.writeLine("BLE_ADV: " + data.toString() + " " + rssi);
});
bluetooth.startScanning();
bluetooth.stopScanning();



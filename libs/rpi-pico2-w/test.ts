// Basic Raspberry Pi Pico 2 W (RP2350) peripheral verification
pins.LED.digitalWrite(true);
pins.P0.digitalWrite(false);
let v = pins.P26.analogRead();
pins.P1.analogWrite(512);
pins.P2.analogSetPeriod(20000);

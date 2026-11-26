declare namespace pins {
    //% fixedInstance shim=pxt::getPin(PIN_LED)
    const LED: PwmOnlyPin;

    //% fixedInstance shim=pxt::getPin(PIN_D0)
    const D0: AnalogInOutPin;
    //% fixedInstance shim=pxt::getPin(PIN_D1)
    const D1: AnalogInOutPin;
    //% fixedInstance shim=pxt::getPin(PIN_D2)
    const D2: AnalogInOutPin;
    //% fixedInstance shim=pxt::getPin(PIN_D3)
    const D3: PwmOnlyPin;
    //% fixedInstance shim=pxt::getPin(PIN_D4)
    const D4: PwmOnlyPin;
    //% fixedInstance shim=pxt::getPin(PIN_D5)
    const D5: PwmOnlyPin;
    //% fixedInstance shim=pxt::getPin(PIN_D6)
    const D6: PwmOnlyPin;
    //% fixedInstance shim=pxt::getPin(PIN_D7)
    const D7: PwmOnlyPin;
    //% fixedInstance shim=pxt::getPin(PIN_D8)
    const D8: PwmOnlyPin;
    //% fixedInstance shim=pxt::getPin(PIN_D9)
    const D9: PwmOnlyPin;
    //% fixedInstance shim=pxt::getPin(PIN_D10)
    const D10: PwmOnlyPin;

    //% fixedInstance shim=pxt::getPin(PIN_A0)
    const A0: AnalogInPin;
    //% fixedInstance shim=pxt::getPin(PIN_A1)
    const A1: AnalogInPin;
    //% fixedInstance shim=pxt::getPin(PIN_A2)
    const A2: AnalogInPin;

    //% fixedInstance shim=pxt::getPin(PIN_TX)
    const TX: PwmOnlyPin;
    //% fixedInstance shim=pxt::getPin(PIN_RX)
    const RX: PwmOnlyPin;

    //% fixedInstance shim=pxt::getPin(PIN_MISO)
    const MISO: DigitalInOutPin;
    //% fixedInstance shim=pxt::getPin(PIN_MOSI)
    const MOSI: DigitalInOutPin;
    //% fixedInstance shim=pxt::getPin(PIN_SCK)
    const SCK: DigitalInOutPin;
    //% fixedInstance shim=pxt::getPin(PIN_SCL)
    const SCL: DigitalInOutPin;
    //% fixedInstance shim=pxt::getPin(PIN_SDA)
    const SDA: DigitalInOutPin;
}

declare namespace input {
    //% fixedInstance shim=pxt::getButton(0)
    const buttonA: Button;
}

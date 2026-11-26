// Auto-generated. Do not edit.
declare namespace light {
    //% shim=light::sendBuffer
    function sendBuffer(data: DigitalInOutPin, clk: DigitalInOutPin, mode: int32, buf: Buffer): void;
}
declare namespace pins {

    /**
     * Get a pin by configuration id (DAL.CFG_PIN...)
     */
    //% shim=pins::pinByCfg
    function pinByCfg(key: int32): DigitalInOutPin;

    /**
     * Create a new zero-initialized buffer.
     * @param size number of bytes in the buffer
     */
    //% shim=pins::createBuffer
    function createBuffer(size: int32): Buffer;
}
declare namespace control {

    /**
     * Enable a watchdog timer that need to be fed or it will reset the device.
     * If timeout is not positive, the watchdog is disabled.
     */
    //% shim=control::setWatchdog
    function setWatchdog(timeout_s: int32): void;

    /**
     * Reset timeout on previously enabled watchdog.
     */
    //% shim=control::feedWatchdog
    function feedWatchdog(): void;
}


declare interface DigitalInOutPin {
    /**
     * Read a pin or connector as either 0 or 1
     * @param name pin to read from
     */
    //% help=pins/digital-read weight=61
    //% blockId=device_get_digital_pin block="digital read|pin %name" blockGap=8
    //% blockNamespace=pins
    //% name.fieldEditor="gridpicker"
    //% name.fieldOptions.width=220
    //% name.fieldOptions.columns=4 shim=DigitalInOutPinMethods::digitalRead
    digitalRead(): boolean;

    /**
     * Set a pin or connector value to either 0 or 1.
     * @param name pin to write to
     * @param value value to set on the pin
     */
    //% help=pins/digital-write weight=60
    //% blockId=device_set_digital_pin block="digital write|pin %name|to %value=toggleHighLow"
    //% blockNamespace=pins
    //% name.fieldEditor="gridpicker"
    //% name.fieldOptions.width=220
    //% name.fieldOptions.columns=4 shim=DigitalInOutPinMethods::digitalWrite
    digitalWrite(value: boolean): void;

    /**
     * Make this pin a digital input, and create events where the timestamp is the duration
     * that this pin was either ``high`` or ``low``.
     */
    //% help=pins/on-pulsed weight=16 blockGap=8
    //% blockId=pins_on_pulsed block="on|pin %pin|pulsed %pulse"
    //% blockNamespace=pins
    //% pin.fieldEditor="gridpicker"
    //% pin.fieldOptions.width=220
    //% pin.fieldOptions.columns=4
    //% deprecated=1 hidden=1 shim=DigitalInOutPinMethods::onPulsed
    onPulsed(pulse: PulseValue, body: () => void): void;

    /**
     * Register code to run when a pin event occurs. 
     */
    //% help=pins/on-event weight=20 blockGap=8
    //% blockId=pinsonevent block="on|pin %pin|%event"
    //% blockNamespace=pins
    //% pin.fieldEditor="gridpicker"
    //% pin.fieldOptions.width=220
    //% pin.fieldOptions.columns=4 shim=DigitalInOutPinMethods::onEvent
    onEvent(event: PinEvent, body: () => void): void;

    /**
     * Return the duration of a pulse in microseconds
     * @param name the pin which measures the pulse
     * @param value the value of the pulse (default high)
     * @param maximum duration in micro-seconds
     */
    //% blockId="pins_pulse_in" block="pulse in (µs)|pin %name|pulsed %high||timeout %maxDuration (µs)"
    //% weight=18 blockGap=8
    //% help="pins/pulse-in"
    //% blockNamespace=pins
    //% pin.fieldEditor="gridpicker"
    //% pin.fieldOptions.width=220
    //% pin.fieldOptions.columns=4 maxDuration.defl=2000000 shim=DigitalInOutPinMethods::pulseIn
    pulseIn(value: PulseValue, maxDuration?: int32): int32;

    /**
     * Set the pull direction of this pin.
     * @param name pin to set the pull mode on
     * @param pull one of the mbed pull configurations: PullUp, PullDown, PullNone
     */
    //% help=pins/set-pull weight=17 blockGap=8
    //% blockId=device_set_pull block="set pull|pin %pin|to %pull"
    //% blockNamespace=pins
    //% name.fieldEditor="gridpicker"
    //% name.fieldOptions.width=220
    //% name.fieldOptions.columns=4 shim=DigitalInOutPinMethods::setPull
    setPull(pull: PinPullMode): void;
}
declare namespace control {

    /**
     * Announce that an event happened to registered handlers.
     * @param src ID of the Component that generated the event
     * @param value Component specific code indicating the cause of the event.
     * @param mode optional definition of how the event should be processed after construction.
     */
    //% weight=21 blockGap=12 blockId="control_raise_event"
    //% block="raise event|from %src|with value %value" blockExternalInputs=1
    //% help=control/raise-event shim=control::raiseEvent
    function raiseEvent(src: int32, value: int32): void;

    /**
     * Allocates the next user notification event
     */
    //% help=control/allocate-notify-event shim=control::allocateNotifyEvent
    function allocateNotifyEvent(): int32;

    /**
     * Determine the version of system software currently running.
     */
    //% blockId="control_device_dal_version" block="device dal version"
    //% help=control/device-dal-version shim=control::deviceDalVersion
    function deviceDalVersion(): string;

    /** Write data to DMESG debugging buffer. */
    //% shim=control::dmesg
    function dmesg(s: string): void;

    /**
     * Determines if the USB has been enumerated.
     */
    //% shim=control::isUSBInitialized
    function isUSBInitialized(): boolean;
}
declare namespace serial {

    /** Send DMESG debug buffer over serial. */
    //% shim=serial::writeDmesg
    function writeDmesg(): void;
}

declare interface AnalogInPin {
    //% help=pins/analog-read weight=53
    //% blockId=device_get_analog_pin block="analog read|pin %name" blockGap="8"
    //% blockNamespace=pins
    //% name.fieldEditor="gridpicker"
    //% name.fieldOptions.width=220
    //% name.fieldOptions.columns=4 shim=AnalogInPinMethods::analogRead
    analogRead(): int32;
}

declare interface AnalogOutPin {
    //% help=pins/analog-write weight=52
    //% blockId=device_set_analog_pin block="analog write|pin %name|to %value" blockGap=8
    //% blockNamespace=pins
    //% name.fieldEditor="gridpicker"
    //% name.fieldOptions.width=220
    //% name.fieldOptions.columns=4
    //% value.min=0 value.max=1023 shim=AnalogOutPinMethods::analogWrite
    analogWrite(value: int32): void;
}

declare interface PwmOnlyPin {
    //% help=pins/analog-set-period weight=51
    //% blockId=device_set_analog_period block="analog set period|pin %pin|to (µs)%period"
    //% blockNamespace=pins
    //% name.fieldEditor="gridpicker"
    //% name.fieldOptions.width=220
    //% name.fieldOptions.columns=4 shim=PwmOnlyPinMethods::analogSetPeriod
    analogSetPeriod(period: int32): void;

    //% help=pins/servo-write weight=41 group="Servo"
    //% blockId=device_set_servo_pin block="servo write|pin %name|to %value=protractorPicker" blockGap=8
    //% parts=microservo trackArgs=0
    //% blockNamespace=pins
    //% name.fieldEditor="gridpicker"
    //% name.fieldOptions.width=220
    //% name.fieldOptions.columns=4
    //% value.defl=90 shim=PwmOnlyPinMethods::servoWrite
    servoWrite(value?: int32): void;

    //% help=pins/servo-set-pulse weight=40 group="Servo" blockGap=8
    //% blockId=device_set_servo_pulse block="servo set pulse|pin %value|to (µs) %duration"
    //% parts=microservo blockNamespace=pins
    //% name.fieldEditor="gridpicker"
    //% name.fieldOptions.width=220
    //% name.fieldOptions.columns=4 shim=PwmOnlyPinMethods::servoSetPulse
    servoSetPulse(duration: int32): void;

    //% blockHidden=1 shim=PwmOnlyPinMethods::servoSetContinuous
    servoSetContinuous(continuous: boolean): void;
}

declare interface I2C {
    //% repeat.defl=0 shim=I2CMethods::readBuffer
    readBuffer(address: int32, size: int32, repeat?: boolean): Buffer;

    //% repeat.defl=0 shim=I2CMethods::writeBuffer
    writeBuffer(address: int32, buf: Buffer, repeat?: boolean): int32;
}

declare namespace pins {
    //% help=pins/create-i2c
    //% parts=i2c shim=pins::createI2C
    function createI2C(sda: DigitalInOutPin, scl: DigitalInOutPin): I2C;

    //% help=pins/create-spi
    //% parts=spi shim=pins::createSPI
    function createSPI(mosiPin: DigitalInOutPin, misoPin: DigitalInOutPin, sckPin: DigitalInOutPin): SPI;

    //% parts=spi shim=pins::createSlaveSPI
    function createSlaveSPI(mosiPin: DigitalInOutPin, misoPin: DigitalInOutPin, sckPin: DigitalInOutPin, csPin: DigitalInOutPin): SPI;
}

declare interface SPI {
    //% shim=SPIMethods::write
    write(value: int32): int32;

    //% argsNullable shim=SPIMethods::transfer
    transfer(command: Buffer, response: Buffer): void;

    //% shim=SPIMethods::setFrequency
    setFrequency(frequency: int32): void;

    //% shim=SPIMethods::setMode
    setMode(mode: int32): void;
}

// Auto-generated. Do not edit. Really.

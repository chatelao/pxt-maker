forever(function () {
    pins.LED.digitalWrite(false)
    serial.writeLine("LED ON")
    pause(100)
    pins.LED.digitalWrite(true)
    serial.writeLine("LED OFF")
    pause(100)
})

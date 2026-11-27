radio.setGroup(42)
serial.writeLine("HIL_READY:espnow-tx")
forever(function () {
    radio.sendNumber(101)
    radio.sendString("HIL_NOW")
    radio.sendValue("temp", 25)
    pause(500)
})

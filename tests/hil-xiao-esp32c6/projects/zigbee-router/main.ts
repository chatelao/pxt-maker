let zbRouterPassed = false
if (!zigbee.startNetwork(ZigbeeRole.Router, 15)) {
    serial.writeLine("HIL_FAIL:H-ZB-02:startNetwork")
}
zigbee.onJoined(function () {
    zigbee.reportTemperature(24.5)
    zigbee.setSwitch(true)
    if (!zbRouterPassed) {
        zbRouterPassed = true
        serial.writeLine("HIL_PASS:H-ZB-02")
    }
})
forever(function () {
    if (zigbee.isJoined()) {
        zigbee.sendString("hello-zb")
    }
    pause(1000)
})

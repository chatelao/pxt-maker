let zbCoordPassed = false
if (!zigbee.startNetwork(ZigbeeRole.Coordinator, 15)) {
    serial.writeLine("HIL_FAIL:H-ZB-01:startNetwork")
}
zigbee.onReceivedString(function (message) {
    if (!zbCoordPassed && message === "hello-zb") {
        zbCoordPassed = true
        serial.writeLine("HIL_PASS:H-ZB-01")
    }
})

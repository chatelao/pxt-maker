let thrPassed = false
if (!thread.joinGroup(15, 0x1234, "HilThreadNet")) {
    serial.writeLine("HIL_FAIL:H-THR-01:joinGroup")
}
thread.onReceivedString(function (topic, message) {
    if (!thrPassed && topic === "hil" && message === "pong") {
        thrPassed = true
        serial.writeLine("HIL_PASS:H-THR-01")
    }
})
forever(function () {
    thread.sendString("hil", "ping")
    thread.sendValue("seq", 7)
    pause(1000)
})

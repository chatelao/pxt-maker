let thrNodeBPassed = false
if (!thread.joinGroup(15, 0x1234, "HilThreadNet")) {
    serial.writeLine("HIL_FAIL:H-THR-02:joinGroup")
}
thread.onReceivedString(function (topic, message) {
    if (topic === "hil" && message === "ping") {
        thread.sendString("hil", "pong")
        if (!thrNodeBPassed) {
            thrNodeBPassed = true
            serial.writeLine("HIL_PASS:H-THR-02")
        }
    }
})

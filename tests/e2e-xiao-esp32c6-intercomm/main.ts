enum RadioMessage {
    message1 = 49434
}
radio.onReceivedString(function (receivedString) {
    serial.writeLine("RX_STR:" + receivedString)
})
radio.onReceivedMessage(RadioMessage.message1, function () {
    serial.writeLine("RX_MSG")
})
radio.setGroup(42)
radio.sendNumber(123)
radio.sendValue("temp", 25)
radio.sendString("hello-c6")
radio.sendMessage(RadioMessage.message1)

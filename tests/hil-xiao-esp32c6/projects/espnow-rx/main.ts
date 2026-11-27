let gotNum = false
let gotStr = false
let gotVal = false
let reported = false

function checkPass() {
    if (!reported && gotNum && gotStr && gotVal) {
        reported = true
        serial.writeLine("HIL_PASS:H-NOW-01")
    }
}

radio.setGroup(42)
radio.onReceivedNumber(function (num) {
    if (num === 101) {
        gotNum = true
        checkPass()
    }
})
radio.onReceivedString(function (str) {
    if (str === "HIL_NOW") {
        gotStr = true
        checkPass()
    }
})
radio.onReceivedValue(function (name, value) {
    if (name === "temp" && value === 25) {
        gotVal = true
        checkPass()
    }
})

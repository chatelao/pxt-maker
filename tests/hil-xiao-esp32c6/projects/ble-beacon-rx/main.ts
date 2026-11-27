let blePassed = false
bluetooth.onAdvertisementReceived(function (data, rssi) {
    if (!blePassed && data.toString().indexOf("HIL_BLE_OK") >= 0) {
        blePassed = true
        serial.writeLine("HIL_PASS:H-BLE-01")
    }
})
bluetooth.startScanning()

bluetooth.setDeviceName("XIAO-HIL-TX")
bluetooth.advertiseString("HIL_BLE_OK", 100)
serial.writeLine("HIL_READY:ble-beacon-tx")

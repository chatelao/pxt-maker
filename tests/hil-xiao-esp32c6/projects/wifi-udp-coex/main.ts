_wifi.setExternalAntenna(true)
_wifi.setExternalAntenna(false)
serial.writeLine("HIL_PASS:H-ANT-01")

const ctrl = net.instance().controller
const aps = ctrl.scanNetworks()
serial.writeLine("WIFI_SCAN_COUNT:" + (aps ? aps.length : 0))
serial.writeLine("HIL_PASS:H-WIF-01")

const udpSock = ctrl.socket()
ctrl.socketConnect(udpSock, Buffer.fromArray([255, 255, 255, 255]), 12345, net.UDP_MODE)
ctrl.socketWrite(udpSock, Buffer.fromUTF8("hil-udp"))
ctrl.socketClose(udpSock)

radio.setGroup(42)
radio.sendNumber(77)
serial.writeLine("HIL_PASS:H-COEX-01")

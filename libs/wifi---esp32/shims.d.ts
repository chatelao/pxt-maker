// Auto-generated. Do not edit.
declare namespace _wifi {

    /** Allocate new socket. */
    //% shim=_wifi::socketAlloc
    function socketAlloc(): int32;

    /** Connect with TLS */
    //% promise shim=_wifi::socketConnectTLS
    function socketConnectTLS(fd: int32, host: string, port: int32): int32;

    /** Connect with plain TCP */
    //% promise shim=_wifi::socketConnectTCP
    function socketConnectTCP(fd: int32, host: string, port: int32): int32;

    /** Connect/bind with UDP (supports broadcast) */
    //% promise shim=_wifi::socketConnectUDP
    function socketConnectUDP(fd: int32, host: string, port: int32): int32;

    /** Write to socket */
    //% promise shim=_wifi::socketWrite
    function socketWrite(fd: int32, data: Buffer): int32;

    /** Read from a socket; the return type is really number|Buffer */
    //% promise shim=_wifi::socketRead
    function socketRead(fd: int32, size: int32): int32;

    /** See how many bytes are available for reading */
    //% shim=_wifi::socketBytesAvailable
    function socketBytesAvailable(fd: int32): int32;

    /** Close the socket if open */
    //% shim=_wifi::socketClose
    function socketClose(fd: int32): int32;
}
declare namespace _wifi {

    /** Get ID used in events. */
    //% shim=_wifi::eventID
    function eventID(): int32;

    /** Start a WiFi network scan. */
    //% shim=_wifi::scanStart
    function scanStart(): void;

    /** Starts an HTTP server with a login dialog route */
    //% shim=_wifi::startLoginServer
    function startLoginServer(hostName: string): void;

    /** Get the results of the scan if any. */
    //% shim=_wifi::scanResults
    function scanResults(): Buffer;

    /** Initiate connection. */
    //% shim=_wifi::connect
    function connect(ssid: string, pass: string): int32;

    /** Initiate disconnection. */
    //% shim=_wifi::disconnect
    function disconnect(): int32;

    /** Check if connected. */
    //% shim=_wifi::isConnected
    function isConnected(): boolean;

    /** Check if login server is running */
    //% shim=_wifi::isLoginServerEnabled
    function isLoginServerEnabled(): boolean;

    /** Return ipv4 address, netmask, and gateway. */
    //% shim=_wifi::ipInfo
    function ipInfo(): Buffer;

    /** Get RSSI of current connection or -128 when not connected. */
    //% shim=_wifi::rssi
    function rssi(): int32;

    /** Start a WiFi access point (SoftAP). Password must be empty (open) or 8..63 chars (WPA2). */
    //% shim=_wifi::startAP
    function startAP(ssid: string, password: string, channel: int32, maxConnections: int32): int32;

    /** Stop the WiFi access point (SoftAP). */
    //% shim=_wifi::stopAP
    function stopAP(): void;

    /** Check if the WiFi access point is enabled. */
    //% shim=_wifi::isAPEnabled
    function isAPEnabled(): boolean;

    /** Return AP ipv4 address, netmask, and gateway. */
    //% shim=_wifi::apIpInfo
    function apIpInfo(): Buffer;

    /** Return the number of stations currently connected to the access point. */
    //% shim=_wifi::apStationCount
    function apStationCount(): int32;

    /** Start the embedded Web Dashboard server. */
    //% shim=_wifi::dashboardStart
    function dashboardStart(title: string, captivePortal: boolean): void;

    /** Stop the embedded Web Dashboard server and captive-portal DNS. */
    //% shim=_wifi::dashboardStop
    function dashboardStop(): void;

    /** Clear all registered Web Dashboard widgets. */
    //% shim=_wifi::dashboardClear
    function dashboardClear(): void;

    /** Register or update a Web Dashboard widget. */
    //% shim=_wifi::dashboardUpsertWidget
    function dashboardUpsertWidget(id: int32, kind: int32, label: string, minVal: int32, maxVal: int32, value: int32, text: string): void;

    /** Pop the next queued (widgetId, value) event from the Web Dashboard as an 8-byte buffer, or empty buffer if none. */
    //% shim=_wifi::dashboardNextEvent
    function dashboardNextEvent(): Buffer;

    /** Select external U.FL antenna (true) or onboard ceramic antenna (false). */
    //% shim=_wifi::setExternalAntenna
    function setExternalAntenna(external: boolean): void;
}

// Auto-generated. Do not edit. Really.

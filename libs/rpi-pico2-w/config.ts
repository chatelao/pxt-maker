namespace config {
    export const PIN_P0 = 0
    export const PIN_P1 = 1
    export const PIN_P2 = 2
    export const PIN_P3 = 3
    export const PIN_P4 = 4
    export const PIN_P5 = 5
    export const PIN_P6 = 6
    export const PIN_P7 = 7
    export const PIN_P8 = 8
    export const PIN_P9 = 9

    export const PIN_P10 = 10
    export const PIN_P11 = 11
    export const PIN_P12 = 12
    export const PIN_P13 = 13
    export const PIN_P14 = 14
    export const PIN_P15 = 15
    export const PIN_P16 = 16
    export const PIN_P17 = 17
    export const PIN_P18 = 18
    export const PIN_P19 = 19

    export const PIN_P20 = 20
    export const PIN_P21 = 21
    export const PIN_P22 = 22
    export const PIN_P23 = 23
    export const PIN_P24 = 24
    export const PIN_P25 = 25
    export const PIN_P26 = 26
    export const PIN_P27 = 27
    export const PIN_P28 = 28
    export const PIN_P29 = 29

    // Arduino-style aliases for standard Maker blocks & samples
    export const PIN_D0 = PIN_P0
    export const PIN_D1 = PIN_P1
    export const PIN_D2 = PIN_P2
    export const PIN_D3 = PIN_P3
    export const PIN_D4 = PIN_P4
    export const PIN_D5 = PIN_P5
    export const PIN_D6 = PIN_P6
    export const PIN_D7 = PIN_P7
    export const PIN_D8 = PIN_P8
    export const PIN_D9 = PIN_P9
    export const PIN_D10 = PIN_P10
    export const PIN_D11 = PIN_P11
    export const PIN_D12 = PIN_P12
    export const PIN_D13 = PIN_P13

    export const PIN_A0 = PIN_P26
    export const PIN_A1 = PIN_P27
    export const PIN_A2 = PIN_P28
    export const PIN_A3 = PIN_P29

    // Default UART0 (GP0/GP1), I2C0 (GP4/GP5), SPI0 (GP16..GP19)
    export const PIN_TX = PIN_P0
    export const PIN_RX = PIN_P1
    export const PIN_SDA = PIN_P4
    export const PIN_SCL = PIN_P5
    export const PIN_MISO = PIN_P16
    export const PIN_SCK = PIN_P18
    export const PIN_MOSI = PIN_P19

    export const PIN_JACK_TX = 1

    // Note: On Pico 2 W hardware, the onboard LED is routed to CYW43 WL_GPIO0;
    // mapped to PIN_P25 until CYW43 driver support is enabled.
    export const PIN_LED = PIN_P25
}

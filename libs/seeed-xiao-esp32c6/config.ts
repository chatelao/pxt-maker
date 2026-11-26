namespace config {
    // Edge pins D0..D10 mapped to ESP32-C6 GPIOs
    export const PIN_D0 = 0
    export const PIN_D1 = 1
    export const PIN_D2 = 2
    export const PIN_D3 = 21
    export const PIN_D4 = 22
    export const PIN_D5 = 23
    export const PIN_D6 = 16
    export const PIN_D7 = 17
    export const PIN_D8 = 19
    export const PIN_D9 = 20
    export const PIN_D10 = 18

    // Analog inputs (ADC1_CH0..ADC1_CH2)
    export const PIN_A0 = PIN_D0
    export const PIN_A1 = PIN_D1
    export const PIN_A2 = PIN_D2

    // Default UART, I2C, and SPI pins
    export const PIN_TX = PIN_D6
    export const PIN_RX = PIN_D7
    export const PIN_SDA = PIN_D4
    export const PIN_SCL = PIN_D5
    export const PIN_SCK = PIN_D8
    export const PIN_MISO = PIN_D9
    export const PIN_MOSI = PIN_D10

    // Onboard Yellow User LED (active-low on XIAO ESP32-C6) and BOOT button
    export const PIN_LED = 15
    export const PIN_BTN_A = 9

    // RF antenna switch control: GPIO3 = power enable (LOW), GPIO14 = antenna select (LOW=ceramic, HIGH=U.FL)
    export const PIN_WIFI_RESET = 3
    export const PIN_WIFI_GPIO0 = 14
}

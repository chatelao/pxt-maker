# Christmas Tree (60-LED Tannenbaum PCB)

MakeCode extension for the 60-LED WS2812B Christmas Tree PCB (Seeed Studio XIAO ESP32-C6 / RP2040), porting `tannenbaum_layout.py` and `tannenbaum_palettes.py` from `chatelao/aity-xmas-2026`.

- **NeoPixel Data Pin:** `D10` (`60` LEDs, `GRB`)
- **Buttons:** `D5` (A), `D6` (B) with internal pull-up (active-low, 50 ms debounce, polling & `onButtonPressed` event block)
- **Segments:** `BoughLow` (0..17), `BoughMid` (18..31), `BoughHigh` (32..44), `Stem` (45..49), `Star` (50..59)
- **Virtual Segments:** `StarInner` (50, 53, 54, 57, 58) & `StarOuter` (51, 52, 55, 56, 59), plus `setVirtualSegmentPixel` / `VirtualSegment`
- **Tree Variants:** `PCB` (1:1) & `Holz` (`BoughMid` reversed)
- **Color Pipeline:** Uncorrected shadow buffer (`getPixel` / `fadeAll`) + CIE 1931 L* luminance curve + WS2812B white balance `(255, 176, 240)`
- **TwinkleFOX & Palettes (`palettes.ts`):** All 10 palettes (`RetroC9` .. `MagentaGreen`), `TreeColor` constants, `colorFromPalette`, `blendTowardPalette`, `attackDecayWave8`, `coolLikeIncandescent`, `computeOneTwinkle`, and `renderTwinkleTree`

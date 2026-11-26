/**
 * TwinkleFOX Palettes, Christmas Colors & Stateless Twinkle Engine (from tannenbaum_palettes.py).
 */

enum TreePalette {
    //% block="0: Retro C9"
    RetroC9 = 0,
    //% block="1: Holly (Tannengruen & Beeren)"
    Holly = 1,
    //% block="2: Fairy Light (Warmes Gold)"
    FairyLight = 2,
    //% block="3: Rot-Gruen-Weiss"
    RedGreenWhite = 3,
    //% block="4: Zuckerstange (Rot-Weiss)"
    CandyCane = 4,
    //% block="5: Glitzerschnee"
    Snow = 5,
    //% block="6: Eis-Kristall"
    Ice = 6,
    //% block="7: Blaue Winternacht"
    BlueNight = 7,
    //% block="8: Regenbogen"
    Rainbow = 8,
    //% block="9: Magenta-Hellgruen"
    MagentaGreen = 9
}

enum TreeColor {
    //% block="C9 Rot"
    C9Red = 0xB80400,
    //% block="C9 Orange"
    C9Orange = 0x902C02,
    //% block="C9 Gruen"
    C9Green = 0x046202,
    //% block="C9 Blau"
    C9Blue = 0x070758,
    //% block="C9 Warmweiss"
    C9White = 0xE0A040,
    //% block="Lichterkette Hell"
    FairyFull = 0xFF9D2A,
    //% block="Lichterkette Mittel"
    FairyHalf = 0x7F4E15,
    //% block="Lichterkette Gedimmt"
    FairyQuarter = 0x3F270A,
    //% block="Holly Gruen"
    HollyGreen = 0x00580C,
    //% block="Holly Beere Rot"
    HollyRed = 0xB00402,
    //% block="Schneeweiss"
    SnowWhite = 0xE0F0FF,
    //% block="Schnee Gedimmt"
    SnowHalf = 0x303840,
    //% block="Eisblau Dunkel"
    IceBlue1 = 0x0C3CB4,
    //% block="Eisblau Mittel"
    IceBlue2 = 0x1880FF,
    //% block="Eisblau Hell"
    IceBlue3 = 0xA0DCFF,
    //% block="Magenta"
    Magenta = 0xFF00C8,
    //% block="Hellgruen"
    LightGreen = 0x64FF78,
    //% block="Mint-Cyan"
    MintCyan = 0x00DCFF,
    //% block="Sanftes Violett"
    SoftViolet = 0xAA50FF,
    //% block="Hintergrund Dunkelgruen"
    BgDarkGreen = 0x000501,
    //% block="Hintergrund Warm"
    BgWarmDark = 0x080401,
    //% block="Hintergrund Schwarz"
    BgBlack = 0x000000
}

namespace christmasTree {
    // 10 palettes x 16 entries x 3 bytes (RGB) packed as hex strings -> Buffers on demand
    const PALETTE_HEX: string[] = [
        // 0: PAL_RETRO_C9
        "b80400902c02b80400902c02902c02b80400902c02b80400046202046202046202046202070758070758070758e0a040",
        // 1: PAL_HOLLY
        "00580c00580c00580c00580c00580c00580c00580c00580c00580c00580c00580c00580c00580c00580c00580cb00402",
        // 2: PAL_FAIRY_LIGHT
        "ff9d2aff9d2aff9d2aff9d2a7f4e157f4e15ff9d2aff9d2a3f270a3f270aff9d2aff9d2aff9d2aff9d2aff9d2aff9d2a",
        // 3: PAL_RED_GREEN_WHITE
        "ff0000ff0000ff0000ff0000ff0000ff0000ff000000ff0000ff0000ff0000ff0000ff0000ff0000ff00ffffffffffff",
        // 4: PAL_RED_WHITE (Zuckerstange)
        "ff0000ff0000ff0000ff0000ff0000ff0000ff0000ff0000ffffffffffffffffffffffffffffffffffffffffffffffff",
        // 5: PAL_SNOW
        "303840303840303840303840303840303840303840303840303840303840303840303840303840303840303840e0f0ff",
        // 6: PAL_ICE
        "0c3cb40c3cb40c3cb40c3cb40c3cb40c3cb40c3cb40c3cb41880ff1880ff1880ff1880ff1880ffa0dcffa0dcffe0f0ff",
        // 7: PAL_BLUE_WHITE
        "0000ff0000ff0000ff0000ff0000ff0000ff0000ff0000ff0000ff0000ff0000ff0000ff0000ffffffffffffffffffff",
        // 8: PAL_RAINBOW
        "ff0000ff4000ff8000ffc000ffff0080ff0000ff0000ff8000ffff0080ff0000ff4000ff8000ffc000ffff00ff0080",
        // 9: PAL_MAGENTA_GREEN
        "ff00c8ff00c8ff00c8ff00c8ff00c8aa50ffaa50ffaa50ff64ff7864ff7864ff7864ff7864ff7800dcff00dcff00dcff"
    ];

    let _palBufs: Buffer[] = null;
    let _activePalBuf: Buffer = null;

    function hexVal(ch: number): number {
        if (ch >= 48 && ch <= 57) return ch - 48;
        if (ch >= 97 && ch <= 102) return ch - 87;
        if (ch >= 65 && ch <= 70) return ch - 55;
        return 0;
    }

    function getPalBuf(pal: TreePalette): Buffer {
        if (!_palBufs) {
            _palBufs = [];
            for (let p = 0; p < PALETTE_HEX.length; p++) {
                const hex = PALETTE_HEX[p];
                const buf = pins.createBuffer(48);
                for (let i = 0; i < 48; i++) {
                    const hi = hexVal(hex.charCodeAt(i * 2));
                    const lo = hexVal(hex.charCodeAt(i * 2 + 1));
                    buf[i] = (hi << 4) | lo;
                }
                _palBufs.push(buf);
            }
        }
        let idx = pal | 0;
        if (idx < 0 || idx >= _palBufs.length) idx = 0;
        return _palBufs[idx];
    }

    function ensureActivePalBuf(): Buffer {
        if (!_activePalBuf) {
            _activePalBuf = pins.createBuffer(48);
            const src = getPalBuf(TreePalette.RetroC9);
            for (let i = 0; i < 48; i++) _activePalBuf[i] = src[i];
        }
        return _activePalBuf;
    }

    function colorFromBuffer(palBuf: Buffer, index8: number, brightness8: number, blend: boolean): number {
        const idx = index8 & 0xff;
        const slot = idx >> 4;
        const frac = (idx & 0x0f) << 4;
        const o1 = slot * 3;

        let r = palBuf[o1];
        let g = palBuf[o1 + 1];
        let b = palBuf[o1 + 2];

        if (blend && frac != 0) {
            const o2 = ((slot + 1) & 0x0f) * 3;
            const inv = 256 - frac;
            r = (r * inv + palBuf[o2] * frac) >> 8;
            g = (g * inv + palBuf[o2 + 1] * frac) >> 8;
            b = (b * inv + palBuf[o2 + 2] * frac) >> 8;
        }

        if (brightness8 < 255) {
            const bScale = (brightness8 & 0xff) + 1;
            r = (r * bScale) >> 8;
            g = (g * bScale) >> 8;
            b = (b * bScale) >> 8;
        }

        return (r << 16) | (g << 8) | b;
    }

    /**
     * Gibt eine abgestimmte Weihnachts- oder Hintergrundfarbe zurueck.
     */
    //% blockId=xmas_tree_color
    //% block="Weihnachtsfarbe %c"
    //% group="Twinkle & Paletten" weight=48
    export function treeColor(c: TreeColor): number {
        return c | 0;
    }

    /**
     * Anzahl der eingebauten Farbpaletten (10).
     */
    export function paletteCount(): number {
        return PALETTE_HEX.length;
    }

    /**
     * Gibt die naechste Palette (um step weiter) zurueck – ideal zum Durchschalten per Taster.
     */
    //% blockId=xmas_next_palette
    //% block="naechste Palette nach %current||Schritt %step"
    //% step.defl=1
    //% group="Twinkle & Paletten" weight=44
    export function nextPalette(current: TreePalette, step: number = 1): TreePalette {
        const n = PALETTE_HEX.length;
        return (((current | 0) + (step | 0)) % n + n) % n;
    }

    /**
     * Liest eine Farbe aus einer 16-Eintrags-Palette (index8: 0..255, wie FastLED ColorFromPalette).
     */
    //% blockId=xmas_color_from_palette
    //% block="Farbe aus Palette %palette|bei Index %index8||Helligkeit %brightness8|mischen %blend"
    //% index8.min=0 index8.max=255
    //% brightness8.min=0 brightness8.max=255 brightness8.defl=255
    //% blend.defl=true
    //% group="Twinkle & Paletten" weight=46
    export function colorFromPalette(palette: TreePalette, index8: number, brightness8: number = 255, blend: boolean = true): number {
        return colorFromBuffer(getPalBuf(palette), index8, brightness8, blend);
    }

    /**
     * Setzt die aktive Arbeits-Palette direkt (fuer sanftes Ueberblenden).
     */
    export function setActivePalette(palette: TreePalette): void {
        const dst = ensureActivePalBuf();
        const src = getPalBuf(palette);
        for (let i = 0; i < 48; i++) dst[i] = src[i];
    }

    /**
     * Blendet die aktive Arbeits-Palette schrittweise Richtung Zielpalette (wie FastLED nblendPaletteTowardPalette).
     */
    export function blendTowardPalette(target: TreePalette, maxChanges: number = 12): void {
        const cur = ensureActivePalBuf();
        const tgt = getPalBuf(target);
        let changes = 0;
        for (let i = 0; i < 48; i++) {
            const c = cur[i];
            const t = tgt[i];
            if (c != t && changes < maxChanges) {
                cur[i] = c < t ? c + 1 : c - 1;
                changes++;
            }
        }
    }

    /**
     * Liest eine Farbe aus der aktuellen Ueberblend-Arbeits-Palette.
     */
    export function colorFromActivePalette(index8: number, brightness8: number = 255, blend: boolean = true): number {
        return colorFromBuffer(ensureActivePalBuf(), index8, brightness8, blend);
    }

    /**
     * Dreieckswelle aus TwinkleFOX: schnelles Aufgluehen (0..85 -> 0..255), langsames Abkuehlen (86..255 -> 255..0).
     */
    //% blockId=xmas_attack_decay_wave8
    //% block="Twinkle-Welle (0..255) bei Phase %phase8"
    //% phase8.min=0 phase8.max=255
    //% group="Geometrie & Mathe" weight=24 advanced=true
    export function attackDecayWave8(phase8: number): number {
        const i = phase8 & 0xff;
        if (i < 86) {
            return i * 3;
        }
        const d = i - 86;
        return 255 - (d + (d >> 1));
    }

    /**
     * Simuliert das Abkuehlen eines Gluehdrahts (Rotverschiebung beim Ausdimmen ab phase >= 128).
     */
    //% blockId=xmas_cool_incandescent
    //% block="Gluehdraht-Abkuehlung %rgb=colorNumberPicker|bei Phase %phase8"
    //% phase8.min=0 phase8.max=255
    //% group="Geometrie & Mathe" weight=22 advanced=true
    export function coolLikeIncandescent(rgb: number, phase8: number): number {
        const p = phase8 & 0xff;
        if (p < 128) return rgb;
        const cooling = ((p - 128) * 2) & 0xff;
        const r = (rgb >> 16) & 0xff;
        let g = (rgb >> 8) & 0xff;
        let b = rgb & 0xff;
        g = (g * (256 - (cooling >> 1))) >> 8;
        b = (b * (256 - cooling)) >> 8;
        return (r << 16) | (g << 8) | b;
    }

    function avgLight(rgb: number): number {
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = rgb & 0xff;
        return ((r + g + b) / 3) | 0;
    }

    /**
     * Zustandslose TwinkleFOX-Berechnung fuer ein einzelnes Pixel zum Zeitpunkt ms (in Millisekunden).
     */
    export function computeOneTwinkle(
        ms: number,
        salt: number,
        palette: TreePalette,
        speed: number = 4,
        density: number = 5,
        coolIncandescent: boolean = true,
        bgColor: number = 0x000000
    ): number {
        const sp = Math.max(0, Math.min(8, speed | 0));
        const dens = Math.max(0, Math.min(8, density | 0));
        const s = salt | 0;

        let prng16 = ((s + 1) * 2053 + 1384) & 0xffff;
        const msInt = ms | 0;
        const myClock30 = (msInt >>> (8 - sp)) & 0x3fffffff;

        const clockOffset = prng16;
        prng16 = (prng16 * 2053 + 1384) & 0xffff;
        const speedMult = ((((prng16 & 0xff) >> 4) + (prng16 & 0x0f)) & 0x0f) + 0x08;

        const myClock = ((Math.imul(myClock30, speedMult) >>> 3) + clockOffset) >>> 0;
        const myUnique8 = (prng16 >> 8) & 0xff;

        const ticks = (myClock >>> 8) & 0xffff;
        const phase = myClock & 0xff;

        const waveHash = (ticks * 2053 + 1384 + myUnique8) & 0xffff;
        const slowcycle8 = ((waveHash >> 8) + (waveHash & 0xff)) & 0xff;
        const colorIndex = (slowcycle8 - s) & 0xff;

        let c = 0;
        if (((slowcycle8 & 0x0e) >> 1) < dens) {
            const bright = attackDecayWave8(phase);
            if (bright > 0) {
                c = colorFromPalette(palette, colorIndex, bright, false);
                if (coolIncandescent) {
                    c = coolLikeIncandescent(c, phase);
                }
            }
        }

        if (bgColor == 0) {
            return c;
        }

        const bgBright = avgLight(bgColor);
        const cBright = avgLight(c);
        const deltaBright = cBright - bgBright;
        if (deltaBright >= 32) {
            return c;
        }
        if (deltaBright > 0) {
            const amount = deltaBright * 8;
            const br = (bgColor >> 16) & 0xff;
            const bg = (bgColor >> 8) & 0xff;
            const bb = bgColor & 0xff;
            const cr = (c >> 16) & 0xff;
            const cg = (c >> 8) & 0xff;
            const cb = c & 0xff;
            const rr = br + (((cr - br) * amount) >> 8);
            const gg = bg + (((cg - bg) * amount) >> 8);
            const bbOut = bb + (((cb - bb) * amount) >> 8);
            return (rr << 16) | (gg << 8) | bbOut;
        }
        return bgColor;
    }

    /**
     * Rendert alle 60 LEDs mit der TwinkleFOX-Engine zum angegebenen Zeitpunkt ms (ohne show()).
     */
    export function renderTwinkleTreeAt(
        ms: number,
        branchPalette: TreePalette,
        starPalette: TreePalette,
        speed: number = 4,
        density: number = 5,
        bgColor: number = 0x000000
    ): void {
        for (let i = 0; i < NUM_PIXELS; i++) {
            const pal = i >= 50 ? starPalette : branchPalette;
            setPixel(i, computeOneTwinkle(ms, i, pal, speed, density, true, bgColor));
        }
    }

    /**
     * Rendert alle 60 LEDs im Puffer mit der TwinkleFOX-Glitzer-Engine (nutzt aktuelle Laufzeit).
     * Optional kann der Stern (LED 50..59) eine eigene Palette erhalten.
     */
    //% blockId=xmas_render_twinkle_tree
    //% block="Twinkle-Baum rendern Zweige %branchPalette||Stern %starPalette|Tempo %speed|Dichte %density|Hintergrund %bgColor=colorNumberPicker"
    //% branchPalette.defl=TreePalette.RetroC9
    //% starPalette.defl=TreePalette.FairyLight
    //% speed.min=0 speed.max=8 speed.defl=4
    //% density.min=0 density.max=8 density.defl=5
    //% bgColor.defl=0
    //% group="Twinkle & Paletten" weight=50
    export function renderTwinkleTree(
        branchPalette: TreePalette,
        starPalette?: TreePalette,
        speed: number = 4,
        density: number = 5,
        bgColor: number = 0x000000
    ): void {
        const starPal = starPalette !== undefined ? starPalette : branchPalette;
        renderTwinkleTreeAt(control.millis(), branchPalette, starPal, speed, density, bgColor);
    }
}

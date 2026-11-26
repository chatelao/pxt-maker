/**
 * 60-LED Christmas Tree PCB (Seeed Studio XIAO ESP32-C6 / RP2040)
 * Segments, Virtual Segments, Exact mm/Norm/Polar Coordinates, CIE-L* + White Balance, & Buttons D5/D6.
 */

enum TreeType {
    //% block="PCB"
    PCB = 0,
    //% block="Holz"
    Holz = 1
}

enum TreeSegment {
    //% block="Zweig Unten (0..17)"
    BoughLow = 0,
    //% block="Zweig Mitte (18..31)"
    BoughMid = 1,
    //% block="Zweig Oben (32..44)"
    BoughHigh = 2,
    //% block="Stiel (45..49)"
    Stem = 3,
    //% block="Stern (50..59)"
    Star = 4
}

enum VirtualTreeSegment {
    //% block="Zweig Unten (18)"
    BoughLow = 0,
    //% block="Zweig Mitte (14)"
    BoughMid = 1,
    //% block="Zweig Oben (13)"
    BoughHigh = 2,
    //% block="Stiel (5)"
    Stem = 3,
    //% block="Stern Innen (5)"
    StarInner = 4,
    //% block="Stern Aussen (5)"
    StarOuter = 5
}

enum TreeEpicenter {
    //% block="Stern-Mitte"
    Star = 0,
    //% block="Stiel-Mitte"
    Stem = 1,
    //% block="Baum-Mitte"
    Tree = 2,
    //% block="Basis-Mitte"
    Base = 3
}

enum TreeButton {
    //% block="Taster A (D5)"
    A = 0,
    //% block="Taster B (D6)"
    B = 1
}

//% color="#2e7d32" weight=88 icon="\uf1bb" block="Christmas Tree"
//% groups='["Setup", "LEDs", "Segmente", "Geometrie & Farben", "Taster"]'
namespace christmasTree {
    export const NUM_PIXELS = 60;
    export const X_MIN = 0.0;
    export const X_MAX = 38.862;
    export const Y_MIN = 0.0;
    export const Y_MAX = 68.551;
    export const WIDTH_MM = 38.862;
    export const HEIGHT_MM = 68.551;

    const SEGMENT_STARTS = [0, 18, 32, 45, 50];
    const SEGMENT_ENDS = [18, 32, 45, 50, 60];

    const VSEG_LISTS: number[][] = [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
        [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
        [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44],
        [45, 46, 47, 48, 49],
        [50, 53, 54, 57, 58],
        [51, 52, 55, 56, 59]
    ];

    const PIXEL_X = [
        38.862, 37.076, 35.100, 32.956, 30.667, 28.257, 25.754, 23.184, 20.577, 17.960, 15.362, 12.812, 10.337, 7.965, 5.722, 3.631, 1.717, 0.000,
        36.328, 33.885, 31.357, 28.773, 26.159, 23.546, 20.961, 18.434, 15.991, 13.660, 11.465, 9.432, 7.582, 5.936,
        36.468, 33.855, 31.243, 28.658, 26.131, 23.688, 21.357, 19.163, 17.130, 15.280, 13.634, 12.209, 11.022,
        19.869, 21.903, 23.754, 25.401, 27.009,
        18.349, 17.189, 14.681, 16.589, 21.247, 21.207, 27.692, 25.796, 23.828, 25.013
    ];

    const PIXEL_Y = [
        8.912, 6.998, 5.281, 3.781, 2.512, 1.491, 0.726, 0.227, 0.000, 0.046, 0.365, 0.955, 1.807, 2.914, 4.262, 5.838, 7.623, 9.599,
        14.954, 14.017, 13.340, 12.932, 12.796, 12.934, 13.344, 14.022, 14.961, 16.149, 17.576, 19.223, 21.074, 23.109,
        25.383, 25.247, 25.385, 25.795, 26.473, 27.412, 28.601, 30.027, 31.674, 33.525, 35.559, 37.754, 40.087,
        39.313, 40.961, 42.812, 44.846, 46.640,
        58.095, 56.466, 63.964, 63.365, 66.711, 68.551, 64.094, 63.456, 57.956, 56.345
    ];

    const PIXEL_SEG = [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
        3, 3, 3, 3, 3,
        4, 4, 4, 4, 4, 4, 4, 4, 4, 4
    ];

    const EPICENTER_X = [21.1591, 23.754, 19.431, 20.577];
    const EPICENTER_Y = [61.9003, 42.812, 34.2755, 12.796];

    let _treeType: TreeType = TreeType.PCB;
    let _gammaEnabled: boolean = true;
    let _brightness: number = 77; // ~0.3 * 255
    let _shadow: Buffer = null;
    let _sendBuf: Buffer = null;
    let _lutR: Buffer = null;
    let _lutG: Buffer = null;
    let _lutB: Buffer = null;

    let _btnInitA: boolean = false;
    let _btnInitB: boolean = false;
    let _btnLastA: boolean = false;
    let _btnLastB: boolean = false;
    let _btnEdgeA: number = -50;
    let _btnEdgeB: number = -50;

    function buildCieLuts(): void {
        if (_lutR) return;
        _lutR = pins.createBuffer(256);
        _lutG = pins.createBuffer(256);
        _lutB = pins.createBuffer(256);
        _lutR[0] = 0;
        _lutG[0] = 0;
        _lutB[0] = 0;
        for (let i = 1; i < 256; i++) {
            const l = (i / 255.0) * 100.0;
            const y = l <= 8.0 ? (l / 903.3) : Math.pow((l + 16.0) / 116.0, 3);
            _lutR[i] = Math.max(1, Math.min(255, Math.round(y * 255)));
            _lutG[i] = Math.max(1, Math.min(255, Math.round(y * 176)));
            _lutB[i] = Math.max(1, Math.min(255, Math.round(y * 240)));
        }
    }

    function ensureTree(): void {
        if (!_shadow) {
            initTree(TreeType.PCB, 77, true);
        }
    }

    function mapIndex(index: number): number {
        if (_treeType == TreeType.Holz && index >= 18 && index < 32) {
            return 49 - index;
        }
        return index;
    }

    /**
     * Initialisiert den 60-LED Tannenbaum an Pin D10.
     * @param treeType Bauform des Baums (PCB oder Holz), eg: TreeType.PCB
     * @param brightness Helligkeit 0..255, eg: 77
     * @param gamma CIE-L* Gamma- & Weissabgleich-Korrektur, eg: true
     */
    //% blockId=xmas_init_tree
    //% block="Tannenbaum initialisieren Typ %treeType|Helligkeit %brightness||CIE-Gamma %gamma"
    //% brightness.min=0 brightness.max=255 brightness.defl=77
    //% gamma.defl=true
    //% parts="christmastree"
    //% group="Setup" weight=100
    export function initTree(treeType: TreeType = TreeType.PCB, brightness: number = 77, gamma: boolean = true): void {
        _treeType = treeType;
        _brightness = Math.max(0, Math.min(255, brightness | 0));
        _gammaEnabled = !!gamma;
        buildCieLuts();
        if (!_shadow) {
            _shadow = pins.createBuffer(NUM_PIXELS * 3);
        }
        if (!_sendBuf) {
            _sendBuf = pins.createBuffer(NUM_PIXELS * 3);
        }
    }

    /**
     * Waehlt den Tannenbaum-Typ (PCB oder Holz).
     */
    //% blockId=xmas_set_tree_type
    //% block="Tannenbaum-Typ setzen auf %treeType"
    //% group="Setup" weight=90
    export function setTreeType(treeType: TreeType): void {
        _treeType = treeType;
    }

    /**
     * Setzt die Helligkeit (0..255).
     */
    //% blockId=xmas_set_brightness
    //% block="Tannenbaum Helligkeit %brightness"
    //% brightness.min=0 brightness.max=255 brightness.defl=77
    //% group="Setup" weight=85
    export function setBrightness(brightness: number): void {
        ensureTree();
        _brightness = Math.max(0, Math.min(255, brightness | 0));
    }

    /**
     * Setzt eine einzelne LED (0..59) im Puffer (noch ohne show()).
     */
    //% blockId=xmas_set_pixel
    //% block="setze LED %index|auf %color=colorNumberPicker"
    //% index.min=0 index.max=59
    //% group="LEDs" weight=80
    export function setPixel(index: number, color: number): void {
        ensureTree();
        index = index | 0;
        if (index < 0 || index >= NUM_PIXELS) return;
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        const phys = mapIndex(index) * 3;
        _shadow[phys] = r;
        _shadow[phys + 1] = g;
        _shadow[phys + 2] = b;
    }

    /**
     * Setzt eine einzelne LED (0..59) mit R, G, B (0..255).
     */
    //% blockId=xmas_set_pixel_rgb
    //% block="setze LED %index|auf R %r|G %g|B %b"
    //% index.min=0 index.max=59 r.min=0 r.max=255 g.min=0 g.max=255 b.min=0 b.max=255
    //% group="LEDs" weight=75
    export function setPixelRGB(index: number, r: number, g: number, b: number): void {
        ensureTree();
        index = index | 0;
        if (index < 0 || index >= NUM_PIXELS) return;
        const phys = mapIndex(index) * 3;
        _shadow[phys] = Math.max(0, Math.min(255, r | 0));
        _shadow[phys + 1] = Math.max(0, Math.min(255, g | 0));
        _shadow[phys + 2] = Math.max(0, Math.min(255, b | 0));
    }

    /**
     * Faerbt alle 60 LEDs im Puffer.
     */
    //% blockId=xmas_fill
    //% block="alle LEDs fuellen mit %color=colorNumberPicker"
    //% group="LEDs" weight=70
    export function fill(color: number): void {
        ensureTree();
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        for (let i = 0; i < NUM_PIXELS * 3; i += 3) {
            _shadow[i] = r;
            _shadow[i + 1] = g;
            _shadow[i + 2] = b;
        }
    }

    /**
     * Loescht alle 60 LEDs im Puffer (auf Schwarz).
     */
    //% blockId=xmas_clear
    //% block="Tannenbaum loeschen"
    //% group="LEDs" weight=65
    export function clear(): void {
        ensureTree();
        _shadow.fill(0);
    }

    /**
     * Sendet den Puffer (inkl. Helligkeit & CIE-L* Gamma) an die 60 LEDs.
     */
    //% blockId=xmas_show
    //% block="Tannenbaum anzeigen"
    //% group="LEDs" weight=95
    export function show(): void {
        ensureTree();
        const lvl = _brightness / 255.0;
        for (let i = 0; i < NUM_PIXELS; i++) {
            const off = i * 3;
            const r = _shadow[off];
            const g = _shadow[off + 1];
            const b = _shadow[off + 2];
            if (_gammaEnabled) {
                // GRB order for WS2812B
                _sendBuf[off] = _lutG[Math.min(255, Math.round(g * lvl))];
                _sendBuf[off + 1] = _lutR[Math.min(255, Math.round(r * lvl))];
                _sendBuf[off + 2] = _lutB[Math.min(255, Math.round(b * lvl))];
            } else {
                _sendBuf[off] = (g * _brightness) >> 8;
                _sendBuf[off + 1] = (r * _brightness) >> 8;
                _sendBuf[off + 2] = (b * _brightness) >> 8;
            }
        }
        light.sendBuffer(pins.D10, undefined, NeoPixelMode.RGB, _sendBuf);
    }

    /**
     * Faerbt ein physisches Segment (ohne show()).
     */
    //% blockId=xmas_fill_segment
    //% block="Segment %segment|fuellen mit %color=colorNumberPicker"
    //% group="Segmente" weight=60
    export function fillSegment(segment: TreeSegment, color: number): void {
        ensureTree();
        const s = segment | 0;
        if (s < 0 || s >= SEGMENT_STARTS.length) return;
        const start = SEGMENT_STARTS[s];
        const end = SEGMENT_ENDS[s];
        for (let i = start; i < end; i++) {
            setPixel(i, color);
        }
    }

    /**
     * Faerbt ein virtuelles Segment (inkl. Stern Innen / Stern Aussen, ohne show()).
     */
    //% blockId=xmas_fill_vsegment
    //% block="Virtuelles Segment %segment|fuellen mit %color=colorNumberPicker"
    //% group="Segmente" weight=55
    export function fillVirtualSegment(segment: VirtualTreeSegment, color: number): void {
        ensureTree();
        const s = segment | 0;
        if (s < 0 || s >= VSEG_LISTS.length) return;
        const list = VSEG_LISTS[s];
        for (let k = 0; k < list.length; k++) {
            setPixel(list[k], color);
        }
    }

    /**
     * Anzahl der LEDs in einem virtuellen Segment.
     */
    //% blockId=xmas_vseg_length
    //% block="Laenge von %segment"
    //% group="Segmente" weight=50
    export function virtualSegmentLength(segment: VirtualTreeSegment): number {
        const s = segment | 0;
        if (s < 0 || s >= VSEG_LISTS.length) return 0;
        return VSEG_LISTS[s].length;
    }

    /**
     * Gibt den LED-Index (0..59) an Position offset innerhalb eines virtuellen Segments zurueck.
     */
    //% blockId=xmas_vseg_pixel
    //% block="LED-Index in %segment|an Stelle %offset"
    //% group="Segmente" weight=45
    export function virtualSegmentPixel(segment: VirtualTreeSegment, offset: number): number {
        const s = segment | 0;
        if (s < 0 || s >= VSEG_LISTS.length) return 0;
        const list = VSEG_LISTS[s];
        const idx = offset | 0;
        if (idx < 0 || idx >= list.length) return 0;
        return list[idx];
    }

    /**
     * Konvertiert HSV (je 0..255) in eine RGB-Farbe.
     */
    //% blockId=xmas_hsv_rgb
    //% block="Farbe aus Farbton %h|Saettigung %s|Wert %v"
    //% h.min=0 h.max=255 s.min=0 s.max=255 s.defl=255 v.min=0 v.max=255 v.defl=255
    //% group="Geometrie & Farben" weight=40
    export function hsvToRgb(h: number, s: number, v: number): number {
        return light.hsv(h & 0xff, s & 0xff, v & 0xff);
    }

    /**
     * X-Koordinate der LED in Millimetern (0.0 .. 38.862).
     */
    //% blockId=xmas_pixel_x
    //% block="X (mm) von LED %index"
    //% index.min=0 index.max=59
    //% group="Geometrie & Farben" weight=35
    export function pixelX(index: number): number {
        const i = index | 0;
        if (i < 0 || i >= NUM_PIXELS) return 0;
        return PIXEL_X[i];
    }

    /**
     * Y-Koordinate der LED in Millimetern (0.0 .. 68.551, unten nach oben).
     */
    //% blockId=xmas_pixel_y
    //% block="Y (mm) von LED %index"
    //% index.min=0 index.max=59
    //% group="Geometrie & Farben" weight=34
    export function pixelY(index: number): number {
        const i = index | 0;
        if (i < 0 || i >= NUM_PIXELS) return 0;
        return PIXEL_Y[i];
    }

    /**
     * Normierte X-Koordinate (0.0 links .. 1.0 rechts).
     */
    //% blockId=xmas_norm_x
    //% block="Norm-X (0..1) von LED %index"
    //% index.min=0 index.max=59
    //% group="Geometrie & Farben" weight=32
    export function normX(index: number): number {
        const i = index | 0;
        if (i < 0 || i >= NUM_PIXELS) return 0;
        return PIXEL_X[i] / WIDTH_MM;
    }

    /**
     * Normierte Y-Koordinate (0.0 unten .. 1.0 oben).
     */
    //% blockId=xmas_norm_y
    //% block="Norm-Y (0..1) von LED %index"
    //% index.min=0 index.max=59
    //% group="Geometrie & Farben" weight=31
    export function normY(index: number): number {
        const i = index | 0;
        if (i < 0 || i >= NUM_PIXELS) return 0;
        return PIXEL_Y[i] / HEIGHT_MM;
    }

    /**
     * Euklidischer Abstand (in mm) der LED zu einem Referenzpunkt (Stern, Stiel, Baum, Basis).
     */
    //% blockId=xmas_distance_to
    //% block="Abstand (mm) von LED %index|zu %epicenter"
    //% index.min=0 index.max=59
    //% group="Geometrie & Farben" weight=30
    export function distanceTo(index: number, epicenter: TreeEpicenter): number {
        const i = index | 0;
        const e = epicenter | 0;
        if (i < 0 || i >= NUM_PIXELS || e < 0 || e >= EPICENTER_X.length) return 0;
        const dx = PIXEL_X[i] - EPICENTER_X[e];
        const dy = PIXEL_Y[i] - EPICENTER_Y[e];
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Polarwinkel (in Radiant, -pi..pi) der LED relativ zu einem Referenzpunkt.
     */
    //% blockId=xmas_polar_angle
    //% block="Winkel (rad) von LED %index|um %epicenter"
    //% index.min=0 index.max=59
    //% group="Geometrie & Farben" weight=28
    export function polarAngle(index: number, epicenter: TreeEpicenter): number {
        const i = index | 0;
        const e = epicenter | 0;
        if (i < 0 || i >= NUM_PIXELS || e < 0 || e >= EPICENTER_X.length) return 0;
        return Math.atan2(PIXEL_Y[i] - EPICENTER_Y[e], PIXEL_X[i] - EPICENTER_X[e]);
    }

    /**
     * Segment-ID (0..4) einer LED.
     */
    //% blockId=xmas_pixel_segment
    //% block="Segment-ID von LED %index"
    //% index.min=0 index.max=59
    //% group="Geometrie & Farben" weight=26
    export function pixelSegment(index: number): number {
        const i = index | 0;
        if (i < 0 || i >= NUM_PIXELS) return 0;
        return PIXEL_SEG[i];
    }

    function readRawButton(btn: TreeButton): boolean {
        if (btn == TreeButton.A) {
            if (!_btnInitA) {
                pins.D5.setPull(PinPullMode.PullUp);
                _btnInitA = true;
            }
            return !pins.D5.digitalRead();
        } else {
            if (!_btnInitB) {
                pins.D6.setPull(PinPullMode.PullUp);
                _btnInitB = true;
            }
            return !pins.D6.digitalRead();
        }
    }

    /**
     * Wahr solange der gewaehlte Taster (D5 oder D6, Aktiv-Low) gedrueckt ist.
     */
    //% blockId=xmas_btn_is_pressed
    //% block="%btn gedrueckt"
    //% group="Taster" weight=20
    export function buttonIsPressed(btn: TreeButton): boolean {
        return readRawButton(btn);
    }

    /**
     * Wahr genau einmal pro Tastendruck (entprellt mit 50 ms).
     */
    //% blockId=xmas_btn_was_pressed
    //% block="%btn wurde gedrueckt"
    //% group="Taster" weight=18
    export function buttonWasPressed(btn: TreeButton): boolean {
        const curr = readRawButton(btn);
        const now = control.millis();
        let justPressed = false;
        if (btn == TreeButton.A) {
            if (curr && !_btnLastA && (now - _btnEdgeA) >= 50) {
                _btnEdgeA = now;
                justPressed = true;
            }
            _btnLastA = curr;
        } else {
            if (curr && !_btnLastB && (now - _btnEdgeB) >= 50) {
                _btnEdgeB = now;
                justPressed = true;
            }
            _btnLastB = curr;
        }
        return justPressed;
    }
}

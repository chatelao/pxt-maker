/// <reference path="../../node_modules/pxt-core/built/pxtsim.d.ts"/>
/// <reference path="../../libs/core/dal.d.ts"/>
/// <reference path="./christmastree_outline.ts"/>

namespace pxsim.visuals {
    const XMAS_PIXEL_COORDS: number[][] = [
        // Segment 0: Zweig Unten (0..17)
        [38.862, 8.912, 0], [37.076, 6.998, 0], [35.100, 5.281, 0], [32.956, 3.781, 0],
        [30.667, 2.512, 0], [28.257, 1.491, 0], [25.754, 0.726, 0], [23.184, 0.227, 0],
        [20.577, 0.000, 0], [17.960, 0.046, 0], [15.362, 0.365, 0], [12.812, 0.955, 0],
        [10.337, 1.807, 0], [7.965, 2.914, 0], [5.722, 4.262, 0], [3.631, 5.838, 0],
        [1.717, 7.623, 0], [0.000, 9.599, 0],
        // Segment 1: Zweig Mitte (18..31)
        [36.328, 14.954, 1], [33.885, 14.017, 1], [31.357, 13.340, 1], [28.773, 12.932, 1],
        [26.159, 12.796, 1], [23.546, 12.934, 1], [20.961, 13.344, 1], [18.434, 14.022, 1],
        [15.991, 14.961, 1], [13.660, 16.149, 1], [11.465, 17.576, 1], [9.432, 19.223, 1],
        [7.582, 21.074, 1], [5.936, 23.109, 1],
        // Segment 2: Zweig Oben (32..44)
        [36.468, 25.383, 2], [33.855, 25.247, 2], [31.243, 25.385, 2], [28.658, 25.795, 2],
        [26.131, 26.473, 2], [23.688, 27.412, 2], [21.357, 28.601, 2], [19.163, 30.027, 2],
        [17.130, 31.674, 2], [15.280, 33.525, 2], [13.634, 35.559, 2], [12.209, 37.754, 2],
        [11.022, 40.087, 2],
        // Segment 3: Stiel (45..49)
        [19.869, 39.313, 3], [21.903, 40.961, 3], [23.754, 42.812, 3], [25.401, 44.846, 3],
        [27.009, 46.640, 3],
        // Segment 4: Stern (50..59)
        [18.349, 58.095, 4], [17.189, 56.466, 4], [14.681, 63.964, 4], [16.589, 63.365, 4],
        [21.247, 66.711, 4], [21.207, 68.551, 4], [27.692, 64.094, 4], [25.796, 63.456, 4],
        [23.828, 57.956, 4], [25.013, 56.345, 4],
    ];

    const XMAS_SEG_RANGES = [[0, 18], [18, 32], [32, 45], [45, 50], [50, 60]];
    const XMAS_SEG_NAMES = ["Zweig Unten", "Zweig Mitte", "Zweig Oben", "Stiel", "Stern"];
    const XMAS_WHITE_BALANCE = [255, 176, 240];

    interface XmasLedNode {
        outerGlow: SVGCircleElement;
        innerGlow: SVGCircleElement;
        chip: SVGRectElement;
        lbl: SVGTextElement;
    }

    export class ChristmasTreeView implements IBoardPart<CommonNeoPixelStateConstructor> {
        public style: string = `
            .sim-xmas-tree-btn {
                cursor: pointer;
                transition: transform 0.08s ease;
            }
            .sim-xmas-tree-btn:active {
                opacity: 0.8;
            }
            .sim-xmas-tree-pill {
                cursor: pointer;
                user-select: none;
            }
            .sim-xmas-tree-inspector {
                font-family: monospace;
                font-size: 6.5px;
                fill: #d4e3da;
                user-select: none;
            }
        `;
        public element: SVGElement;
        public overElement: SVGElement;
        public defs: SVGElement[];

        private state: CommonNeoPixelState;
        private pin: Pin;
        private pinA: Pin;
        private pinB: Pin;
        private treeGroup: SVGGElement;
        private treeSvg: SVGSVGElement;
        private ledNodes: XmasLedNode[] = [];
        private tracePolylines: { start: number; end: number; poly: SVGPolylineElement }[] = [];
        private indicesGroup: SVGGElement;
        private inspectorText: SVGTextElement;
        private modeLabel: SVGTextElement;
        private lastRgb: number[][] = [];
        private isHolz: boolean = false;
        private showIndices: boolean = false;
        private lastLocation: Coord = [0, 0];

        constructor(public parsePinString: (name: string) => Pin) {
        }

        private toSvg(x: number, y: number): [number, number] {
            return [
                x + (111.0262 - XMAS_PCB_OUTLINE.xOrigin),
                (68.551 - y) + (27.5500 - XMAS_PCB_OUTLINE.yOrigin)
            ];
        }

        private mapPhysicalIndex(i: number): number {
            if (this.isHolz && i >= 18 && i < 32) {
                return 49 - i;
            }
            return i;
        }

        public init(bus: EventBus, state: CommonNeoPixelStateConstructor, svgEl: SVGSVGElement, otherParams: Map<string>): void {
            this.defs = [];
            this.overElement = null;
            this.ledNodes = [];
            this.tracePolylines = [];
            this.lastRgb = [];
            for (let i = 0; i < 60; i++) this.lastRgb.push([0, 0, 0]);

            this.pin = this.parsePinString(otherParams["dataPin"] || otherParams["pin"])
                || this.parsePinString("pins.D10")
                || this.parsePinString("pins.MOSI");
            this.state = state(this.pin);

            this.pinA = this.parsePinString("pins.D5");
            this.pinB = this.parsePinString("pins.D6");
            if (this.pinA) this.pinA.setValue(1023);
            if (this.pinB) this.pinB.setValue(1023);

            this.treeGroup = <SVGGElement>svg.elt("g");
            this.element = this.treeGroup;

            // Header carrier & 3 pins at top (y = 0) matching pxtparts.json pinLocations: x=60,75,90
            const headerGroup = svg.child(this.treeGroup, "g", {});
            svg.child(headerGroup, "rect", {
                x: 52, y: -4, width: 46, height: 11, rx: 2,
                fill: "#22272e", stroke: "#444c56", "stroke-width": 0.8
            });
            const pinLabels = ["DIN", "3V3", "GND"];
            const pinXs = [60, 75, 90];
            for (let idx = 0; idx < 3; idx++) {
                svg.child(headerGroup, "circle", {
                    cx: pinXs[idx], cy: 0, r: 3.2,
                    fill: "#d4af37", stroke: "#8a6d1b", "stroke-width": 0.8
                });
                const lbl = svg.child(headerGroup, "text", {
                    x: pinXs[idx], y: 5.5,
                    "text-anchor": "middle",
                    "font-family": "monospace",
                    "font-size": 4.2,
                    fill: "#e6edf3"
                });
                lbl.textContent = pinLabels[idx];
            }

            // Nested SVG for the exact KiCad PCB outline (75.41 x 105.60 mm scaled to 150 x 210)
            this.treeSvg = <SVGSVGElement>svg.child(this.treeGroup, "svg", {
                x: 0,
                y: 8,
                width: 150,
                height: 210,
                viewBox: XMAS_PCB_OUTLINE.viewBox
            });

            // Glow filters
            const defs = svg.child(this.treeSvg, "defs", {});
            const wideFilter = svg.child(defs, "filter", { id: "xmas-led-glow-wide", x: "-250%", y: "-250%", width: "600%", height: "600%" });
            svg.child(wideFilter, "feGaussianBlur", { stdDeviation: "0.95", result: "blur" });
            const tightFilter = svg.child(defs, "filter", { id: "xmas-led-glow-tight", x: "-150%", y: "-150%", width: "400%", height: "400%" });
            svg.child(tightFilter, "feGaussianBlur", { stdDeviation: "0.35", result: "blur" });

            // KiCad Edge.Cuts, Gold (F.Cu), and Silkscreen (F.SilkS) layers
            const pcbGroup = svg.child(this.treeSvg, "g", {});
            if (XMAS_PCB_OUTLINE.bodyPath) {
                svg.child(pcbGroup, "path", {
                    d: XMAS_PCB_OUTLINE.bodyPath,
                    fill: "#111613",
                    stroke: "none"
                });
            }
            svg.child(pcbGroup, "path", {
                d: XMAS_PCB_OUTLINE.edgePath,
                fill: "#111613",
                stroke: "#c49a45",
                "stroke-width": "0.35",
                "stroke-linejoin": "round"
            });
            if (XMAS_PCB_OUTLINE.goldPath) {
                svg.child(pcbGroup, "path", {
                    d: XMAS_PCB_OUTLINE.goldPath,
                    fill: "#cfa24e",
                    "fill-rule": "evenodd",
                    opacity: "0.82",
                    "pointer-events": "none"
                });
            }
            if (XMAS_PCB_OUTLINE.silkPath) {
                svg.child(pcbGroup, "path", {
                    d: XMAS_PCB_OUTLINE.silkPath,
                    fill: "#dfd0b4",
                    "fill-rule": "evenodd",
                    opacity: "0.45",
                    "pointer-events": "none"
                });
            }

            // Segment copper traces
            const tracesGroup = svg.child(this.treeSvg, "g", { opacity: "0.32" });
            for (let s = 0; s < XMAS_SEG_RANGES.length; s++) {
                const start = XMAS_SEG_RANGES[s][0];
                const end = XMAS_SEG_RANGES[s][1];
                const pts: string[] = [];
                for (let i = start; i < end; i++) {
                    const coordIdx = this.mapPhysicalIndex(i);
                    const xy = this.toSvg(XMAS_PIXEL_COORDS[coordIdx][0], XMAS_PIXEL_COORDS[coordIdx][1]);
                    pts.push(`${xy[0].toFixed(2)},${xy[1].toFixed(2)}`);
                }
                const poly = <SVGPolylineElement>svg.child(tracesGroup, "polyline", {
                    points: pts.join(" "),
                    fill: "none",
                    stroke: "#255942",
                    "stroke-width": "0.35",
                    "stroke-linecap": "round",
                    "stroke-linejoin": "round"
                });
                this.tracePolylines.push({ start, end, poly });
            }

            // 60 NeoPixel LEDs
            const ledsGroup = svg.child(this.treeSvg, "g", {});
            this.indicesGroup = <SVGGElement>svg.child(this.treeSvg, "g", {
                style: "display:none; pointer-events:none;"
            });

            for (let i = 0; i < XMAS_PIXEL_COORDS.length; i++) {
                const coordIdx = this.mapPhysicalIndex(i);
                const x = XMAS_PIXEL_COORDS[coordIdx][0];
                const y = XMAS_PIXEL_COORDS[coordIdx][1];
                const seg = XMAS_PIXEL_COORDS[coordIdx][2];
                const xy = this.toSvg(x, y);
                const cx = xy[0];
                const cy = xy[1];

                const outerGlow = <SVGCircleElement>svg.child(ledsGroup, "circle", {
                    cx: cx.toFixed(3),
                    cy: cy.toFixed(3),
                    r: "1.75",
                    fill: "rgb(0,0,0)",
                    opacity: "0",
                    filter: "url(#xmas-led-glow-wide)",
                    style: "mix-blend-mode: screen; pointer-events: none;"
                });

                const innerGlow = <SVGCircleElement>svg.child(ledsGroup, "circle", {
                    cx: cx.toFixed(3),
                    cy: cy.toFixed(3),
                    r: "1.05",
                    fill: "rgb(0,0,0)",
                    opacity: "0",
                    filter: "url(#xmas-led-glow-tight)",
                    style: "mix-blend-mode: screen; pointer-events: none;"
                });

                const chip = <SVGRectElement>svg.child(ledsGroup, "rect", {
                    x: (cx - 0.85).toFixed(3),
                    y: (cy - 0.85).toFixed(3),
                    width: "1.7",
                    height: "1.7",
                    rx: "0.35",
                    fill: "#1e2622",
                    stroke: "#3c4f44",
                    "stroke-width": "0.18",
                    style: "cursor: crosshair;"
                });

                const inspectLed = () => {
                    const rgb = this.lastRgb[i] || [0, 0, 0];
                    const logIdx = this.mapPhysicalIndex(i);
                    const idxStr = logIdx !== i ? `#${i} (log #${logIdx})` : `#${i}`;
                    if (this.inspectorText) {
                        this.inspectorText.textContent = `LED ${idxStr} · ${XMAS_SEG_NAMES[seg]} · RGB(${rgb[0]},${rgb[1]},${rgb[2]})`;
                    }
                };
                chip.addEventListener("mouseenter", inspectLed);
                chip.addEventListener("pointerdown", inspectLed);
                chip.addEventListener("mouseleave", () => {
                    if (this.inspectorText) {
                        this.inspectorText.textContent = "XIAO Xmas Tree (60 LEDs · D10)";
                    }
                });

                const lbl = <SVGTextElement>svg.child(this.indicesGroup, "text", {
                    x: cx.toFixed(3),
                    y: (cy - 1.35).toFixed(3),
                    "text-anchor": "middle",
                    fill: "#d4e3da",
                    "font-size": "1.35",
                    "font-family": "monospace",
                    "font-weight": "600"
                });
                lbl.textContent = String(i);

                this.ledNodes.push({ outerGlow, innerGlow, chip, lbl });
            }

            // Bottom control bar (D5 Btn A, D6 Btn B, PCB/Holz toggle, # toggle, LED inspector)
            const bar = svg.child(this.treeGroup, "g", { transform: "translate(0, 220)" });
            svg.child(bar, "rect", {
                x: 2, y: 0, width: 146, height: 22, rx: 4,
                fill: "#141a17", stroke: "#2d3b34", "stroke-width": 0.8
            });

            this.mkButtonControl(bar, 6, 3, "A (D5)", this.pinA);
            this.mkButtonControl(bar, 38, 3, "B (D6)", this.pinB);

            // PCB / Holz toggle
            const modeBtn = svg.child(bar, "g", { class: "sim-xmas-tree-pill" });
            svg.child(modeBtn, "rect", {
                x: 72, y: 3, width: 44, height: 10, rx: 2,
                fill: "#203028", stroke: "#486858", "stroke-width": 0.6
            });
            this.modeLabel = <SVGTextElement>svg.child(modeBtn, "text", {
                x: 94, y: 9.8, "text-anchor": "middle",
                "font-family": "monospace", "font-size": 5.5, fill: "#d4e3da"
            });
            this.modeLabel.textContent = "PCB";
            modeBtn.addEventListener("click", () => {
                this.isHolz = !this.isHolz;
                this.modeLabel.textContent = this.isHolz ? "Holz" : "PCB";
                this.updateTreeTypeVisuals();
                this.updateState();
            });

            // #0..59 indices toggle
            const idxBtn = svg.child(bar, "g", { class: "sim-xmas-tree-pill" });
            svg.child(idxBtn, "rect", {
                x: 120, y: 3, width: 24, height: 10, rx: 2,
                fill: "#203028", stroke: "#486858", "stroke-width": 0.6
            });
            const idxTxt = svg.child(idxBtn, "text", {
                x: 132, y: 9.8, "text-anchor": "middle",
                "font-family": "monospace", "font-size": 5.5, fill: "#d4e3da"
            });
            idxTxt.textContent = "#";
            idxBtn.addEventListener("click", () => {
                this.showIndices = !this.showIndices;
                this.indicesGroup.style.display = this.showIndices ? "block" : "none";
            });

            this.inspectorText = <SVGTextElement>svg.child(bar, "text", {
                x: 75, y: 19.5, "text-anchor": "middle",
                class: "sim-xmas-tree-inspector"
            });
            this.inspectorText.textContent = "XIAO Xmas Tree (60 LEDs · D10)";
        }

        private mkButtonControl(parent: Element, x: number, y: number, label: string, pin: Pin) {
            const g = svg.child(parent, "g", { class: "sim-xmas-tree-btn" });
            const rect = svg.child(g, "rect", {
                x, y, width: 28, height: 10, rx: 2,
                fill: "#263238", stroke: "#607d8b", "stroke-width": 0.6
            });
            const txt = svg.child(g, "text", {
                x: x + 14, y: y + 6.8, "text-anchor": "middle",
                "font-family": "monospace", "font-size": 5.2, fill: "#eceff1"
            });
            txt.textContent = label;

            const setPressed = (pressed: boolean) => {
                if (pin) {
                    pin.setValue(pressed ? 0 : 1023);
                }
                const b = board();
                if (b && b.buttonState && b.buttonState.buttonsByPin && pin) {
                    const btn = b.buttonState.buttonsByPin[pin.id + ""];
                    if (btn) btn.setPressed(pressed);
                }
                svg.hydrate(rect, { fill: pressed ? "#c49a45" : "#263238" });
            };

            pointerEvents.down.forEach(ev => g.addEventListener(ev, () => setPressed(true)));
            g.addEventListener(pointerEvents.up, () => setPressed(false));
            g.addEventListener(pointerEvents.leave, () => setPressed(false));
        }

        private updateTreeTypeVisuals() {
            for (let s = 0; s < this.tracePolylines.length; s++) {
                const tr = this.tracePolylines[s];
                const pts: string[] = [];
                for (let i = tr.start; i < tr.end; i++) {
                    const coordIdx = this.mapPhysicalIndex(i);
                    const xy = this.toSvg(XMAS_PIXEL_COORDS[coordIdx][0], XMAS_PIXEL_COORDS[coordIdx][1]);
                    pts.push(`${xy[0].toFixed(2)},${xy[1].toFixed(2)}`);
                }
                tr.poly.setAttribute("points", pts.join(" "));
            }
            for (let i = 0; i < this.ledNodes.length; i++) {
                const coordIdx = this.mapPhysicalIndex(i);
                const xy = this.toSvg(XMAS_PIXEL_COORDS[coordIdx][0], XMAS_PIXEL_COORDS[coordIdx][1]);
                const cx = xy[0];
                const cy = xy[1];
                const node = this.ledNodes[i];
                node.outerGlow.setAttribute("cx", cx.toFixed(3));
                node.outerGlow.setAttribute("cy", cy.toFixed(3));
                node.innerGlow.setAttribute("cx", cx.toFixed(3));
                node.innerGlow.setAttribute("cy", cy.toFixed(3));
                node.chip.setAttribute("x", (cx - 0.85).toFixed(3));
                node.chip.setAttribute("y", (cy - 0.85).toFixed(3));
                node.lbl.setAttribute("x", cx.toFixed(3));
                node.lbl.setAttribute("y", (cy - 1.35).toFixed(3));
            }
        }

        public moveToCoord(xy: Coord): void {
            this.lastLocation = [xy[0], xy[1]];
            svg.hydrate(this.treeGroup, { transform: `translate(${xy[0]} ${xy[1]})` });
        }

        public updateState(): void {
            if (!this.state) return;
            const len = Math.min(60, this.state.length);
            for (let i = 0; i < 60; i++) {
                const rgb = i < len ? this.state.pixelColor(i) : [0, 0, 0];
                const r = rgb[0] || 0;
                const g = rgb[1] || 0;
                const b = rgb[2] || 0;
                this.lastRgb[i] = [r, g, b];

                const node = this.ledNodes[i];
                const maxRaw = Math.max(r, g, b);
                if (maxRaw === 0) {
                    node.chip.setAttribute("fill", "#1e2622");
                    node.chip.setAttribute("stroke", "#3c4f44");
                    node.innerGlow.setAttribute("opacity", "0");
                    node.outerGlow.setAttribute("opacity", "0");
                    continue;
                }

                // Invert WS2812B white balance (255, 176, 240) and encode to sRGB (~gamma 2.2)
                const er = Math.min(255, (r * 255) / XMAS_WHITE_BALANCE[0]);
                const eg = Math.min(255, (g * 255) / XMAS_WHITE_BALANCE[1]);
                const eb = Math.min(255, (b * 255) / XMAS_WHITE_BALANCE[2]);
                const maxEff = Math.max(er, eg, eb);
                const lum = Math.min(1, Math.pow(maxEff / 255, 1 / 2.2));

                const invMax = 255 / maxEff;
                const hueR = Math.round(er * invMax);
                const hueG = Math.round(eg * invMax);
                const hueB = Math.round(eb * invMax);

                const dieScale = Math.min(1, 0.35 + 0.65 * lum);
                const whiteMix = Math.min(0.78, Math.pow(lum, 1.35) * 0.78);
                const baseR = hueR * dieScale;
                const baseG = hueG * dieScale;
                const baseB = hueB * dieScale;
                const coreR = Math.min(255, Math.round(baseR + (255 - baseR) * whiteMix));
                const coreG = Math.min(255, Math.round(baseG + (255 - baseG) * whiteMix));
                const coreB = Math.min(255, Math.round(baseB + (255 - baseB) * whiteMix));

                const hueColor = `rgb(${hueR},${hueG},${hueB})`;
                node.chip.setAttribute("fill", `rgb(${coreR},${coreG},${coreB})`);
                node.chip.setAttribute("stroke", `rgb(${Math.round(baseR)},${Math.round(baseG)},${Math.round(baseB)})`);
                node.innerGlow.setAttribute("fill", hueColor);
                node.innerGlow.setAttribute("opacity", (0.38 * Math.pow(lum, 0.65)).toFixed(2));
                node.outerGlow.setAttribute("fill", hueColor);
                node.outerGlow.setAttribute("opacity", (0.26 * Math.pow(lum, 0.85)).toFixed(2));
            }
        }

        public updateTheme(): void { }
    }
}

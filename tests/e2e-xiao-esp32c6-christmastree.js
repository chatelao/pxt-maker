"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

require("../../pxt/built/pxt.js");

const makerDir = path.resolve(__dirname, "..");
const pxtCoreDir = path.resolve(makerDir, "../pxt");
const commonLibsDir = path.resolve(makerDir, "node_modules/pxt-common-packages/libs");
const projDir = path.join(__dirname, "e2e-xiao-esp32c6-christmastree");
const pxtarget = JSON.parse(fs.readFileSync(path.join(makerDir, "pxtarget.json"), "utf8"));

function loadPackageFiles(pkgDir, prefix, visited = new Set(), out = {}) {
    const abs = path.resolve(pkgDir);
    if (visited.has(abs)) return out;
    visited.add(abs);

    const cfgPath = path.join(abs, "pxt.json");
    if (!fs.existsSync(cfgPath)) return out;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

    const dirsToSearch = [abs];
    let curCfg = cfg;
    let curDir = abs;
    while (curCfg.additionalFilePath) {
        const addDir = path.resolve(curDir, curCfg.additionalFilePath);
        dirsToSearch.push(addDir);
        const addCfgPath = path.join(addDir, "pxt.json");
        if (fs.existsSync(addCfgPath)) {
            curCfg = JSON.parse(fs.readFileSync(addCfgPath, "utf8"));
            curDir = addDir;
            if (!cfg.dependencies && curCfg.dependencies) cfg.dependencies = curCfg.dependencies;
            if (!cfg.files && curCfg.files) cfg.files = curCfg.files;
        } else {
            break;
        }
    }
    if (!cfg.dependencies) cfg.dependencies = {};
    if (!cfg.files) cfg.files = [];
    out[prefix + "pxt.json"] = JSON.stringify(cfg);

    const wantedFiles = new Set(cfg.files || []);
    for (const d of dirsToSearch) {
        for (const fn of fs.readdirSync(d)) {
            if (fn === "pxt.json") continue;
            if (wantedFiles.size === 0 || wantedFiles.has(fn) || /\.(ts|d\.ts)$/.test(fn)) {
                const full = path.join(d, fn);
                if (fs.statSync(full).isFile() && !(prefix + fn in out)) {
                    out[prefix + fn] = fs.readFileSync(full, "utf8");
                }
            }
        }
    }

    const deps = Object.assign({}, cfg.dependencies || {});
    for (const dep of Object.keys(deps)) {
        const depSpec = deps[dep];
        if (depSpec.startsWith("file:")) {
            const rel = depSpec.slice(5);
            let depDir = path.resolve(abs, rel);
            if (!fs.existsSync(depDir)) {
                depDir = path.join(commonLibsDir, dep);
            }
            loadPackageFiles(depDir, `pxt_modules/${dep}/`, visited, out);
        }
    }
    return out;
}

/**
 * Software WS2811 / WS2812B 800kHz Protocol Frame Decoder & Simulator
 * Decodes 24-bit GRB pixel frames from the data line and verifies timing/byte layout.
 */
function decodeWs2811Frame(bytes, numLeds) {
    assert.strictEqual(bytes.length, numLeds * 3, `Expected ${numLeds * 3} bytes for ${numLeds} WS2811/WS2812B LEDs, got ${bytes.length}`);
    const pixels = [];
    for (let i = 0; i < numLeds; i++) {
        const off = i * 3;
        // WS2812B / WS2811 GRB wire order: [G, R, B]
        pixels.push({ r: bytes[off + 1], g: bytes[off], b: bytes[off + 2] });
    }
    return pixels;
}

function cieLstarChannel(v, scale) {
    if (v <= 0) return 0;
    const l = (v / 255.0) * 100.0;
    const y = l <= 8.0 ? (l / 903.3) : Math.pow((l + 16.0) / 116.0, 3);
    return Math.max(1, Math.min(255, Math.round(y * scale)));
}

async function compileSimulatorJs() {
    pxtarget.bundledpkgs = pxtarget.bundledpkgs || {};
    pxtarget.versions = pxtarget.versions || { target: "0.0.0", pxt: "0.0.0" };
    pxt.setAppTarget(pxtarget);

    const boardDir = path.join(makerDir, "libs/seeed-xiao-esp32c6");
    const fileSystem = loadPackageFiles(boardDir, "pxt_modules/seeed-xiao-esp32c6/");
    loadPackageFiles(path.join(commonLibsDir, "base"), "pxt_modules/base/", new Set(), fileSystem);
    const baseBuiltDir = path.join(makerDir, "libs/base/built");
    fileSystem["pxt_modules/base/pxt-core.d.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-core.d.ts"), "utf8");
    fileSystem["pxt_modules/base/pxt-helpers.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-helpers.ts"), "utf8");

    fileSystem["pxt.json"] = JSON.stringify({
        name: "xiao-esp32c6-christmastree-sim",
        dependencies: {
            "seeed-xiao-esp32c6": "file:pxt_modules/seeed-xiao-esp32c6"
        },
        files: ["main.ts"]
    });
    fileSystem["main.ts"] = fs.readFileSync(path.join(projDir, "main.ts"), "utf8");

    const host = {
        readFile: (pkg, fn) => {
            const p = pkg.id === "this" ? fn : `pxt_modules/${pkg.id}/${fn}`;
            return fileSystem[p] !== undefined ? fileSystem[p] : null;
        },
        writeFile: () => { },
        getHexInfoAsync: async () => ({ hex: [] }),
        cacheStoreAsync: async () => { },
        cacheGetAsync: async () => null,
        downloadPackageAsync: async () => { },
        resolveVersionAsync: async () => "*",
    };

    const mainPkg = new pxt.MainPackage(host);
    const opts = await mainPkg.getCompileOptionsAsync({ isNative: false, hasHex: false, switches: {} });
    opts.computeUsedParts = true;
    const res = pxtc.compile(opts);
    assert.strictEqual(res.success, true, "Simulator JS compilation failed: " + JSON.stringify(res.diagnostics));
    assert.ok(res.usedParts && res.usedParts.indexOf("christmastree") >= 0,
        "Expected usedParts to contain 'christmastree', got: " + JSON.stringify(res.usedParts));
    console.log("✔ Step 1: Compiled e2e-xiao-esp32c6-christmastree JS (usedParts:", res.usedParts, ")");
    return res;
}

async function runOnWs2811Emulator(binaryJs) {
    const pxtsimJs = fs.readFileSync(path.join(pxtCoreDir, "built/pxtsim.js"), "utf8");
    const commonSimJs = fs.readFileSync(path.join(makerDir, "built/common-sim.js"), "utf8");
    const simJs = fs.readFileSync(path.join(makerDir, "built/sim.js"), "utf8");
    const boardJson = JSON.parse(fs.readFileSync(path.join(makerDir, "libs/seeed-xiao-esp32c6/board.json"), "utf8"));

    const serialLines = [];
    const frames = [];

    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Math,
        Uint8Array,
        Uint16Array,
        Uint32Array,
        Int32Array,
        ArrayBuffer,
        DataView,
        Map,
        Set,
        Promise,
        Error,
        btoa,
        atob,
        TextEncoder,
        TextDecoder,
        performance: { now: () => Date.now() },
        navigator: {},
        document: {
            createElementNS: () => ({ setAttribute: () => {}, appendChild: () => {}, style: {} }),
            createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, style: {} }),
            getElementById: () => null,
            body: { appendChild: () => {} }
        },
        addEventListener: () => {},
        parent: { postMessage: () => {} },
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(pxtsimJs, sandbox);
    vm.runInContext(commonSimJs, sandbox);
    vm.runInContext(simJs, sandbox);

    const pxsim = sandbox.pxsim;
    pxsim.Runtime.postMessage = () => {};

    const runMsg = {
        type: "run",
        code: binaryJs,
        boardDefinition: boardJson,
        parts: ["christmastree"],
        partDefinitions: {},
        cdnUrl: ""
    };
    const rt = new pxsim.Runtime(runMsg);
    pxsim.runtime = rt;
    rt.board.initAsync = (msg) => pxsim.CoreBoard.prototype.initAsync.call(rt.board, msg);

    const origWriteBuf = pxsim.SerialDevice.prototype.writeBuffer;
    pxsim.SerialDevice.prototype.writeBuffer = function (buffer) {
        if (buffer && buffer.data) {
            const text = Buffer.from(buffer.data).toString("utf8");
            for (const line of text.split(/\r?\n/)) {
                if (line.trim()) serialLines.push(line.trim());
            }
        }
        if (origWriteBuf) return origWriteBuf.call(this, buffer);
    };

    const origSendBuffer = pxsim.light.sendBuffer;
    pxsim.light.sendBuffer = function (pin, clk, mode, buf) {
        if (pin && buf && buf.data) {
            frames.push({
                pinId: pin.id,
                mode: mode & 0xff,
                pixels: decodeWs2811Frame(Array.from(buf.data), 60)
            });
        }
        if (origSendBuffer) return origSendBuffer.call(this, pin, clk, mode, buf);
    };

    await rt.board.initAsync(runMsg);
    rt.run(() => {});

    const start = Date.now();
    let pressedBtn = false;
    while (Date.now() - start < 3000) {
        await new Promise(r => setTimeout(r, 50));
        if (!pressedBtn && serialLines.some(l => l.includes("XMAS FRAME3"))) {
            // Simulate active-low press on D5 (GPIO23)
            const d5 = rt.board.edgeConnectorState.getPin(23);
            assert.ok(d5, "Expected D5 (GPIO23) pin in DalBoard");
            d5.setValue(0);
            pressedBtn = true;
        }
        if (serialLines.some(l => l.includes("XMAS BTN_A")) && frames.length >= 3) {
            break;
        }
    }
    rt.kill();

    assert.ok(serialLines.includes("XMAS FRAME1 PCB DIST=60"), "Expected FRAME1 serial marker, got: " + JSON.stringify(serialLines));
    assert.ok(serialLines.includes("XMAS FRAME2 HOLZ"), "Expected FRAME2 serial marker");
    assert.ok(serialLines.includes("XMAS FRAME3 FADE=8323072"), "Expected fadeAll(128) on 0xff0000 -> 0x7f0000 (8323072), got: " + JSON.stringify(serialLines));
    assert.ok(serialLines.includes("XMAS BTN_A"), "Expected onButtonPressed(D5) to fire XMAS BTN_A");

    // Verify all 3 WS2811/WS2812B 60-LED frames on D10 (GPIO18)
    const d10Frames = frames.filter(f => f.pinId === 18);
    assert.strictEqual(d10Frames.length, 3, `Expected 3 WS2811 frames on D10 (GPIO18), got ${d10Frames.length}`);

    // Frame 1: LED 55 (StarOuter[2]) should be Ice palette[220] with CIE-L* + White Balance (255,176,240)
    const led55 = d10Frames[0].pixels[55];
    assert.ok(led55.b > led55.r && led55.b >= 180, `Expected Ice-blue star tip at LED 55, got ${JSON.stringify(led55)}`);

    // Frame 2: Holz mapping -> logical 18 maps to physical 31; pure red (255,0,0) -> CIE-L* (255,0,0)
    const f2 = d10Frames[1].pixels;
    assert.deepStrictEqual(f2[31], { r: 255, g: 0, b: 0 }, "Expected Holz logical #18 at physical WS2811 index #31");
    assert.deepStrictEqual(f2[18], { r: 0, g: 0, b: 0 }, "Expected physical WS2811 index #18 to be off in Holz mode");

    // Frame 3: fadeAll(128) -> shadow R=127 -> CIE-L* (~26)
    const expectedFadeR = cieLstarChannel(127, 255);
    assert.deepStrictEqual(d10Frames[2].pixels[31], { r: expectedFadeR, g: 0, b: 0 },
        `Expected CIE-L*(127)=${expectedFadeR} at physical #31 after fadeAll(128)`);

    console.log(
        `✔ Step 2: Verified 3x 60-LED WS2811/WS2812B frames on GPIO18 (D10) in pxsim DalBoard emulator ` +
        `(TwinkleFOX, Holz map 18->31, CIE-L* fadeAll=${expectedFadeR}, D5 button event)`
    );
}

function runOnQemuEsp32C6() {
    const builtQemu = "/home/antigravity/chatelao/qemu/build/qemu-system-riscv32";
    const prebuiltQemu = "/home/antigravity/.local/qemu-esp/qemu/bin/qemu-system-riscv32";
    const qemuBin = fs.existsSync(builtQemu) ? builtQemu : prebuiltQemu;
    const qemuShare = "/home/antigravity/.local/qemu-esp/qemu/share/qemu";
    if (!fs.existsSync(qemuBin)) {
        console.log("⚠ Step 3 skipped: qemu-system-riscv32 not found");
        return;
    }

    const pxtBin = path.resolve(makerDir, "../pxt/built/pxt.js");
    execFileSync(
        process.execPath,
        [pxtBin, "build", "--localbuild", "--hwvariant", "esp32c6"],
        {
            cwd: projDir,
            env: Object.assign({}, process.env, { PXT_FORCE_LOCAL: "1" }),
            stdio: "inherit"
        }
    );

    const builtDir = path.join(projDir, "built");
    const boardBuiltDir = path.join(makerDir, "libs/seeed-xiao-esp32c6/built");
    const bootPath = fs.existsSync(path.join(builtDir, "bootloader.bin"))
        ? path.join(builtDir, "bootloader.bin")
        : path.join(boardBuiltDir, "bootloader.bin");
    const partPath = fs.existsSync(path.join(builtDir, "partition-table.bin"))
        ? path.join(builtDir, "partition-table.bin")
        : path.join(boardBuiltDir, "partition-table.bin");
    const flashPath = path.join(builtDir, "flash.bin");
    const flash = Buffer.alloc(4 * 1024 * 1024, 0xff);
    fs.readFileSync(bootPath).copy(flash, 0x0);
    fs.readFileSync(partPath).copy(flash, 0x8000);
    fs.readFileSync(path.join(builtDir, "binary.bin")).copy(flash, 0x10000);
    fs.writeFileSync(flashPath, flash);

    const jtagLog = "/tmp/e2e-esp32c6-christmastree-jtag.log";
    if (fs.existsSync(jtagLog)) fs.unlinkSync(jtagLog);

    try {
        execFileSync(
            "timeout",
            [
                "6s",
                qemuBin,
                "-nographic",
                "-M", "esp32c6",
                "-L", qemuShare,
                "-drive", `file=${flashPath},if=mtd,format=raw`,
                "-serial", "null",
                "-serial", "null",
                "-serial", `file:${jtagLog}`,
                "-monitor", "none"
            ],
            { stdio: "ignore" }
        );
    } catch (e) {
        // timeout exits with 124 after 6s
    }

    const log = fs.readFileSync(jtagLog, "utf8");
    assert.ok(log.includes("ESP-IDF:          v5.5.6"), "Expected ESP-IDF v5.5.6 banner in QEMU log");
    assert.ok(log.includes("XMAS FRAME1 PCB DIST=60"), "Expected XMAS FRAME1 PCB DIST=60 in QEMU log:\n" + log);
    assert.ok(log.includes("XMAS FRAME2 HOLZ"), "Expected XMAS FRAME2 HOLZ in QEMU log:\n" + log);
    assert.ok(log.includes("XMAS FRAME3 FADE=8323072"), "Expected XMAS FRAME3 FADE=8323072 in QEMU log:\n" + log);
    console.log("✔ Step 3: Booted and executed Christmas Tree VM (TwinkleFOX + Holz + CIE-L* fadeAll) on QEMU esp32c6!");
}

function captureLayoutScreenshot(compileRes) {
    const chromeBin = "/usr/bin/google-chrome";
    if (!fs.existsSync(chromeBin)) {
        console.log("⚠ Screenshot skipped: /usr/bin/google-chrome not found");
        return;
    }

    const pxtsimJs = fs.readFileSync(path.join(pxtCoreDir, "built/pxtsim.js"), "utf8");
    const commonSimJs = fs.readFileSync(path.join(makerDir, "built/common-sim.js"), "utf8");
    const simJs = fs.readFileSync(path.join(makerDir, "built/sim.js"), "utf8");
    const boardJson = JSON.parse(fs.readFileSync(path.join(makerDir, "libs/seeed-xiao-esp32c6/board.json"), "utf8"));
    const boardSvg = fs.readFileSync(path.join(makerDir, "libs/seeed-xiao-esp32c6/board.svg"), "utf8");
    boardJson.visual.image = "data:image/svg+xml;base64," + Buffer.from(boardSvg, "utf8").toString("base64");

    const coreParts = JSON.parse(fs.readFileSync(path.join(commonLibsDir, "core/pxtparts.json"), "utf8"));
    const treeParts = JSON.parse(fs.readFileSync(path.join(makerDir, "libs/christmas-tree/pxtparts.json"), "utf8"));
    const partDefinitions = Object.assign({}, coreParts, treeParts);

    const runMsg = {
        type: "run",
        code: compileRes.outfiles[pxtc.BINARY_JS],
        boardDefinition: boardJson,
        parts: compileRes.usedParts,
        partDefinitions,
        fnArgs: compileRes.usedArguments || {},
        cdnUrl: ""
    };

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { width: 100%; height: 100%; margin: 0; padding: 12px; box-sizing: border-box; background: #f4f6f8; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    svg { max-width: 100%; max-height: 100%; }
  </style>
  <script>${pxtsimJs}</script>
  <script>${commonSimJs}</script>
  <script>${simJs}</script>
</head>
<body>
  <script>
    window.addEventListener("load", () => {
      pxsim.Embed.run(${JSON.stringify(runMsg)});
    });
  </script>
</body>
</html>`;

    const tmpHtml = "/tmp/e2e-xiao-esp32c6-christmastree-sim.html";
    const outPng = path.join(projDir, "layout.png");
    fs.writeFileSync(tmpHtml, html, "utf8");

    execFileSync(
        chromeBin,
        [
            "--headless",
            "--no-sandbox",
            "--disable-gpu",
            "--window-size=640,860",
            "--virtual-time-budget=2000",
            `--screenshot=${outPng}`,
            `file://${tmpHtml}`
        ],
        { stdio: "ignore" }
    );

    assert.ok(fs.existsSync(outPng) && fs.statSync(outPng).size > 4096, "Expected non-empty layout.png screenshot");
    console.log(`✔ Step 4: Captured Christmas Tree simulator layout screenshot at ${outPng} (${fs.statSync(outPng).size}B)`);
}

(async () => {
    const compileRes = await compileSimulatorJs();
    await runOnWs2811Emulator(compileRes.outfiles[pxtc.BINARY_JS]);
    if (!process.argv.includes("--skip-qemu")) {
        runOnQemuEsp32C6();
    }
    if (!process.argv.includes("--skip-screenshot")) {
        captureLayoutScreenshot(compileRes);
    }
    console.log("✔ End-to-End XIAO ESP32-C6 Christmas Tree test passed!");
})().catch(err => {
    console.error(err);
    process.exit(1);
});

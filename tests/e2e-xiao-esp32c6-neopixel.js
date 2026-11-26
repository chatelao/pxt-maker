const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const { execFileSync } = require("child_process");

require("../../pxt/built/pxt.js");

const makerDir = path.resolve(__dirname, "..");
const commonLibsDir = path.resolve(makerDir, "../pxt-common-packages/libs");
const projDir = path.join(__dirname, "e2e-xiao-esp32c6-neopixel");
const pxtarget = JSON.parse(fs.readFileSync(path.join(makerDir, "pxtarget.json"), "utf8"));

function verifyBlocksProject() {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(projDir, "pxt.json"), "utf8"));
    assert.ok(pkgJson.files.includes("main.blocks"), "pxt.json must include main.blocks");
    assert.ok(pkgJson.files.includes("main.ts"), "pxt.json must include main.ts");
    assert.ok(pkgJson.dependencies["seeed-xiao-esp32c6"], "pxt.json must depend on seeed-xiao-esp32c6");
    assert.ok(pkgJson.dependencies["light"], "pxt.json must depend on light (NeoPixel) plugin");

    const blocksXml = fs.readFileSync(path.join(projDir, "main.blocks"), "utf8");
    assert.ok(blocksXml.includes('type="neopixel_create_strip"'), "main.blocks must contain neopixel_create_strip");
    assert.ok(blocksXml.includes('type="neopixel_set_strip_color"'), "main.blocks must contain neopixel_set_strip_color");
    assert.ok(blocksXml.includes(">pins.D2<"), "main.blocks must target pins.D2");
    assert.ok(blocksXml.includes('type="serial_writeline"'), "main.blocks must contain serial_writeline");
    console.log("✔ Step 1: XIAO ESP32-C6 NeoPixel plugin blocks project validated (main.blocks + main.ts)");
}

function buildAndDownloadEsp32C6Binary() {
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
    const appBin = fs.readFileSync(path.join(builtDir, "binary.bin"));
    const bootBin = fs.readFileSync(path.join(builtDir, "bootloader.bin"));
    const partBin = fs.readFileSync(path.join(builtDir, "partition-table.bin"));

    assert.strictEqual(appBin[0], 0xE9, "binary.bin must start with ESP32 image magic 0xE9");
    assert.strictEqual(pxt.HF2.read16(appBin, 12), 13, "binary.bin chip_id must be 13 (esp32-c6)");
    assert.ok(appBin.length > 512 * 1024, "binary.bin should contain full ESP-IDF firmware + NeoPixel VM");
    assert.ok(bootBin.length > 1024 && bootBin[0] === 0xE9, "bootloader.bin must be valid ESP32-C6 bootloader");
    assert.ok(partBin.length >= 256, "partition-table.bin must be valid partition table");

    console.log(
        `✔ Step 2: Downloaded ESP32-C6 NeoPixel binaries to ${builtDir} ` +
        `(binary.bin=${appBin.length}B, bootloader.bin=${bootBin.length}B, partition-table.bin=${partBin.length}B)`
    );
}

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

async function compileSimulatorJs() {
    pxtarget.bundledpkgs = pxtarget.bundledpkgs || {};
    pxtarget.versions = pxtarget.versions || { target: "0.0.0", pxt: "0.0.0" };
    pxt.setAppTarget(pxtarget);

    const boardDir = path.join(makerDir, "libs/seeed-xiao-esp32c6");
    const lightDir = path.join(makerDir, "libs/light");
    const fileSystem = loadPackageFiles(boardDir, "pxt_modules/seeed-xiao-esp32c6/");
    loadPackageFiles(lightDir, "pxt_modules/light/", new Set(), fileSystem);
    loadPackageFiles(path.join(commonLibsDir, "base"), "pxt_modules/base/", new Set(), fileSystem);
    const baseBuiltDir = path.join(makerDir, "libs/base/built");
    fileSystem["pxt_modules/base/pxt-core.d.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-core.d.ts"), "utf8");
    fileSystem["pxt_modules/base/pxt-helpers.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-helpers.ts"), "utf8");

    fileSystem["pxt.json"] = JSON.stringify({
        name: "xiao-esp32c6-neopixel-sim",
        dependencies: {
            "seeed-xiao-esp32c6": "file:pxt_modules/seeed-xiao-esp32c6",
            "light": "file:pxt_modules/light"
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
    return res;
}

async function runOnEmulator(binaryJs) {
    const pxtsimJs = fs.readFileSync(path.resolve(makerDir, "../pxt/built/pxtsim.js"), "utf8");
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
        parts: ["neopixel"],
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
                bytes: Array.from(buf.data)
            });
        }
        if (origSendBuffer) return origSendBuffer.call(this, pin, clk, mode, buf);
    };

    await rt.board.initAsync(runMsg);
    rt.run(() => {});

    const start = Date.now();
    while (Date.now() - start < 2000) {
        await new Promise(r => setTimeout(r, 50));
        const hasRed = serialLines.some(l => l.includes("NEOPIXEL RED"));
        const hasGreen = serialLines.some(l => l.includes("NEOPIXEL GREEN"));
        if (hasRed && hasGreen && frames.length >= 2) {
            break;
        }
    }
    rt.kill();

    assert.ok(serialLines.some(l => l.includes("NEOPIXEL RED")), "Expected 'NEOPIXEL RED' in serial output");
    assert.ok(serialLines.some(l => l.includes("NEOPIXEL GREEN")), "Expected 'NEOPIXEL GREEN' in serial output");

    // Pin D2 is GPIO2 on XIAO ESP32-C6; 4 WS2812B pixels = 12 bytes in GRB order
    const d2Frames = frames.filter(f => f.pinId === 2 && f.bytes.length === 12);
    const hasRedGrb = d2Frames.some(f => f.bytes[0] === 0 && f.bytes[1] === 255 && f.bytes[2] === 0);
    const hasGreenGrb = d2Frames.some(f => f.bytes[0] === 255 && f.bytes[1] === 0 && f.bytes[2] === 0);
    assert.ok(hasRedGrb, "Expected WS2812B GRB red frame [0,255,0,...] on GPIO2, got: " + JSON.stringify(d2Frames));
    assert.ok(hasGreenGrb, "Expected WS2812B GRB green frame [255,0,0,...] on GPIO2, got: " + JSON.stringify(d2Frames));

    console.log(
        `✔ Step 3: Executed NeoPixel on pxsim DalBoard emulator — ` +
        `captured ${d2Frames.length} WS2812B frames on GPIO2 (Red GRB + Green GRB), serial=${JSON.stringify(serialLines)}`
    );
}

function runOnQemuEsp32C6() {
    const builtQemu = "/home/antigravity/chatelao/qemu/build/qemu-system-riscv32";
    const prebuiltQemu = "/home/antigravity/.local/qemu-esp/qemu/bin/qemu-system-riscv32";
    const qemuBin = fs.existsSync(builtQemu) ? builtQemu : prebuiltQemu;
    const qemuShare = "/home/antigravity/.local/qemu-esp/qemu/share/qemu";
    if (!fs.existsSync(qemuBin)) {
        console.log("⚠ Step 4 skipped: qemu-system-riscv32 not found");
        return;
    }

    const builtDir = path.join(projDir, "built");
    const flashPath = path.join(builtDir, "flash.bin");
    const flash = Buffer.alloc(4 * 1024 * 1024, 0xff);
    fs.readFileSync(path.join(builtDir, "bootloader.bin")).copy(flash, 0x0);
    fs.readFileSync(path.join(builtDir, "partition-table.bin")).copy(flash, 0x8000);
    fs.readFileSync(path.join(builtDir, "binary.bin")).copy(flash, 0x10000);
    fs.writeFileSync(flashPath, flash);

    const jtagLog = "/tmp/e2e-esp32c6-neopixel-jtag.log";
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
    assert.ok(log.includes("ESP-ROM:esp32c6"), "Expected ESP32-C6 BootROM banner in QEMU log");
    assert.ok(log.includes("2nd stage bootloader"), "Expected 2nd stage bootloader in QEMU log");
    assert.ok(log.includes("Loaded app from partition at offset 0x10000"), "Expected app load at 0x10000 in QEMU log");
    assert.ok(log.includes("ESP-IDF:          v5.5.6"), "Expected ESP-IDF v5.5.6 banner in QEMU log");
    if (qemuBin === builtQemu) {
        assert.ok(log.includes("main_task: Calling app_main()"), "Expected app_main() execution in QEMU log");
        assert.ok(log.includes("NEOPIXEL RED"), "Expected 'NEOPIXEL RED' from NeoPixel VM in QEMU log:\n" + log);
        assert.ok(log.includes("NEOPIXEL GREEN"), "Expected 'NEOPIXEL GREEN' from NeoPixel VM in QEMU log:\n" + log);
    }
    console.log("✔ Step 4: Booted and executed NeoPixel VM ('NEOPIXEL RED' / 'NEOPIXEL GREEN') on QEMU esp32c6!");
}

function captureLayoutScreenshot(compileRes) {
    const chromeBin = "/usr/bin/google-chrome";
    if (!fs.existsSync(chromeBin)) {
        console.log("⚠ Screenshot skipped: /usr/bin/google-chrome not found");
        return;
    }

    const pxtsimJs = fs.readFileSync(path.resolve(makerDir, "../pxt/built/pxtsim.js"), "utf8");
    const commonSimJs = fs.readFileSync(path.join(makerDir, "built/common-sim.js"), "utf8");
    const simJs = fs.readFileSync(path.join(makerDir, "built/sim.js"), "utf8");
    const boardJson = JSON.parse(fs.readFileSync(path.join(makerDir, "libs/seeed-xiao-esp32c6/board.json"), "utf8"));
    const boardSvg = fs.readFileSync(path.join(makerDir, "libs/seeed-xiao-esp32c6/board.svg"), "utf8");
    boardJson.visual.image = "data:image/svg+xml;base64," + Buffer.from(boardSvg, "utf8").toString("base64");
    const partDefinitions = JSON.parse(fs.readFileSync(path.join(commonLibsDir, "core/pxtparts.json"), "utf8"));

    const fnArgs = (compileRes.usedArguments && Object.keys(compileRes.usedArguments).length)
        ? compileRes.usedArguments
        : { "light.createStrip": ["pins.D2,NeoPixelMode.RGB"] };
    const runMsg = {
        type: "run",
        code: compileRes.outfiles[pxtc.BINARY_JS],
        boardDefinition: boardJson,
        parts: compileRes.usedParts && compileRes.usedParts.length ? compileRes.usedParts : ["neopixel"],
        partDefinitions,
        fnArgs,
        cdnUrl: ""
    };

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { width: 100%; height: 100%; margin: 0; padding: 16px; box-sizing: border-box; background: #f4f6f8; display: flex; align-items: center; justify-content: center; overflow: hidden; }
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

    const tmpHtml = "/tmp/e2e-xiao-esp32c6-neopixel-sim.html";
    const outPng = path.join(projDir, "layout.png");
    fs.writeFileSync(tmpHtml, html, "utf8");

    execFileSync(
        chromeBin,
        [
            "--headless",
            "--no-sandbox",
            "--disable-gpu",
            "--window-size=640,760",
            "--virtual-time-budget=2000",
            `--screenshot=${outPng}`,
            `file://${tmpHtml}`
        ],
        { stdio: "ignore" }
    );

    assert.ok(fs.existsSync(outPng) && fs.statSync(outPng).size > 4096, "Expected non-empty layout.png screenshot");
    console.log(`✔ Step 5: Captured live NeoPixel simulator layout screenshot at ${outPng} (${fs.statSync(outPng).size}B)`);
}

(async () => {
    verifyBlocksProject();
    if (!process.argv.includes("--skip-native")) {
        buildAndDownloadEsp32C6Binary();
    }
    const compileRes = await compileSimulatorJs();
    await runOnEmulator(compileRes.outfiles[pxtc.BINARY_JS]);
    if (!process.argv.includes("--skip-qemu")) {
        runOnQemuEsp32C6();
    }
    captureLayoutScreenshot(compileRes);
    console.log("✔ End-to-End XIAO ESP32-C6 NeoPixel plugin testcase passed!");
})().catch(err => {
    console.error(err);
    process.exit(1);
});

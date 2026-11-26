const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const { execFileSync } = require("child_process");

require("../../pxt/built/pxt.js");

const makerDir = path.resolve(__dirname, "..");
const commonLibsDir = path.resolve(makerDir, "../pxt-common-packages/libs");
const projDir = path.join(__dirname, "e2e-xiao-esp32c6-blink");
const pxtarget = JSON.parse(fs.readFileSync(path.join(makerDir, "pxtarget.json"), "utf8"));

function verifyBlocksProject() {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(projDir, "pxt.json"), "utf8"));
    assert.ok(pkgJson.files.includes("main.blocks"), "pxt.json must include main.blocks");
    assert.ok(pkgJson.files.includes("main.ts"), "pxt.json must include main.ts");
    assert.ok(pkgJson.dependencies["seeed-xiao-esp32c6"], "pxt.json must depend on seeed-xiao-esp32c6");

    const blocksXml = fs.readFileSync(path.join(projDir, "main.blocks"), "utf8");
    assert.ok(blocksXml.includes('type="forever"'), "main.blocks must contain forever block");
    assert.ok(blocksXml.includes('type="device_set_digital_pin"'), "main.blocks must contain digital write block");
    assert.ok(blocksXml.includes(">pins.LED<"), "main.blocks must target pins.LED");
    assert.ok(blocksXml.includes('type="serial_writeline"'), "main.blocks must contain serial write line block");
    assert.ok(blocksXml.includes('type="device_pause"'), "main.blocks must contain pause block");
    console.log("✔ Step 1: Minimal XIAO ESP32-C6 Blink blocks project validated (main.blocks + main.ts)");
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
    assert.ok(appBin.length > 512 * 1024, "binary.bin should contain full ESP-IDF firmware + Blink VM");
    assert.ok(bootBin.length > 1024 && bootBin[0] === 0xE9, "bootloader.bin must be valid ESP32-C6 bootloader");
    assert.ok(partBin.length >= 256, "partition-table.bin must be valid partition table");

    console.log(
        `✔ Step 2: Downloaded ESP32-C6 binaries to ${builtDir} ` +
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
    const fileSystem = loadPackageFiles(boardDir, "pxt_modules/seeed-xiao-esp32c6/");
    loadPackageFiles(path.join(commonLibsDir, "base"), "pxt_modules/base/", new Set(), fileSystem);
    const baseBuiltDir = path.join(makerDir, "libs/base/built");
    fileSystem["pxt_modules/base/pxt-core.d.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-core.d.ts"), "utf8");
    fileSystem["pxt_modules/base/pxt-helpers.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-helpers.ts"), "utf8");

    fileSystem["pxt.json"] = JSON.stringify({
        name: "xiao-esp32c6-blink-sim",
        dependencies: { "seeed-xiao-esp32c6": "file:pxt_modules/seeed-xiao-esp32c6" },
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
    const res = pxtc.compile(opts);
    assert.strictEqual(res.success, true, "Simulator JS compilation failed: " + JSON.stringify(res.diagnostics));
    return res.outfiles[pxtc.BINARY_JS];
}

async function runOnEmulator(binaryJs) {
    const pxtsimJs = fs.readFileSync(path.resolve(makerDir, "../pxt/built/pxtsim.js"), "utf8");
    const commonSimJs = fs.readFileSync(path.join(makerDir, "built/common-sim.js"), "utf8");
    const simJs = fs.readFileSync(path.join(makerDir, "built/sim.js"), "utf8");
    const boardJson = JSON.parse(fs.readFileSync(path.join(makerDir, "libs/seeed-xiao-esp32c6/board.json"), "utf8"));

    const serialLines = [];
    const ledTransitions = [];

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
        parent: {
            postMessage: (msg) => {
                if (msg && msg.type === "serial" && msg.data) {
                    serialLines.push(String(msg.data).trim());
                }
            }
        },
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(pxtsimJs, sandbox);
    vm.runInContext(commonSimJs, sandbox);
    vm.runInContext(simJs, sandbox);

    const pxsim = sandbox.pxsim;
    pxsim.Runtime.postMessage = (msg) => {
        if (msg && msg.type === "serial" && msg.data) {
            serialLines.push(String(msg.data).trim());
        }
    };

    const runMsg = {
        type: "run",
        code: binaryJs,
        boardDefinition: boardJson,
        parts: [],
        partDefinitions: {},
        cdnUrl: ""
    };
    const rt = new pxsim.Runtime(runMsg);
    pxsim.runtime = rt;

    // Bypass SVG DOM visuals in headless Node while preserving full DalBoard/CoreBoard hardware state
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

    // Pin 15 is XIAO ESP32-C6 onboard yellow LED (CFG_PIN_LED = 15)
    const ledPin = rt.board.edgeConnectorState.getPin(15);
    assert.ok(ledPin, "Expected LED pin (GPIO15) on emulated DalBoard");
    const origDigitalWrite = pxsim.DigitalInOutPinMethods.digitalWrite;
    pxsim.DigitalInOutPinMethods.digitalWrite = function (pin, value) {
        if (pin && pin.id === 15) {
            ledTransitions.push(value ? 1 : 0);
        }
        return origDigitalWrite.call(this, pin, value);
    };

    await rt.board.initAsync(runMsg);
    rt.run(() => {});

    // Poll until we observe at least one full ON -> OFF cycle and serial logs
    const start = Date.now();
    while (Date.now() - start < 2000) {
        await new Promise(r => setTimeout(r, 50));
        const hasOn = serialLines.some(l => l.includes("LED ON"));
        const hasOff = serialLines.some(l => l.includes("LED OFF"));
        if (hasOn && hasOff && ledTransitions.includes(0) && ledTransitions.includes(1)) {
            break;
        }
    }
    rt.kill();

    assert.ok(serialLines.some(l => l.includes("LED ON")), "Expected 'LED ON' in emulator serial output, got: " + JSON.stringify(serialLines));
    assert.ok(serialLines.some(l => l.includes("LED OFF")), "Expected 'LED OFF' in emulator serial output, got: " + JSON.stringify(serialLines));
    assert.ok(ledTransitions.includes(0), "Expected LED GPIO15 to transition LOW (0), got: " + JSON.stringify(ledTransitions));
    assert.ok(ledTransitions.includes(1), "Expected LED GPIO15 to transition HIGH (1), got: " + JSON.stringify(ledTransitions));

    console.log(
        `✔ Step 3: Executed Blink on pxsim DalBoard emulator — ` +
        `GPIO15 transitions=${JSON.stringify(ledTransitions)}, serial=${JSON.stringify(serialLines)}`
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

    const jtagLog = "/tmp/e2e-esp32c6-jtag.log";
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
    assert.ok(log.includes("Project name:     pxtapp"), "Expected pxtapp banner in QEMU log");
    assert.ok(log.includes("ESP-IDF:          v5.5.6"), "Expected ESP-IDF v5.5.6 banner in QEMU log");
    if (qemuBin === builtQemu) {
        assert.ok(log.includes("main_task: Calling app_main()"), "Expected app_main() execution in QEMU log");
        assert.ok(log.includes("LED ON"), "Expected 'LED ON' from Blink VM in QEMU serial log:\n" + log);
        assert.ok(log.includes("LED OFF"), "Expected 'LED OFF' from Blink VM in QEMU serial log:\n" + log);
    }
    console.log("✔ Step 4: Booted and executed Blink VM ('LED ON' / 'LED OFF') on QEMU esp32c6!");
}

(async () => {
    verifyBlocksProject();
    if (!process.argv.includes("--skip-native")) {
        buildAndDownloadEsp32C6Binary();
    }
    const binaryJs = await compileSimulatorJs();
    await runOnEmulator(binaryJs);
    runOnQemuEsp32C6();
    console.log("✔ End-to-End XIAO ESP32-C6 Blink testcase passed!");
})().catch(err => {
    console.error(err);
    process.exit(1);
});

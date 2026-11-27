"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const { execFileSync } = require("child_process");

require("../../pxt/built/pxt.js");

const makerDir = path.resolve(__dirname, "..");
const commonLibsDir = path.resolve(makerDir, "../pxt-common-packages/libs");
const pxtarget = JSON.parse(fs.readFileSync(path.join(makerDir, "pxtarget.json"), "utf8"));

const TARGETS = [
    { boardId: "rpi-pico2", projDir: path.join(__dirname, "e2e-rpi-pico2-blink") },
    { boardId: "rpi-pico2-w", projDir: path.join(__dirname, "e2e-rpi-pico2-w-blink") }
];

function verifyTargetConfig() {
    assert.ok(pxtarget.bundleddirs.includes("libs/core---rp2350"), "missing libs/core---rp2350 in bundleddirs");
    assert.ok(pxtarget.bundleddirs.includes("libs/rpi-pico2"), "missing libs/rpi-pico2 in bundleddirs");
    assert.ok(pxtarget.bundleddirs.includes("libs/rpi-pico2-w"), "missing libs/rpi-pico2-w in bundleddirs");

    const v = pxtarget.variants.rp2350;
    assert.ok(v, "missing variants.rp2350");
    assert.strictEqual(v.compile.hasHex, true);
    assert.strictEqual(v.compile.flashEnd, 4194304);
    assert.strictEqual(v.compile.uf2Family, "0xe48bff59");
    assert.strictEqual(v.compileService.codalBinary, "PI-PICO2");
    console.log("✔ Step 1: pxtarget.json rp2350 variant & bundleddirs verified");
}

function verifyBlocksProject(boardId, projDir) {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(projDir, "pxt.json"), "utf8"));
    assert.ok(pkgJson.files.includes("main.blocks"), `${boardId}: pxt.json must include main.blocks`);
    assert.ok(pkgJson.files.includes("main.ts"), `${boardId}: pxt.json must include main.ts`);
    assert.ok(pkgJson.dependencies[boardId], `${boardId}: pxt.json must depend on ${boardId}`);

    const blocksXml = fs.readFileSync(path.join(projDir, "main.blocks"), "utf8");
    assert.ok(blocksXml.includes('type="forever"'), `${boardId}: main.blocks must contain forever block`);
    assert.ok(blocksXml.includes('type="device_set_digital_pin"'), `${boardId}: main.blocks must contain digital write block`);
    assert.ok(blocksXml.includes(">pins.LED<"), `${boardId}: main.blocks must target pins.LED`);
    assert.ok(blocksXml.includes('type="device_set_analog_pin"'), `${boardId}: main.blocks must contain analog write block`);
    assert.ok(blocksXml.includes('type="device_pause"'), `${boardId}: main.blocks must contain pause block`);

    const boardDir = path.join(makerDir, "libs", boardId);
    const boardJson = JSON.parse(fs.readFileSync(path.join(boardDir, "board.json"), "utf8"));
    assert.strictEqual(boardJson.driveDisplayName, "RP2350");
    assert.strictEqual(boardJson.i2cPins.SDA, "P4");
    assert.strictEqual(boardJson.i2cPins.SCL, "P5");
    assert.ok(fs.existsSync(path.join(boardDir, "board.svg")), `${boardId}/board.svg must exist`);

    console.log(`✔ [${boardId}] Step 2: Blocks project & board metadata verified`);
}

function buildAndVerifyNativeUf2(boardId, projDir) {
    const pxtBin = path.resolve(makerDir, "../pxt/built/pxt.js");
    execFileSync(
        process.execPath,
        [pxtBin, "build", "--localbuild", "--hwvariant", "rp2350"],
        {
            cwd: projDir,
            env: Object.assign({}, process.env, { PXT_FORCE_LOCAL: "1", PXT_NODOCKER: "force" }),
            stdio: "inherit"
        }
    );

    const uf2Path = path.join(projDir, "built", "binary.uf2");
    assert.ok(fs.existsSync(uf2Path), `${boardId}: expected ${uf2Path} to exist`);
    const buf = fs.readFileSync(uf2Path);
    assert.ok(buf.length > 100 * 1024 && buf.length % 512 === 0, `${boardId}: invalid UF2 size ${buf.length}`);

    assert.strictEqual(buf.readUInt32LE(0), 0x0a324655, "UF2 magic0");
    assert.strictEqual(buf.readUInt32LE(4), 0x9e5d5157, "UF2 magic1");
    assert.strictEqual(buf.readUInt32LE(8) & 0x2000, 0x2000, "UF2 familyID flag");
    assert.strictEqual(buf.readUInt32LE(12), 0x10000000, "RP2350 XIP flash base 0x10000000");
    assert.strictEqual(buf.readUInt32LE(16), 256, "UF2 256-byte payload");
    assert.strictEqual(buf.readUInt32LE(28), 0xe48bff59, "RP2350_ARM_S family ID 0xe48bff59");
    assert.strictEqual(buf.readUInt32LE(508), 0x0ab16f30, "UF2 magicEnd");

    let foundPicobin = false;
    for (let b = 0; b < 16; b++) {
        const payload = buf.subarray(b * 512 + 32, b * 512 + 32 + 256);
        for (let i = 0; i <= payload.length - 4; i += 4) {
            if (payload.readUInt32LE(i) === 0xffffded3) {
                foundPicobin = true;
                break;
            }
        }
        if (foundPicobin) break;
    }
    assert.ok(foundPicobin, `${boardId}: UF2 missing PICOBIN_BLOCK_MARKER_START (0xffffded3) in first 4KB`);

    const asmPath = path.join(projDir, "built", "binary.asm");
    assert.ok(fs.existsSync(asmPath) && fs.statSync(asmPath).size > 1024, `${boardId}: expected generated binary.asm`);

    console.log(`✔ [${boardId}] Step 3: Native ARM Cortex-M33 UF2 verified (${buf.length}B, familyId=0xe48bff59, PICOBIN valid)`);
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
        if (!fs.existsSync(d)) continue;
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

    const deps = Object.assign({}, cfg.dependencies || {}, cfg.cppDependencies || {});
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

async function compileSimulatorJs(boardId, projDir) {
    pxtarget.bundledpkgs = pxtarget.bundledpkgs || {};
    pxtarget.versions = pxtarget.versions || { target: "0.0.0", pxt: "0.0.0" };
    pxt.setAppTarget(pxtarget);

    const boardDir = path.join(makerDir, "libs", boardId);
    const fileSystem = loadPackageFiles(boardDir, `pxt_modules/${boardId}/`);
    loadPackageFiles(path.join(commonLibsDir, "base"), "pxt_modules/base/", new Set(), fileSystem);
    const baseBuiltDir = fs.existsSync(path.join(makerDir, "libs/base/built/pxt-core.d.ts"))
        ? path.join(makerDir, "libs/base/built")
        : path.resolve(makerDir, "../pxt/libs/pxt-common");
    fileSystem["pxt_modules/base/pxt-core.d.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-core.d.ts"), "utf8");
    fileSystem["pxt_modules/base/pxt-helpers.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-helpers.ts"), "utf8");

    fileSystem["pxt.json"] = JSON.stringify({
        name: `${boardId}-blink-sim`,
        dependencies: { [boardId]: `file:pxt_modules/${boardId}` },
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
    assert.strictEqual(res.success, true, `${boardId}: Simulator JS compilation failed: ` + JSON.stringify(res.diagnostics));
    return res.outfiles[pxtc.BINARY_JS];
}

async function runOnEmulator(boardId, binaryJs) {
    const pxtsimJs = fs.readFileSync(path.resolve(makerDir, "../pxt/built/pxtsim.js"), "utf8");
    const commonSimJs = fs.readFileSync(path.join(makerDir, "built/common-sim.js"), "utf8");
    const simJs = fs.readFileSync(path.join(makerDir, "built/sim.js"), "utf8");
    const boardJson = JSON.parse(fs.readFileSync(path.join(makerDir, "libs", boardId, "board.json"), "utf8"));

    const ledTransitions = [];
    const p0Transitions = [];
    const p1AnalogWrites = [];
    let p26AnalogReadCount = 0;

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
        parts: [],
        partDefinitions: {},
        cdnUrl: ""
    };
    const rt = new pxsim.Runtime(runMsg);
    pxsim.runtime = rt;

    // Bypass SVG DOM visuals in headless Node while preserving full DalBoard hardware state
    rt.board.initAsync = (msg) => pxsim.CoreBoard.prototype.initAsync.call(rt.board, msg);

    const origDigitalWrite = pxsim.DigitalInOutPinMethods.digitalWrite;
    pxsim.DigitalInOutPinMethods.digitalWrite = function (pin, value) {
        if (pin && pin.id === 25) ledTransitions.push(value ? 1 : 0);
        if (pin && pin.id === 0) p0Transitions.push(value ? 1 : 0);
        return origDigitalWrite.call(this, pin, value);
    };

    const origAnalogWrite = pxsim.AnalogOutPinMethods.analogWrite;
    pxsim.AnalogOutPinMethods.analogWrite = function (pin, value) {
        if (pin && pin.id === 1) p1AnalogWrites.push(value);
        return origAnalogWrite.call(this, pin, value);
    };

    const origAnalogRead = pxsim.AnalogInPinMethods.analogRead;
    pxsim.AnalogInPinMethods.analogRead = function (pin) {
        if (pin && pin.id === 26) p26AnalogReadCount++;
        return origAnalogRead.call(this, pin);
    };

    await rt.board.initAsync(runMsg);
    rt.run(() => {});

    const start = Date.now();
    while (Date.now() - start < 2000) {
        await new Promise(r => setTimeout(r, 30));
        if (
            ledTransitions.includes(1) && ledTransitions.includes(0) &&
            p0Transitions.includes(1) && p0Transitions.includes(0) &&
            p1AnalogWrites.includes(512) &&
            p26AnalogReadCount > 0
        ) {
            break;
        }
    }
    rt.kill();

    assert.ok(ledTransitions.includes(1) && ledTransitions.includes(0),
        `${boardId}: expected LED (GPIO25) HIGH & LOW transitions, got ${JSON.stringify(ledTransitions)}`);
    assert.ok(p0Transitions.includes(1) && p0Transitions.includes(0),
        `${boardId}: expected P0 (GPIO0) HIGH & LOW transitions, got ${JSON.stringify(p0Transitions)}`);
    assert.ok(p1AnalogWrites.includes(512),
        `${boardId}: expected P1 (GPIO1) analogWrite(512), got ${JSON.stringify(p1AnalogWrites)}`);
    assert.ok(p26AnalogReadCount > 0,
        `${boardId}: expected P26 (GPIO26) analogRead() call, got ${p26AnalogReadCount}`);

    console.log(
        `✔ [${boardId}] Step 4: Executed on pxsim DalBoard emulator — ` +
        `LED(GP25)=${JSON.stringify(ledTransitions)}, P0=${JSON.stringify(p0Transitions)}, ` +
        `P1_PWM=${JSON.stringify(p1AnalogWrites)}, P26_ADC_reads=${p26AnalogReadCount}`
    );
}

(async () => {
    const skipNative = process.argv.includes("--skip-native");
    verifyTargetConfig();
    for (const { boardId, projDir } of TARGETS) {
        verifyBlocksProject(boardId, projDir);
        if (!skipNative) {
            buildAndVerifyNativeUf2(boardId, projDir);
        }
        const binaryJs = await compileSimulatorJs(boardId, projDir);
        await runOnEmulator(boardId, binaryJs);
    }
    console.log("✔ All Pico 2 & Pico 2 W E2E emulation tests passed!");
})().catch(err => {
    console.error(err);
    process.exit(1);
});

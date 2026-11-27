"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

require("../../pxt/built/pxt.js");

const makerDir = path.resolve(__dirname, "..");
const pxtCoreDir = path.resolve(makerDir, "../pxt");
const commonLibsDir = path.resolve(makerDir, "node_modules/pxt-common-packages/libs");
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

    const deps = Object.assign({}, cfg.dependencies || {}, cfg.cppDependencies || {});
    for (const dep of Object.keys(deps)) {
        const depSpec = deps[dep];
        if (depSpec.startsWith("file:")) {
            const rel = depSpec.slice(5);
            let depDir = path.resolve(abs, rel);
            if (!fs.existsSync(depDir)) {
                depDir = path.join(makerDir, "libs", dep);
            }
            if (!fs.existsSync(depDir)) {
                depDir = path.join(commonLibsDir, dep);
            }
            loadPackageFiles(depDir, `pxt_modules/${dep}/`, visited, out);
        }
    }
    return out;
}

const TEST_MAIN_TS = `
let c0Count = 0
let c1Count = 0
let c1Started = false
let c1EventsReceived = 0
let c0CoreId = -1
let c1StartCoreId = -1
let c1LoopCoreId = -1
let detectedCores = control.coreCount()

c0CoreId = control.coreId()
console.log("C0_START:" + c0CoreId + ":" + detectedCores)

control.onEvent(9002, 1, function () {
    c1EventsReceived += 1
    console.log("C0_GOT_C1_EVENT:" + c1EventsReceived)
})

loops.onStartOnCore(1, function () {
    c1StartCoreId = control.coreId()
    c1Started = true
    console.log("C1_START:" + c1StartCoreId)
})

loops.foreverOnCore(1, function () {
    control.assert(c1Started, 501)
    c1LoopCoreId = control.coreId()
    c1Count += 1
    if (c1Count <= 3) {
        control.raiseEvent(9002, 1)
    }
    console.log("C1_TICK:" + c1Count + ":core=" + c1LoopCoreId)
    pause(20)
})

forever(function () {
    c0Count += 1
    pins.LED.digitalWrite((c0Count & 1) === 1)
    console.log("C0_TICK:" + c0Count + ":core=" + control.coreId())
    pause(20)
})
`;

async function compileBoard(boardName, variantName) {
    pxtarget.bundledpkgs = pxtarget.bundledpkgs || {};
    pxtarget.versions = pxtarget.versions || { target: "0.0.0", pxt: "0.0.0" };
    pxt.setAppTarget(pxtarget);
    pxt.setAppTargetVariant(variantName);

    const boardDir = path.join(makerDir, "libs", boardName);
    const fileSystem = loadPackageFiles(boardDir, `pxt_modules/${boardName}/`);
    loadPackageFiles(path.join(commonLibsDir, "base"), "pxt_modules/base/", new Set(), fileSystem);
    const baseBuiltDir = path.join(makerDir, "libs/base/built");
    fileSystem["pxt_modules/base/pxt-core.d.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-core.d.ts"), "utf8");
    fileSystem["pxt_modules/base/pxt-helpers.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-helpers.ts"), "utf8");

    fileSystem["pxt.json"] = JSON.stringify({
        name: `e2e-multicore-${boardName}`,
        dependencies: {
            [boardName]: `file:pxt_modules/${boardName}`
        },
        files: ["main.ts"]
    });
    fileSystem["main.ts"] = TEST_MAIN_TS;

    const host = {
        readFile: (pkg, fn) => {
            const p = pkg.id === "this" ? fn : `pxt_modules/${pkg.id}/${fn}`;
            return fileSystem[p] !== undefined ? fileSystem[p] : null;
        },
        writeFile: () => {},
        getHexInfoAsync: async () => ({ hex: [] }),
        cacheStoreAsync: async () => {},
        cacheGetAsync: async () => null,
        downloadPackageAsync: async () => {},
        resolveVersionAsync: async () => "*"
    };

    const mainPkg = new pxt.MainPackage(host);
    const opts = await mainPkg.getCompileOptionsAsync({ isNative: false, hasHex: false, switches: {} });
    opts.ast = true;
    const res = pxtc.compile(opts);
    assert.strictEqual(res.success, true, `${boardName} compile failed: ` + JSON.stringify(res.diagnostics, null, 2));

    // Verify decompiler produces top-level multi-core hat blocks
    const apis = pxtc.getApiInfo(res.ast, true);
    const blocksInfo = pxtc.getBlocksInfo(apis);
    const decomp = pxtc.decompiler.decompileToBlocks(blocksInfo, res.ast.getSourceFile("main.ts"), {});
    assert.strictEqual(decomp.success, true, `${boardName} decompile failed`);
    const xml = decomp.outfiles["main.blocks"];
    assert.ok(xml.includes('type="loops_on_start_core"'), `${boardName}: expected loops_on_start_core in XML`);
    assert.ok(xml.includes('type="loops_forever_core"'), `${boardName}: expected loops_forever_core in XML`);

    return {
        binaryJs: res.outfiles[pxtc.BINARY_JS],
        numCores: pxt.appTarget.runtime?.numCores || 1
    };
}

async function runInPxsimEmulator(boardName, binaryJs, expectedNumCores) {
    const pxtsimJs = fs.readFileSync(path.join(pxtCoreDir, "built/pxtsim.js"), "utf8");
    const commonSimJs = fs.readFileSync(path.join(makerDir, "built/common-sim.js"), "utf8");
    const simJs = fs.readFileSync(path.join(makerDir, "built/sim.js"), "utf8");
    const boardJson = JSON.parse(fs.readFileSync(path.join(makerDir, "libs", boardName, "board.json"), "utf8"));

    const serialLines = [];
    const sandboxConsole = {
        log: (...args) => {
            const msg = args.join(" ");
            if (msg.startsWith("l>")) {
                serialLines.push(msg.slice(2).trim());
            }
        },
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args)
    };
    const sandbox = {
        console: sandboxConsole,
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
        pxt: { appTarget: { runtime: { numCores: expectedNumCores } } }
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(pxtsimJs, sandbox);
    vm.runInContext(commonSimJs, sandbox);
    vm.runInContext(simJs, sandbox);

    const pxsim = sandbox.pxsim;
    pxsim.Runtime.postMessage = (msg) => {
        if (msg && msg.type === "serial" && typeof msg.data === "string") {
            for (const line of msg.data.split(/\r?\n/)) {
                if (line.trim()) serialLines.push(line.trim());
            }
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
    rt.board.initAsync = (msg) => pxsim.CoreBoard.prototype.initAsync.call(rt.board, msg);

    let panicked = null;
    rt.errorHandler = (e) => { panicked = e; };

    await new Promise((resolve) => {
        rt.run(() => {});
        setTimeout(resolve, 600);
    });
    rt.kill();

    assert.strictEqual(panicked, null, `${boardName}: runtime panicked: ` + panicked);

    const c0Start = serialLines.find(l => l.startsWith("C0_START:"));
    const c1Start = serialLines.find(l => l.startsWith("C1_START:"));
    const c0Ticks = serialLines.filter(l => l.startsWith("C0_TICK:"));
    const c1Ticks = serialLines.filter(l => l.startsWith("C1_TICK:"));
    const c0Events = serialLines.filter(l => l.startsWith("C0_GOT_C1_EVENT:"));

    assert.strictEqual(c0Start, `C0_START:0:${expectedNumCores}`, `${boardName}: expected C0_START:0:${expectedNumCores}, got ${c0Start}`);
    assert.strictEqual(c1Start, "C1_START:1", `${boardName}: expected C1_START:1, got ${c1Start}`);
    assert.ok(c0Ticks.length >= 3, `${boardName}: expected >=3 Core 0 ticks, got ${c0Ticks.length}`);
    assert.ok(c1Ticks.length >= 3, `${boardName}: expected >=3 Core 1 ticks, got ${c1Ticks.length}`);
    assert.ok(c1Ticks.every(l => l.endsWith(":core=1")), `${boardName}: Core 1 loop reported wrong coreId: ${JSON.stringify(c1Ticks)}`);
    assert.ok(c0Ticks.every(l => l.endsWith(":core=0")), `${boardName}: Core 0 loop reported wrong coreId: ${JSON.stringify(c0Ticks)}`);
    assert.strictEqual(c0Events.length, 3, `${boardName}: expected 3 cross-core events received on Core 0, got ${c0Events.length}`);

    // Verify onStartOnCore(1) ran before foreverOnCore(1)
    const idxStart = serialLines.indexOf(c1Start);
    const idxFirstTick = serialLines.indexOf(c1Ticks[0]);
    assert.ok(idxStart >= 0 && idxFirstTick > idxStart, `${boardName}: C1_START must precede first C1_TICK`);

    console.log(
        `✔ ${boardName} (numCores=${expectedNumCores}) E2E emulator PASSED ` +
        `(C0 ticks=${c0Ticks.length}, C1 ticks=${c1Ticks.length}, cross-core events=${c0Events.length})`
    );
}

(async () => {
    const cases = [
        { board: "rpi-pico", variant: "rp2040", expectedCores: 2 },
        { board: "seeed-xiao-esp32c6", variant: "esp32c6", expectedCores: 1 }
    ];

    for (const c of cases) {
        const compiled = await compileBoard(c.board, c.variant);
        assert.strictEqual(compiled.numCores, c.expectedCores, `${c.board} numCores mismatch`);
        await runInPxsimEmulator(c.board, compiled.binaryJs, c.expectedCores);
    }

    console.log("✔ All multi-core E2E emulator tests passed!");
})().catch(err => {
    console.error(err);
    process.exit(1);
});

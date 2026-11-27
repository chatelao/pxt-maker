const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

require("../../pxt/built/pxt.js");

const makerDir = path.resolve(__dirname, "..");
const commonLibsDir = path.resolve(makerDir, "../pxt-common-packages/libs");
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

function createBoardFileSystem(mainTs) {
    const boardDir = path.join(makerDir, "libs/seeed-xiao-esp32c6");
    const fileSystem = loadPackageFiles(boardDir, "pxt_modules/seeed-xiao-esp32c6/");
    loadPackageFiles(path.join(commonLibsDir, "base"), "pxt_modules/base/", new Set(), fileSystem);
    const baseBuiltDir = path.join(makerDir, "libs/base/built");
    fileSystem["pxt_modules/base/pxt-core.d.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-core.d.ts"), "utf8");
    fileSystem["pxt_modules/base/pxt-helpers.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-helpers.ts"), "utf8");

    fileSystem["pxt.json"] = JSON.stringify({
        name: "xiao-esp32c6-802154-sim",
        dependencies: { "seeed-xiao-esp32c6": "file:pxt_modules/seeed-xiao-esp32c6" },
        files: ["main.ts"]
    });
    fileSystem["main.ts"] = mainTs;
    return fileSystem;
}

async function compileSimProgram(mainTs) {
    pxtarget.bundledpkgs = pxtarget.bundledpkgs || {};
    pxtarget.versions = pxtarget.versions || { target: "0.0.0", pxt: "0.0.0" };
    pxt.setAppTarget(pxtarget);

    const fileSystem = createBoardFileSystem(mainTs);
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
    assert.strictEqual(res.success, true, "Simulator JS compilation failed: " + JSON.stringify(res.diagnostics, null, 2));
    return res.outfiles[pxtc.BINARY_JS];
}

function buildSyntheticEsp32C6HexInfo(numVmPtrs) {
    const header = new Uint8Array(24);
    header[0] = 0xE9;
    header[1] = 2;
    pxt.HF2.write32(header, 4, 0x40800000);
    pxt.HF2.write16(header, 12, 13);

    const iromData = new Uint8Array(64);
    pxt.HF2.write32(iromData, 0, 0x00000013);
    const dromSize = Math.max(128, (0x34 + numVmPtrs * 4 + 15) & ~15);
    const dromData = new Uint8Array(dromSize);
    pxt.HF2.write32(dromData, 0, 0xABCD5432);
    const marker = pxt.U.fromHex("0108010842424242010801083ed8e98d");
    dromData.set(marker, 0x20);
    pxt.HF2.write32(dromData, 0x30, 0x42300000);
    for (let i = 0; i < numVmPtrs; i++) {
        pxt.HF2.write32(dromData, 0x34 + i * 4, 0x42010100 + i * 4);
    }

    const parts = [header];
    for (const [addr, data] of [[0x42000020, iromData], [0x42010020, dromData]]) {
        const sh = new Uint8Array(8);
        pxt.HF2.write32(sh, 0, addr);
        pxt.HF2.write32(sh, 4, data.length);
        parts.push(sh, data);
    }
    const body = pxt.U.uint8ArrayConcat(parts);
    const paddedLen = (body.length + 16) & ~15;
    const out = new Uint8Array(paddedLen);
    out.set(body);

    const img = pxt.esp.parseBuffer(out);
    const finalBuf = pxt.esp.toBuffer(img);
    const b64 = Buffer.from(finalBuf).toString("base64");
    const bootB64 = Buffer.from(new Uint8Array([0xE9, 0x01, 0x02, 0x03])).toString("base64");
    const partB64 = Buffer.from(new Uint8Array([0xAA, 0x50, 0x01, 0x02])).toString("base64");
    return { hex: [b64], bootloaderHex: [bootB64], partitionTableHex: [partB64] };
}

async function verify802154NativeVmShims() {
    const c6Target = JSON.parse(JSON.stringify(pxtarget));
    Object.assign(c6Target.compile, pxtarget.variants.esp32c6.compile);
    c6Target.bundledpkgs = c6Target.bundledpkgs || {};
    c6Target.versions = c6Target.versions || { target: "0.0.0", pxt: "0.0.0" };
    pxt.setAppTarget(c6Target);

    const fullTs = `
        thread.onRoleChanged(() => serial.writeValue("role", thread.role()));
        thread.onReceivedString((t, m) => serial.writeLine(t + m));
        thread.onReceivedValue((k, v) => serial.writeValue(k, v));
        thread.joinGroup(15, 0x1234, "Key");
        thread.joinDatasetHex("0e080000000000010000");
        thread.sendString("t", "m");
        thread.sendValue("k", 1.5);

        zigbee.onJoined(() => serial.writeLine("zb_joined"));
        zigbee.onReceivedString((m) => serial.writeLine(m));
        zigbee.onReceivedValue((k, v) => serial.writeValue(k, v));
        zigbee.onSwitchChanged((on) => serial.writeLine(on ? "1" : "0"));
        zigbee.startNetwork(ZigbeeRole.Coordinator, 15);
        zigbee.sendString("hi");
        zigbee.sendValue("v", 2.5);
        zigbee.setSwitch(true);
        zigbee.reportTemperature(22.5);
        serial.writeLine((zigbee.isJoined() && zigbee.getSwitch()) ? "ok" : "no");
    `;

    const fileSystem = createBoardFileSystem(fullTs);
    const host = {
        readFile: (pkg, fn) => {
            const p = pkg.id === "this" ? fn : `pxt_modules/${pkg.id}/${fn}`;
            return fileSystem[p] !== undefined ? fileSystem[p] : null;
        },
        writeFile: () => { },
        getHexInfoAsync: async (extInfo) => buildSyntheticEsp32C6HexInfo((extInfo.vmPointers || []).length),
        cacheStoreAsync: async () => { },
        cacheGetAsync: async () => null,
        downloadPackageAsync: async () => { },
        resolveVersionAsync: async () => "*",
    };

    const mainPkg = new pxt.MainPackage(host);
    const opts = await mainPkg.getCompileOptionsAsync({ isNative: true, hasHex: true, switches: {} });
    const fnNames = (opts.extinfo.functions || []).map(f => f.name);
    for (const expectedShim of [
        "_thread::joinGroup",
        "_thread::joinDatasetHex",
        "_thread::sendPacket",
        "_thread::readPacket",
        "_thread::role",
        "_thread::eventID",
        "_zigbee::startNetwork",
        "_zigbee::sendPacket",
        "_zigbee::readPacket",
        "_zigbee::setSwitch",
        "_zigbee::getSwitch",
        "_zigbee::reportTemperature",
        "_zigbee::isJoined",
        "_zigbee::eventID"
    ]) {
        assert.ok(fnNames.includes(expectedShim), `Missing native VM shim function ${expectedShim}`);
    }

    opts.extinfo.hexinfo = buildSyntheticEsp32C6HexInfo((opts.extinfo.vmPointers || []).length);
    const res = pxtc.compile(opts);
    assert.strictEqual(res.success, true, "802.15.4 native VM compile failed: " + JSON.stringify(res.diagnostics, null, 2));
    assert.ok(res.outfiles[pxtc.BINARY_ESP], "Expected native VM binary.bin output");
    console.log("✔ Thread & Zigbee native VM shims (6 _thread::* + 8 _zigbee::* functions) verified");
}

function createSimInstance(binaryJs, boardJson, broadcastBus) {
    const pxtsimJs = fs.readFileSync(path.resolve(makerDir, "../pxt/built/pxtsim.js"), "utf8");
    const commonSimJs = fs.readFileSync(path.join(makerDir, "built/common-sim.js"), "utf8");
    const simJs = fs.readFileSync(path.join(makerDir, "built/sim.js"), "utf8");

    const serialLines = [];
    const simErrors = [];
    const sandbox = {
        console: Object.assign({}, console, {
            error: (...args) => {
                const msg = args.map(String).join(" ");
                if (msg.includes("Simulator crashed")) simErrors.push(msg);
                console.error(...args);
            }
        }),
        setTimeout, clearTimeout, setInterval, clearInterval,
        Math, Uint8Array, Uint16Array, Uint32Array, Int32Array,
        ArrayBuffer, DataView, Map, Set, Promise, Error,
        btoa, atob, TextEncoder, TextDecoder,
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
    const rt = new pxsim.Runtime({
        type: "run",
        code: binaryJs,
        boardDefinition: Object.assign({ id: "seeed-xiao-esp32c6" }, boardJson),
        parts: [],
        partDefinitions: {},
        cdnUrl: ""
    });
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

    const inst = { pxsim, rt, serialLines, simErrors };
    broadcastBus.push(inst);

    pxsim.Runtime.postMessage = (msg) => {
        if (msg && msg.type === "serial" && msg.data) {
            serialLines.push(String(msg.data).trim());
        }
        if (msg && msg.broadcast) {
            for (const peer of broadcastBus) {
                if (peer !== inst) {
                    peer.rt.board.receiveMessage(msg);
                }
            }
        }
    };

    return inst;
}

async function testThreadMesh(boardJson) {
    const txJs = await compileSimProgram(`
        thread.joinGroup(15, 0x1234, "ClassMesh");
        pause(100);
        thread.sendString("env", "sunny");
        pause(40);
        thread.sendValue("co2", 415.5);
    `);

    const rxJs = await compileSimProgram(`
        thread.onReceivedString((topic, msg) => {
            serial.writeLine("TH_STR:" + topic + "=" + msg);
        });
        thread.onReceivedValue((k, v) => {
            serial.writeLine("TH_VAL:" + k + "=" + v);
        });
        thread.joinGroup(15, 0x1234, "ClassMesh");
        serial.writeLine("TH_ROLE:" + thread.role());
    `);

    const isoJs = await compileSimProgram(`
        thread.onReceivedString((t, m) => serial.writeLine("LEAK:" + t));
        thread.joinGroup(15, 0x1234, "OtherKey");
    `);

    const bus = [];
    const rx = createSimInstance(rxJs, boardJson, bus);
    const iso = createSimInstance(isoJs, boardJson, bus);
    const tx = createSimInstance(txJs, boardJson, bus);

    rx.rt.run(() => {});
    iso.rt.run(() => {});
    tx.rt.run(() => {});

    await new Promise((r) => setTimeout(r, 500));
    tx.rt.kill();
    rx.rt.kill();
    iso.rt.kill();

    assert.strictEqual(tx.simErrors.length, 0);
    assert.strictEqual(rx.simErrors.length, 0);
    assert.strictEqual(iso.simErrors.length, 0);

    assert.ok(rx.serialLines.includes("TH_ROLE:3"), "Expected ThreadRole.Router (3)");
    assert.ok(rx.serialLines.includes("TH_STR:env=sunny"), "Expected Thread string env=sunny");
    assert.ok(rx.serialLines.includes("TH_VAL:co2=415.5"), "Expected Thread value co2=415.5");
    assert.strictEqual(iso.serialLines.length, 0, "Mismatched Thread key must stay isolated");
    console.log("✔ Thread (OpenThread IPv6 Mesh) multi-board E2E test passed!");
}

async function testZigbeeMeshAndHA(boardJson) {
    const coordJs = await compileSimProgram(`
        zigbee.startNetwork(ZigbeeRole.Coordinator, 15);
        pause(100);
        zigbee.sendString("zb-ping");
        pause(40);
        zigbee.sendValue("batt", 98.5);
        pause(40);
        zigbee.setSwitch(true);
        zigbee.reportTemperature(23.25);
    `);

    const routerJs = await compileSimProgram(`
        zigbee.onJoined(() => {
            serial.writeLine("ZB_JOINED:" + (zigbee.isJoined() ? "1" : "0"));
        });
        zigbee.onReceivedString((m) => {
            serial.writeLine("ZB_STR:" + m);
        });
        zigbee.onReceivedValue((k, v) => {
            serial.writeLine("ZB_VAL:" + k + "=" + v);
        });
        zigbee.onSwitchChanged((on) => {
            serial.writeLine("ZB_SW:" + (on ? "1" : "0"));
        });
        zigbee.startNetwork(ZigbeeRole.Router, 15);
    `);

    const isoJs = await compileSimProgram(`
        zigbee.onReceivedString((m) => serial.writeLine("LEAK:" + m));
        zigbee.startNetwork(ZigbeeRole.EndDevice, 20);
    `);

    const bus = [];
    const router = createSimInstance(routerJs, boardJson, bus);
    const iso = createSimInstance(isoJs, boardJson, bus);
    const coord = createSimInstance(coordJs, boardJson, bus);

    router.rt.run(() => {});
    iso.rt.run(() => {});
    coord.rt.run(() => {});

    await new Promise((r) => setTimeout(r, 500));
    coord.rt.kill();
    router.rt.kill();
    iso.rt.kill();

    assert.strictEqual(coord.simErrors.length, 0);
    assert.strictEqual(router.simErrors.length, 0);
    assert.strictEqual(iso.simErrors.length, 0);

    assert.ok(router.serialLines.includes("ZB_JOINED:1"), "Expected Zigbee onJoined");
    assert.ok(router.serialLines.includes("ZB_STR:zb-ping"), "Expected Zigbee string zb-ping");
    assert.ok(router.serialLines.includes("ZB_VAL:batt=98.5"), "Expected Zigbee value batt=98.5");
    assert.ok(router.serialLines.includes("ZB_SW:1"), "Expected Zigbee HA switch ON");
    assert.strictEqual(iso.serialLines.length, 0, "Different Zigbee channel 20 must stay isolated");
    console.log("✔ Zigbee 3.0 (Mesh Intercomm & HA Clusters) multi-board E2E test passed!");
}

(async () => {
    const boardJson = JSON.parse(fs.readFileSync(path.join(makerDir, "libs/seeed-xiao-esp32c6/board.json"), "utf8"));
    await verify802154NativeVmShims();
    await testThreadMesh(boardJson);
    await testZigbeeMeshAndHA(boardJson);
    console.log("✔ ALL XIAO ESP32-C6 Phase 3 (Thread & Zigbee) Tests Passed!");
})().catch((err) => {
    console.error(err);
    process.exit(1);
});

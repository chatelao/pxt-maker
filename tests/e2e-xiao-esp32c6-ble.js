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
        name: "xiao-esp32c6-ble-sim",
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

async function verifyBleNativeVmShims() {
    const c6Target = JSON.parse(JSON.stringify(pxtarget));
    Object.assign(c6Target.compile, pxtarget.variants.esp32c6.compile);
    c6Target.bundledpkgs = c6Target.bundledpkgs || {};
    c6Target.versions = c6Target.versions || { target: "0.0.0", pxt: "0.0.0" };
    pxt.setAppTarget(c6Target);

    const fullBleTs = `
        bluetooth.setDeviceName("XIAO-BLE");
        bluetooth.onConnected(() => bluetooth.uartWriteString("hi"));
        bluetooth.onDisconnected(() => serial.writeLine("disc"));
        bluetooth.onUartDataReceived(() => {
            let s = bluetooth.uartReadString();
            serial.writeLine(s);
        });
        bluetooth.startUartService();
        bluetooth.advertiseString("beacon", 100);
        bluetooth.stopAdvertising();
        bluetooth.onAdvertisementReceived((data, rssi) => serial.writeValue("rssi", rssi));
        bluetooth.startScanning();
        bluetooth.stopScanning();
        serial.writeLine(bluetooth.isConnected() ? "1" : "0");
    `;

    const fileSystem = createBoardFileSystem(fullBleTs);
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
        "_ble::startUartService",
        "_ble::uartWriteBuffer",
        "_ble::uartReadBuffer",
        "_ble::isConnected",
        "_ble::setDeviceName",
        "_ble::advertiseData",
        "_ble::stopAdvertising",
        "_ble::startScanning",
        "_ble::stopScanning",
        "_ble::readAdvertisement",
        "_ble::eventID"
    ]) {
        assert.ok(fnNames.includes(expectedShim), `Missing native VM shim function ${expectedShim}`);
    }

    opts.extinfo.hexinfo = buildSyntheticEsp32C6HexInfo((opts.extinfo.vmPointers || []).length);
    const res = pxtc.compile(opts);
    assert.strictEqual(res.success, true, "BLE native VM compile failed: " + JSON.stringify(res.diagnostics, null, 2));
    assert.ok(res.outfiles[pxtc.BINARY_ESP], "Expected native VM binary.bin output");
    console.log("✔ BLE native VM shims (11 _ble::* functions) verified");
}

function createSimInstance(binaryJs, boardJson, broadcastBus, outboundLog) {
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
        if (msg && msg.type === "blepacket" && outboundLog) {
            outboundLog.push(msg);
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

async function testBleUartAndBeacons() {
    const boardJson = JSON.parse(fs.readFileSync(path.join(makerDir, "libs/seeed-xiao-esp32c6/board.json"), "utf8"));

    // Board A: Peripheral running NUS UART + later broadcasts BLE beacons
    const peripheralJs = await compileSimProgram(`
        bluetooth.setDeviceName("XIAO-BLE");
        bluetooth.onConnected(() => {
            serial.writeLine("EVT:CONN:" + (bluetooth.isConnected() ? "1" : "0"));
            bluetooth.uartWriteString("ble-pong");
        });
        bluetooth.onDisconnected(() => {
            serial.writeLine("EVT:DISC:" + (bluetooth.isConnected() ? "1" : "0"));
        });
        bluetooth.onUartDataReceived(() => {
            serial.writeLine("UART_RX:" + bluetooth.uartReadString());
        });
        bluetooth.startUartService();

        pause(200);
        bluetooth.advertiseString("xiao-beacon", 100);
        pause(60);
        // 30-byte buffer must be truncated to 24 bytes
        bluetooth.advertiseData(Buffer.fromUTF8("0123456789abcdefghijklmnopqrst"), 100);
        pause(200);
        bluetooth.advertiseString("after-stop-scan", 100);
        bluetooth.stopAdvertising();
    `);

    // Board B: BLE Beacon Scanner
    const scannerJs = await compileSimProgram(`
        bluetooth.onAdvertisementReceived((data, rssi) => {
            serial.writeLine("ADV:" + data.length + ":" + data.toString() + ":RSSI=" + (rssi < 0 ? "1" : "0"));
            if (data.length == 24) {
                bluetooth.stopScanning();
            }
        });
        bluetooth.startScanning();
    `);

    const bus = [];
    const outboundBle = [];
    const scanner = createSimInstance(scannerJs, boardJson, bus, null);
    const peripheral = createSimInstance(peripheralJs, boardJson, bus, outboundBle);

    scanner.rt.run(() => {});
    peripheral.rt.run(() => {});

    // Simulate a BLE Central connecting, sending UART data, and disconnecting
    await new Promise((r) => setTimeout(r, 80));
    peripheral.rt.board.receiveMessage({ type: "blepacket", kind: "connect" });
    await new Promise((r) => setTimeout(r, 50));
    peripheral.rt.board.receiveMessage({ type: "blepacket", kind: "uart", data: Buffer.from("ble-ping") });
    await new Promise((r) => setTimeout(r, 50));
    peripheral.rt.board.receiveMessage({ type: "blepacket", kind: "disconnect" });

    await new Promise((r) => setTimeout(r, 600));
    peripheral.rt.kill();
    scanner.rt.kill();

    assert.strictEqual(peripheral.simErrors.length, 0, "Peripheral crashed: " + peripheral.simErrors.join("; "));
    assert.strictEqual(scanner.simErrors.length, 0, "Scanner crashed: " + scanner.simErrors.join("; "));

    console.log("Peripheral serial:", peripheral.serialLines);
    console.log("Scanner serial:", scanner.serialLines);

    assert.ok(peripheral.serialLines.includes("EVT:CONN:1"), "Expected onConnected with isConnected() == true");
    assert.ok(peripheral.serialLines.includes("UART_RX:ble-ping"), "Expected UART RX ble-ping");
    assert.ok(peripheral.serialLines.includes("EVT:DISC:0"), "Expected onDisconnected with isConnected() == false");
    assert.ok(outboundBle.some((m) => m.kind === "uart" && Buffer.from(m.data).toString() === "ble-pong"),
        "Expected outbound NUS TX notification 'ble-pong'");

    assert.ok(scanner.serialLines.includes("ADV:11:xiao-beacon:RSSI=1"), "Expected beacon 'xiao-beacon' with negative RSSI");
    assert.ok(scanner.serialLines.includes("ADV:24:0123456789abcdefghijklmn:RSSI=1"), "Expected 24-byte truncated beacon");
    assert.ok(!scanner.serialLines.some((l) => l.includes("after-stop-scan")), "Must stop receiving after stopScanning()");

    console.log("✔ BLE 5.3 UART (NUS), Beacons, Scanner & Connect/Disconnect E2E test passed!");
}

(async () => {
    await verifyBleNativeVmShims();
    await testBleUartAndBeacons();
})().catch((err) => {
    console.error(err);
    process.exit(1);
});

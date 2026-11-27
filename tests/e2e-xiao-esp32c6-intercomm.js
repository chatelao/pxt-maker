const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

require("../../pxt/built/pxt.js");

const makerDir = path.resolve(__dirname, "..");
const commonLibsDir = path.resolve(makerDir, "../pxt-common-packages/libs");
const projDir = path.join(__dirname, "e2e-xiao-esp32c6-intercomm");
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
        name: "xiao-esp32c6-intercomm-sim",
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

// Layer 2 (C-BLK-01 & C-VM-01): Blocks project validation & native VM shim resolution
async function verifyBlocksAndNativeVmShims() {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(projDir, "pxt.json"), "utf8"));
    assert.ok(pkgJson.files.includes("main.blocks"), "pxt.json must include main.blocks");
    assert.ok(pkgJson.files.includes("main.ts"), "pxt.json must include main.ts");
    assert.ok(pkgJson.dependencies["seeed-xiao-esp32c6"], "pxt.json must depend on seeed-xiao-esp32c6");

    const blocksXml = fs.readFileSync(path.join(projDir, "main.blocks"), "utf8");
    for (const blk of [
        "radio_set_group",
        "radio_datagram_send",
        "radio_datagram_send_value",
        "radio_datagram_send_string",
        "radio_on_string_drag",
        "radioBroadcastMessage",
        "radioOnMessageReceived"
    ]) {
        assert.ok(blocksXml.includes(`type="${blk}"`), `main.blocks must contain block ${blk}`);
    }

    const blocksMainTs = fs.readFileSync(path.join(projDir, "main.ts"), "utf8");
    await compileSimProgram(blocksMainTs);

    const c6Target = JSON.parse(JSON.stringify(pxtarget));
    Object.assign(c6Target.compile, pxtarget.variants.esp32c6.compile);
    c6Target.bundledpkgs = c6Target.bundledpkgs || {};
    c6Target.versions = c6Target.versions || { target: "0.0.0", pxt: "0.0.0" };
    pxt.setAppTarget(c6Target);

    const fullShimTs = [
        blocksMainTs,
        `radio.setTransmitPower(7);`,
        `radio.setFrequencyBand(10);`,
        `radio.sendBuffer(Buffer.fromUTF8("abc"));`,
        `radio.off();`,
        `radio.on();`,
        `_wifi.setExternalAntenna(true);`,
        `let ctrl = net.instance().controller;`,
        `let s = ctrl.socket();`,
        `ctrl.socketConnect(s, "255.255.255.255", 12345, net.UDP_MODE);`,
        `ctrl.socketConnect(s, "example.com", 80, net.TCP_MODE);`,
        `ctrl.socketClose(s);`
    ].join("\n");

    const fileSystem = createBoardFileSystem(fullShimTs);
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
    const vmPtrs = opts.extinfo.vmPointers || [];
    const fnNames = (opts.extinfo.functions || []).map(f => f.name);
    for (const expectedShim of [
        "radio::off",
        "radio::on",
        "radio::raiseEvent",
        "radio::readRawPacket",
        "radio::sendRawPacket",
        "radio::onDataReceived",
        "radio::setGroup",
        "radio::setTransmitPower",
        "radio::setFrequencyBand",
        "_wifi::socketConnectUDP",
        "_wifi::socketConnectTCP",
        "_wifi::setExternalAntenna"
    ]) {
        assert.ok(fnNames.includes(expectedShim), `Missing native VM shim function ${expectedShim}`);
    }

    opts.extinfo.hexinfo = buildSyntheticEsp32C6HexInfo(vmPtrs.length);
    const res = pxtc.compile(opts);
    assert.strictEqual(res.success, true, "Native VM compile failed: " + JSON.stringify(res.diagnostics, null, 2));
    assert.ok(res.outfiles[pxtc.BINARY_ESP], "Expected native VM binary.bin output");
    console.log(`✔ C-BLK-01 & C-VM-01: Blocks project & native VM shims (${fnNames.length} functions, ${vmPtrs.length} vmPointers) verified`);
}

function createSimInstance(binaryJs, boardJson, broadcastBus) {
    const pxtsimJs = fs.readFileSync(path.resolve(makerDir, "../pxt/built/pxtsim.js"), "utf8");
    const commonSimJs = fs.readFileSync(path.join(makerDir, "built/common-sim.js"), "utf8");
    const simJs = fs.readFileSync(path.join(makerDir, "built/sim.js"), "utf8");

    const serialLines = [];
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
    const simErrors = [];
    const origError = console.error;
    sandbox.console = Object.assign({}, console, {
        error: (...args) => {
            const msg = args.map(String).join(" ");
            if (msg.includes("Simulator crashed")) simErrors.push(msg);
            origError.apply(console, args);
        }
    });
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

// Scenario 1: Basic Radio + Broadcast + Wi-Fi 6 AX + UDP + off/on + Group Isolation
async function testBasicRadioAndUdp(boardJson) {
    const senderJs = await compileSimProgram(`
        radio.setGroup(42);
        radio.setTransmitPower(7);
        radio.setFrequencyBand(10);
        pause(100);
        radio.sendNumber(42);
        pause(40);
        radio.sendNumber(3.5);
        pause(40);
        radio.sendValue("temp", 25.5);
        pause(40);
        radio.sendString("hello-c6");
        pause(40);
        radio.sendBuffer(Buffer.fromUTF8("raw123"));
        pause(40);
        radio.sendMessage(1);
        pause(120);

        let ctrl = net.instance().controller;
        ctrl.connectAP("TestAP", "pass");
        let aps = ctrl.scanNetworks();
        let hasAx = aps.length > 0 && ((aps[0].flags & net.WifiAPFlags.IEEE_802_11AX) != 0);
        serial.writeLine("AX:" + (hasAx ? "1" : "0"));
        let udp = ctrl.socket();
        ctrl.socketConnect(udp, Buffer.fromArray([255, 255, 255, 255]), 12345, net.UDP_MODE);
        ctrl.socketWrite(udp, Buffer.fromUTF8("udp-ping"));
        pause(40);
        ctrl.socketClose(udp);

        pause(100);
        radio.sendString("go-off");
        pause(100);
        radio.sendString("during-off");
        pause(350);
        radio.sendString("after-on");
    `);

    const receiverJs = await compileSimProgram(`
        radio.setGroup(42);
        radio.onReceivedNumber((n) => {
            let rssi = radio.receivedPacket(RadioPacketProperty.SignalStrength);
            serial.writeLine("NUM:" + n + ":RSSI:" + (rssi < 0 ? "1" : "0"));
        });
        radio.onReceivedValue((k, v) => {
            serial.writeLine("VAL:" + k + "=" + v);
        });
        radio.onReceivedString((s) => {
            if (s == "go-off") {
                control.runInBackground(() => {
                    radio.off();
                    pause(300);
                    radio.on();
                });
            } else {
                serial.writeLine("STR:" + s);
            }
        });
        radio.onReceivedBuffer((b) => {
            serial.writeLine("BUF:" + b.toString());
        });
        radio.onReceivedMessage(1, () => {
            serial.writeLine("MSG:message1");
        });

        let ctrl = net.instance().controller;
        ctrl.connectAP("TestAP", "pass");
        let udp = ctrl.socket();
        ctrl.socketConnect(udp, "0.0.0.0", 12345, net.UDP_MODE);
        pauseUntil(() => ctrl.socketAvailable(udp) > 0, 1200);
        let avail = ctrl.socketAvailable(udp);
        if (avail > 0) {
            let pkt = ctrl.socketRead(udp, avail);
            serial.writeLine("UDP:" + pkt.toString());
        }
        ctrl.socketClose(udp);
    `);

    const isolatedJs = await compileSimProgram(`
        radio.setGroup(99);
        radio.onReceivedNumber((n) => serial.writeLine("LEAK_NUM:" + n));
        radio.onReceivedValue((k, v) => serial.writeLine("LEAK_VAL:" + k));
        radio.onReceivedString((s) => serial.writeLine("LEAK_STR:" + s));
    `);

    const bus = [];
    const boardB = createSimInstance(receiverJs, boardJson, bus);
    const boardC = createSimInstance(isolatedJs, boardJson, bus);
    const boardA = createSimInstance(senderJs, boardJson, bus);

    boardB.rt.run(() => {});
    boardC.rt.run(() => {});
    boardA.rt.run(() => {});

    await new Promise((r) => setTimeout(r, 1500));

    boardA.rt.kill();
    boardB.rt.kill();
    boardC.rt.kill();

    assert.strictEqual(boardA.simErrors.length, 0, "Board A crashed: " + boardA.simErrors.join("; "));
    assert.strictEqual(boardB.simErrors.length, 0, "Board B crashed: " + boardB.simErrors.join("; "));
    assert.strictEqual(boardC.simErrors.length, 0, "Board C crashed: " + boardC.simErrors.join("; "));

    assert.ok(boardA.serialLines.includes("AX:1"), "Expected IEEE_802_11AX scan flag");
    assert.ok(boardB.serialLines.includes("NUM:42:RSSI:1"));
    assert.ok(boardB.serialLines.includes("NUM:3.5:RSSI:1"));
    assert.ok(boardB.serialLines.includes("VAL:temp=25.5"));
    assert.ok(boardB.serialLines.includes("STR:hello-c6"));
    assert.ok(boardB.serialLines.includes("BUF:raw123"));
    assert.ok(boardB.serialLines.includes("MSG:message1"));
    assert.ok(boardB.serialLines.includes("UDP:udp-ping"));
    assert.ok(!boardB.serialLines.includes("STR:during-off"), "Must drop packets while radio.off()");
    assert.ok(boardB.serialLines.includes("STR:after-on"), "Must resume after radio.on()");
    assert.strictEqual(boardC.serialLines.length, 0, "Group 99 must stay isolated");

    console.log("✔ Scenario 1: Basic Radio (ESP-NOW API), Broadcast, Wi-Fi 6 AX, UDP, & off/on passed");
}

// Scenario 2 (S-RAD-01, S-RAD-02, S-RAD-03, S-RAD-04): Edge cases, truncation, serial, dynamic groups
async function testRadioEdgeCasesAndGroups(boardJson) {
    const senderJs = await compileSimProgram(`
        radio.setGroup(1);
        pause(100);

        // S-RAD-01: integer boundaries, floats, empty string, 19-char, >19-char, UTF-8, buffers
        radio.sendNumber(0);
        pause(30);
        radio.sendNumber(-2147483648);
        pause(30);
        radio.sendNumber(2147483647);
        pause(30);
        radio.sendNumber(-0.125);
        pause(30);
        radio.sendString("");
        pause(30);
        radio.sendString("1234567890123456789");
        pause(30);
        radio.sendString("123456789012345678901234567890");
        pause(30);
        radio.sendString("héllo🚀");
        pause(30);
        radio.sendBuffer(Buffer.fromUTF8("0123456789abcdefghi"));
        pause(30);
        radio.sendBuffer(Buffer.fromUTF8("0123456789abcdefghijklmno"));
        pause(30);

        // S-RAD-02: key truncation to 8 bytes
        radio.sendValue("longkeyname123", 99.5);
        pause(30);

        // S-RAD-03: serial number toggling
        radio.setTransmitSerialNumber(false);
        radio.sendNumber(7001);
        pause(30);
        radio.setTransmitSerialNumber(true);
        radio.sendNumber(7002);
        pause(60);

        // S-RAD-04: dynamic group switching test (receiver switches 1 -> 2 -> 1)
        radio.sendString("switch-to-2");
        pause(100);
        radio.sendString("missed-on-1");
        pause(40);
        radio.setGroup(2);
        radio.sendString("got-on-2");
        pause(100);
        radio.setGroup(1);
        radio.sendString("got-back-on-1");
    `);

    const receiverJs = await compileSimProgram(`
        radio.setGroup(1);
        radio.onReceivedNumber((n) => {
            let sn = radio.receivedPacket(RadioPacketProperty.SerialNumber);
            let t = radio.receivedPacket(RadioPacketProperty.Time);
            serial.writeLine("N:" + n + ":SN=" + (sn != 0 ? "1" : "0") + ":T=" + (t >= 0 ? "1" : "0"));
        });
        radio.onReceivedValue((k, v) => {
            serial.writeLine("V:" + k + "=" + v);
        });
        radio.onReceivedString((s) => {
            if (s == "switch-to-2") {
                radio.setGroup(2);
                control.runInBackground(() => {
                    pause(180);
                    radio.setGroup(1);
                });
            } else {
                serial.writeLine("S:" + s);
            }
        });
        radio.onReceivedBuffer((b) => {
            serial.writeLine("B:" + b.length + ":" + b.toString());
        });
    `);

    const bus = [];
    const rx = createSimInstance(receiverJs, boardJson, bus);
    const tx = createSimInstance(senderJs, boardJson, bus);

    rx.rt.run(() => {});
    tx.rt.run(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    tx.rt.kill();
    rx.rt.kill();

    assert.strictEqual(tx.simErrors.length, 0, "TX crashed: " + tx.simErrors.join("; "));
    assert.strictEqual(rx.simErrors.length, 0, "RX crashed: " + rx.simErrors.join("; "));

    assert.ok(rx.serialLines.some((l) => l.startsWith("N:0:")), "Must receive 0");
    assert.ok(rx.serialLines.some((l) => l.startsWith("N:-2147483648:")), "Must receive INT32_MIN");
    assert.ok(rx.serialLines.some((l) => l.startsWith("N:2147483647:")), "Must receive INT32_MAX");
    assert.ok(rx.serialLines.some((l) => l.startsWith("N:-0.125:")), "Must receive float -0.125");
    assert.ok(rx.serialLines.includes("S:"), "Must receive empty string");
    assert.ok(rx.serialLines.includes("S:1234567890123456789"), "Must receive 19-char string");
    assert.ok(rx.serialLines.includes("S:1234567890123456789"), "30-char string must truncate to 19 bytes");
    assert.ok(rx.serialLines.includes("S:héllo🚀"), "Multi-byte UTF-8 string must survive intact");
    assert.ok(rx.serialLines.includes("B:19:0123456789abcdefghi"), "19-byte buffer intact");
    assert.ok(rx.serialLines.filter((l) => l === "B:19:0123456789abcdefghi").length === 2,
        "25-byte buffer must truncate to 19 bytes");
    assert.ok(rx.serialLines.includes("V:longkeyn=99.5"), "Key must truncate to 8 chars");
    assert.ok(rx.serialLines.includes("N:7001:SN=0:T=1"), "Serial number must be 0 when disabled");
    assert.ok(rx.serialLines.includes("N:7002:SN=1:T=1"), "Serial number must be non-zero when enabled");
    assert.ok(!rx.serialLines.includes("S:missed-on-1"), "Must ignore group 1 while tuned to group 2");
    assert.ok(rx.serialLines.includes("S:got-on-2"), "Must receive on group 2");
    assert.ok(rx.serialLines.includes("S:got-back-on-1"), "Must receive again after switching back to group 1");

    console.log("✔ Scenario 2 (S-RAD-01..04): Edge payloads, UTF-8/key truncation, serial numbers, dynamic groups passed");
}

// Scenario 3 (S-RAD-05 & S-RAD-06): 20-round ping-pong + 1-to-3 fan-out
async function testPingPongAndFanOut(boardJson) {
    const initiatorJs = await compileSimProgram(`
        radio.setGroup(55);
        let ack = -1;
        radio.onReceivedString((s) => {
            if (s.substr(0, 5) == "PONG:") {
                ack = parseInt(s.substr(5));
                serial.writeLine(s);
            }
        });
        pause(100);
        for (let i = 0; i < 20; i++) {
            radio.sendString("PING:" + i);
            pauseUntil(() => ack == i, 500);
            pause(10);
        }
    `);

    const responderJs = await compileSimProgram(`
        radio.setGroup(55);
        radio.onReceivedString((s) => {
            if (s.substr(0, 5) == "PING:") {
                let id = s.substr(5);
                serial.writeLine(s);
                radio.sendString("PONG:" + id);
            }
        });
    `);

    const observerJs = await compileSimProgram(`
        radio.setGroup(55);
        let count = 0;
        radio.onReceivedString((s) => {
            if (s.substr(0, 5) == "PING:") {
                count++;
                if (count == 20) serial.writeLine("OBS:20");
            }
        });
    `);

    const isolatedJs = await compileSimProgram(`
        radio.setGroup(56);
        radio.onReceivedString((s) => serial.writeLine("LEAK:" + s));
    `);

    const bus = [];
    const resp = createSimInstance(responderJs, boardJson, bus);
    const obs1 = createSimInstance(observerJs, boardJson, bus);
    const obs2 = createSimInstance(observerJs, boardJson, bus);
    const iso = createSimInstance(isolatedJs, boardJson, bus);
    const init = createSimInstance(initiatorJs, boardJson, bus);

    resp.rt.run(() => {});
    obs1.rt.run(() => {});
    obs2.rt.run(() => {});
    iso.rt.run(() => {});
    init.rt.run(() => {});

    const start = Date.now();
    while (Date.now() - start < 3000) {
        if (init.serialLines.includes("PONG:19") &&
            obs1.serialLines.includes("OBS:20") &&
            obs2.serialLines.includes("OBS:20")) {
            break;
        }
        await new Promise((r) => setTimeout(r, 50));
    }
    init.rt.kill();
    resp.rt.kill();
    obs1.rt.kill();
    obs2.rt.kill();
    iso.rt.kill();

    for (const [name, b] of [["init", init], ["resp", resp], ["obs1", obs1], ["obs2", obs2], ["iso", iso]]) {
        assert.strictEqual(b.simErrors.length, 0, `${name} crashed: ` + b.simErrors.join("; "));
    }
    for (let i = 0; i < 20; i++) {
        assert.ok(init.serialLines.includes(`PONG:${i}`), `Missing PONG:${i}`);
        assert.ok(resp.serialLines.includes(`PING:${i}`), `Missing PING:${i}`);
    }
    assert.ok(obs1.serialLines.includes("OBS:20"), "Observer 1 must receive all 20 fan-out pings");
    assert.ok(obs2.serialLines.includes("OBS:20"), "Observer 2 must receive all 20 fan-out pings");
    assert.strictEqual(iso.serialLines.length, 0, "Group 56 must stay isolated");

    console.log("✔ Scenario 3 (S-RAD-05..06): 20-round bidirectional ping-pong & 1-to-3 multi-peer fan-out passed");
}

// Scenario 4 (S-UDP-01, S-UDP-02, S-UDP-03, S-WIF-01): UDP port isolation, IPv4 Buffer validation, 30x socket reuse, ControllerSocket.onMessage
async function testUdpEdgeCasesAndControllerSocket(boardJson) {
    const senderJs = await compileSimProgram(`
        let ctrl = net.instance().controller;
        ctrl.connectAP("TestAP", "pass");

        // S-UDP-02: Invalid 2-byte Buffer must throw "connection by IP not supported"
        let threw = false;
        let badSock = ctrl.socket();
        try {
            ctrl.socketConnect(badSock, Buffer.fromArray([192, 168]), 12345, net.UDP_MODE);
        } catch (e) {
            threw = true;
        }
        ctrl.socketClose(badSock);
        serial.writeLine("BAD_IP_THREW:" + (threw ? "1" : "0"));

        // S-UDP-03: Open, write, and close 30 UDP sockets sequentially (> MAX_SOCKET = 16)
        let reuseOk = true;
        for (let i = 0; i < 30; i++) {
            let fd = ctrl.socket();
            if (fd <= 0) {
                reuseOk = false;
                break;
            }
            ctrl.socketClose(fd);
        }
        serial.writeLine("REUSE_30:" + (reuseOk ? "1" : "0"));

        // S-WIF-01 + S-UDP-01: Send UDP datagram via ControllerSocket on port 22334
        pause(100);
        let cs = new net.ControllerSocket(ctrl, Buffer.fromArray([192, 168, 1, 255]), 22334, net.UDP_MODE);
        cs.connect();
        cs.send("cs-udp-msg");
        pause(50);
        cs.close();
    `);

    const receiverSamePortJs = await compileSimProgram(`
        let ctrl = net.instance().controller;
        ctrl.connectAP("TestAP", "pass");
        let cs = new net.ControllerSocket(ctrl, "0.0.0.0", 22334, net.UDP_MODE);
        cs.onMessage((buf) => {
            serial.writeLine("CS_RX:" + buf.toString());
        });
        cs.connect();
        pause(600);
        cs.close();
    `);

    const receiverOtherPortJs = await compileSimProgram(`
        let ctrl = net.instance().controller;
        ctrl.connectAP("TestAP", "pass");
        let udp = ctrl.socket();
        ctrl.socketConnect(udp, "0.0.0.0", 54321, net.UDP_MODE);
        pause(500);
        serial.writeLine("OTHER_AVAIL:" + ctrl.socketAvailable(udp));
        ctrl.socketClose(udp);
    `);

    const bus = [];
    const rxSame = createSimInstance(receiverSamePortJs, boardJson, bus);
    const rxOther = createSimInstance(receiverOtherPortJs, boardJson, bus);
    const tx = createSimInstance(senderJs, boardJson, bus);

    rxSame.rt.run(() => {});
    rxOther.rt.run(() => {});
    tx.rt.run(() => {});

    await new Promise((r) => setTimeout(r, 1000));
    tx.rt.kill();
    rxSame.rt.kill();
    rxOther.rt.kill();

    assert.strictEqual(tx.simErrors.length, 0, "TX crashed: " + tx.simErrors.join("; "));
    assert.strictEqual(rxSame.simErrors.length, 0, "RX same crashed: " + rxSame.simErrors.join("; "));
    assert.strictEqual(rxOther.simErrors.length, 0, "RX other crashed: " + rxOther.simErrors.join("; "));

    assert.ok(tx.serialLines.includes("BAD_IP_THREW:1"), "2-byte IPv4 Buffer must throw");
    assert.ok(tx.serialLines.includes("REUSE_30:1"), "30 sequential socketAlloc/socketClose cycles must succeed");
    assert.ok(rxSame.serialLines.includes("CS_RX:cs-udp-msg"), "ControllerSocket.onMessage must receive UDP payload");
    assert.ok(rxOther.serialLines.includes("OTHER_AVAIL:0"), "Different UDP port 54321 must not receive port 22334 data");

    console.log("✔ Scenario 4 (S-UDP-01..03 & S-WIF-01): Port isolation, IPv4 validation, 30x socket reuse, ControllerSocket passed");
}

(async () => {
    const boardJson = JSON.parse(fs.readFileSync(path.join(makerDir, "libs/seeed-xiao-esp32c6/board.json"), "utf8"));
    await verifyBlocksAndNativeVmShims();
    await testBasicRadioAndUdp(boardJson);
    await testRadioEdgeCasesAndGroups(boardJson);
    await testPingPongAndFanOut(boardJson);
    await testUdpEdgeCasesAndControllerSocket(boardJson);
    console.log("✔ ALL XIAO ESP32-C6 Phase 1 Compiler, Blocks, Native VM & Multi-Board E2E Tests Passed!");
})().catch((err) => {
    console.error(err);
    process.exit(1);
});

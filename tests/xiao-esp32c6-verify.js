const fs = require("fs");
const path = require("path");
const assert = require("assert");

require("../../pxt/built/pxt.js");

const makerDir = path.resolve(__dirname, "..");
const commonLibsDir = path.resolve(makerDir, "../pxt-common-packages/libs");
const pxtarget = JSON.parse(fs.readFileSync(path.join(makerDir, "pxtarget.json"), "utf8"));

function verifyTargetConfig() {
    assert.ok(pxtarget.bundleddirs.includes("libs/core---esp32c6"), "missing libs/core---esp32c6 in bundleddirs");
    assert.ok(pxtarget.bundleddirs.includes("libs/serial---esp32"), "missing libs/serial---esp32 in bundleddirs");
    assert.ok(pxtarget.bundleddirs.includes("libs/seeed-xiao-esp32c6"), "missing libs/seeed-xiao-esp32c6 in bundleddirs");

    const v = pxtarget.variants.esp32c6;
    assert.ok(v, "missing variants.esp32c6");
    assert.strictEqual(v.compile.useESP, true);
    assert.strictEqual(v.compile.useUF2, false);
    assert.strictEqual(v.compile.webUSB, false);
    assert.strictEqual(v.compile.webSerial, true);
    assert.strictEqual(v.compile.espChip, "esp32c6");
    assert.strictEqual(v.compile.espBootloaderOffset, 0);
    assert.strictEqual(v.compile.espFlashAppOffset, 65536);
    assert.strictEqual(v.compileService.buildEngine, "dockerespidf");
    console.log("✔ pxtarget.json esp32c6 variant & bundleddirs verified");
}

function verifyBoardFiles() {
    const boardDir = path.join(makerDir, "libs/seeed-xiao-esp32c6");
    const boardJson = JSON.parse(fs.readFileSync(path.join(boardDir, "board.json"), "utf8"));
    assert.strictEqual(boardJson.visual.pinBlocks.length, 14, "expected 14 XIAO edge pins");
    assert.strictEqual(boardJson.i2cPins.SDA, "D4");
    assert.strictEqual(boardJson.i2cPins.SCL, "D5");
    assert.ok(boardJson.onboardComponents.includes("buttons"));
    console.log("✔ seeed-xiao-esp32c6/board.json verified");
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

async function verifySamplesCompile() {
    pxtarget.bundledpkgs = pxtarget.bundledpkgs || {};
    pxtarget.versions = pxtarget.versions || { target: "0.0.0", pxt: "0.0.0" };
    pxt.setAppTarget(pxtarget);

    const boardDir = path.join(makerDir, "libs/seeed-xiao-esp32c6");
    const sampleTest = fs.readFileSync(path.join(boardDir, "test.ts"), "utf8");
    const coreTest = fs.readFileSync(path.join(commonLibsDir, "core---esp32c6/test.ts"), "utf8");
    const serialTest = fs.readFileSync(path.join(commonLibsDir, "serial---esp32/test.ts"), "utf8");
    const wifiTest = fs.readFileSync(path.join(commonLibsDir, "wifi---esp32/test.ts"), "utf8");

    const fileSystem = loadPackageFiles(boardDir, "pxt_modules/seeed-xiao-esp32c6/");
    loadPackageFiles(path.join(commonLibsDir, "base"), "pxt_modules/base/", new Set(), fileSystem);
    const baseBuiltDir = path.join(makerDir, "libs/base/built");
    fileSystem["pxt_modules/base/pxt-core.d.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-core.d.ts"), "utf8");
    fileSystem["pxt_modules/base/pxt-helpers.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-helpers.ts"), "utf8");

    fileSystem["pxt.json"] = JSON.stringify({
        name: "xiao-esp32c6-samples",
        dependencies: {
            "seeed-xiao-esp32c6": "file:pxt_modules/seeed-xiao-esp32c6"
        },
        files: ["main.ts"]
    });
    fileSystem["main.ts"] = [sampleTest, coreTest, serialTest, wifiTest].join("\n\n");

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
    const targetOpts = { isNative: false, hasHex: false, switches: {} };
    const opts = await mainPkg.getCompileOptionsAsync(targetOpts);
    const res = pxtc.compile(opts);
    if (!res.success) {
        console.error("Diagnostics:", JSON.stringify(res.diagnostics, null, 2));
    }
    assert.strictEqual(res.success, true, "expected all XIAO ESP32-C6 samples to compile without errors");
    assert.ok(res.outfiles[pxtc.BINARY_JS], "expected binary.js simulator output");
    console.log("✔ All XIAO ESP32-C6 samples (LED, GPIO, Button, ADC, PWM/Servo, Serial/UART, I2C, SPI, Wi-Fi, MQTT) compiled cleanly (JS simulator)!");
}

function buildSyntheticEsp32C6HexInfo(numVmPtrs) {
    const header = new Uint8Array(24);
    header[0] = 0xE9;
    header[1] = 2;
    pxt.HF2.write32(header, 4, 0x40800000);
    pxt.HF2.write16(header, 12, 13); // esp32-c6

    const iromData = new Uint8Array(64);
    pxt.HF2.write32(iromData, 0, 0x00000013);
    const dromSize = Math.max(128, (0x34 + numVmPtrs * 4 + 15) & ~15);
    const dromData = new Uint8Array(dromSize);
    pxt.HF2.write32(dromData, 0, 0xABCD5432); // esp_app_desc_t magic
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
    return {
        hex: [b64],
        bootloaderHex: [bootB64],
        partitionTableHex: [partB64]
    };
}

async function verifyNativeVmCompile() {
    const c6Target = JSON.parse(JSON.stringify(pxtarget));
    Object.assign(c6Target.compile, pxtarget.variants.esp32c6.compile);
    c6Target.bundledpkgs = c6Target.bundledpkgs || {};
    c6Target.versions = c6Target.versions || { target: "0.0.0", pxt: "0.0.0" };
    pxt.setAppTarget(c6Target);

    const boardDir = path.join(makerDir, "libs/seeed-xiao-esp32c6");
    const sampleTest = fs.readFileSync(path.join(boardDir, "test.ts"), "utf8");
    const fileSystem = loadPackageFiles(boardDir, "pxt_modules/seeed-xiao-esp32c6/");
    loadPackageFiles(path.join(commonLibsDir, "base"), "pxt_modules/base/", new Set(), fileSystem);
    const baseBuiltDir = path.join(makerDir, "libs/base/built");
    fileSystem["pxt_modules/base/pxt-core.d.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-core.d.ts"), "utf8");
    fileSystem["pxt_modules/base/pxt-helpers.ts"] = fs.readFileSync(path.join(baseBuiltDir, "pxt-helpers.ts"), "utf8");
    fileSystem["pxt.json"] = JSON.stringify({
        name: "xiao-esp32c6-native-vm",
        dependencies: { "seeed-xiao-esp32c6": "file:pxt_modules/seeed-xiao-esp32c6" },
        files: ["main.ts"]
    });
    fileSystem["main.ts"] = "let a = 40 + 2;\nlet msg = \"XIAO ESP32-C6\";\n";

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
    const targetOpts = { isNative: true, hasHex: true, switches: {} };
    const opts = await mainPkg.getCompileOptionsAsync(targetOpts);
    opts.extinfo.hexinfo = buildSyntheticEsp32C6HexInfo((opts.extinfo.vmPointers || []).length);
    const res = pxtc.compile(opts);
    if (!res.success) {
        console.error("Native VM Diagnostics:", JSON.stringify(res.diagnostics, null, 2));
    }
    assert.strictEqual(res.success, true, "expected XIAO ESP32-C6 native VM compile to succeed");
    assert.ok(res.outfiles[pxtc.BINARY_ESP], "expected binary.bin output");
    assert.ok(res.outfiles["bootloader.bin"], "expected bootloader.bin output");
    assert.ok(res.outfiles["partition-table.bin"], "expected partition-table.bin output");
    console.log("✔ XIAO ESP32-C6 native VM compile produced binary.bin, bootloader.bin, and partition-table.bin!");
}

(async () => {
    verifyTargetConfig();
    verifyBoardFiles();
    await verifySamplesCompile();
    await verifyNativeVmCompile();
})().catch(err => {
    console.error(err);
    process.exit(1);
});

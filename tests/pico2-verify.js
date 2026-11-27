const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const { execFileSync } = require("child_process");

require("../../pxt/built/pxt.js");

const makerDir = path.resolve(__dirname, "..");
const commonLibsDir = path.resolve(makerDir, "../pxt-common-packages/libs");
const pxtarget = JSON.parse(fs.readFileSync(path.join(makerDir, "pxtarget.json"), "utf8"));

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
    console.log("✔ pxtarget.json rp2350 variant & bundleddirs verified");
}

function verifyBoardFiles() {
    for (const boardId of ["rpi-pico2", "rpi-pico2-w"]) {
        const boardDir = path.join(makerDir, "libs", boardId);
        const pxtJson = JSON.parse(fs.readFileSync(path.join(boardDir, "pxt.json"), "utf8"));
        assert.strictEqual(pxtJson.compileServiceVariant, "rp2350");
        assert.strictEqual(pxtJson.dependencies["core---rp2350"], "file:../core---rp2350");

        const boardJson = JSON.parse(fs.readFileSync(path.join(boardDir, "board.json"), "utf8"));
        assert.strictEqual(boardJson.driveDisplayName, "RP2350");
        assert.strictEqual(boardJson.i2cPins.SDA, "P4");
        assert.strictEqual(boardJson.i2cPins.SCL, "P5");
        assert.strictEqual(boardJson.spiPins.MOSI, "P19");
        assert.strictEqual(boardJson.spiPins.MISO, "P16");
        assert.strictEqual(boardJson.spiPins.SCK, "P18");
        assert.ok(fs.existsSync(path.join(boardDir, "board.svg")), `${boardId}/board.svg must exist`);
    }
    console.log("✔ rpi-pico2 & rpi-pico2-w board.json and board.svg verified");
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

async function verifyBoardCompileAndUf2(boardId) {
    const pxtBin = path.resolve(makerDir, "../pxt/built/pxt.js");
    const boardDir = path.join(makerDir, "libs", boardId);

    execFileSync(
        process.execPath,
        [pxtBin, "build", "--localbuild", "--hwvariant", "rp2350"],
        {
            cwd: boardDir,
            env: Object.assign({}, process.env, { PXT_FORCE_LOCAL: "1", PXT_NODOCKER: "force" }),
            stdio: "inherit"
        }
    );

    const uf2Path = path.join(boardDir, "built", "binary.uf2");
    assert.ok(fs.existsSync(uf2Path), `expected ${uf2Path} to exist`);
    const buf = fs.readFileSync(uf2Path);
    assert.ok(buf.length > 100 * 1024 && buf.length % 512 === 0, "UF2 size must be non-empty multiple of 512");

    // Verify UF2 Header & RP2350 Family ID (0xe48bff59)
    const magic0 = buf.readUInt32LE(0);
    const magic1 = buf.readUInt32LE(4);
    const flags = buf.readUInt32LE(8);
    const targetAddr = buf.readUInt32LE(12);
    const payloadSize = buf.readUInt32LE(16);
    const familyId = buf.readUInt32LE(28);
    const magicEnd = buf.readUInt32LE(508);

    assert.strictEqual(magic0, 0x0a324655, "UF2 magic0");
    assert.strictEqual(magic1, 0x9e5d5157, "UF2 magic1");
    assert.strictEqual(flags & 0x2000, 0x2000, "UF2 familyID present flag");
    assert.strictEqual(targetAddr, 0x10000000, "RP2350 XIP flash start address 0x10000000");
    assert.strictEqual(payloadSize, 256, "UF2 256-byte flash payload");
    assert.strictEqual(familyId, 0xe48bff59, "RP2350_ARM_S UF2 family ID 0xe48bff59");
    assert.strictEqual(magicEnd, 0x0ab16f30, "UF2 magicEnd");

    // Verify PICOBIN_BLOCK_MARKER_START (0xffffded3) within the first 4KB of flash
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
    assert.ok(foundPicobin, "RP2350 UF2 must contain PICOBIN_BLOCK_MARKER_START (0xffffded3) in first 4KB");

    console.log(`✔ ${boardId}: Native ARM Cortex-M33 UF2 compiled & verified (${buf.length} bytes, familyId=0xe48bff59, PICOBIN valid)`);
}

(async () => {
    verifyTargetConfig();
    verifyBoardFiles();
    await verifyBoardCompileAndUf2("rpi-pico2");
    await verifyBoardCompileAndUf2("rpi-pico2-w");
})().catch(err => {
    console.error(err);
    process.exit(1);
});

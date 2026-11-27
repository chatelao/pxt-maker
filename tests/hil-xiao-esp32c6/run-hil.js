#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const PXT_CLI = path.resolve(ROOT, "../pxt/built/pxt.js");
const PROJECTS_DIR = path.join(__dirname, "projects");

const SUITES = {
    espnow: {
        boards: [
            { role: "tx", project: "espnow-tx", expect: ["HIL_READY:espnow-tx"] },
            { role: "rx", project: "espnow-rx", expect: ["HIL_PASS:H-NOW-01"] }
        ]
    },
    "wifi-udp": {
        boards: [
            { role: "node", project: "wifi-udp-coex", expect: ["HIL_PASS:H-ANT-01", "HIL_PASS:H-WIF-01", "HIL_PASS:H-COEX-01"] }
        ]
    },
    ble: {
        boards: [
            { role: "tx", project: "ble-beacon-tx", expect: ["HIL_READY:ble-beacon-tx"] },
            { role: "rx", project: "ble-beacon-rx", expect: ["HIL_PASS:H-BLE-01"] }
        ]
    },
    thread: {
        boards: [
            { role: "a", project: "thread-node-a", expect: ["HIL_PASS:H-THR-01"] },
            { role: "b", project: "thread-node-b", expect: ["HIL_PASS:H-THR-02"] }
        ]
    },
    zigbee: {
        boards: [
            { role: "coord", project: "zigbee-coord", expect: ["HIL_PASS:H-ZB-01"] },
            { role: "router", project: "zigbee-router", expect: ["HIL_PASS:H-ZB-02"] }
        ]
    }
};

function parseArgs(argv) {
    const opts = {
        dryRun: false,
        native: false,
        skipFlash: false,
        suite: "all",
        ports: [],
        timeoutMs: 30000
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--dry-run") opts.dryRun = true;
        else if (arg === "--native") opts.native = true;
        else if (arg === "--skip-flash") opts.skipFlash = true;
        else if (arg === "--suite" && argv[i + 1]) opts.suite = argv[++i];
        else if (arg === "--ports" && argv[i + 1]) opts.ports = argv[++i].split(",").map(s => s.trim()).filter(Boolean);
        else if (arg === "--timeout" && argv[i + 1]) opts.timeoutMs = parseInt(argv[++i], 10) || 30000;
    }
    return opts;
}

function discoverSerialPorts() {
    if (!fs.existsSync("/dev")) return [];
    return fs.readdirSync("/dev")
        .filter(name => /^tty(ACM|USB)\d+$/.test(name))
        .sort()
        .map(name => `/dev/${name}`);
}

function resolvePxtCli() {
    if (fs.existsSync(PXT_CLI)) return PXT_CLI;
    const bin = path.join(ROOT, "node_modules/.bin/pxt");
    if (fs.existsSync(bin)) return bin;
    throw new Error("Could not locate pxt CLI. Run npm run build in ../pxt first.");
}

function loadPkgFiles(pkgDir, prefix, visited = new Set(), out = {}) {
    const abs = path.resolve(pkgDir);
    if (visited.has(abs)) return out;
    visited.add(abs);
    const cfgPath = path.join(abs, "pxt.json");
    if (!fs.existsSync(cfgPath)) return out;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    const dirsToSearch = [abs];
    let curCfg = cfg, curDir = abs;
    while (curCfg.additionalFilePath) {
        const addDir = path.resolve(curDir, curCfg.additionalFilePath);
        dirsToSearch.push(addDir);
        const addCfgPath = path.join(addDir, "pxt.json");
        if (fs.existsSync(addCfgPath)) {
            curCfg = JSON.parse(fs.readFileSync(addCfgPath, "utf8"));
            curDir = addDir;
            if (!cfg.dependencies && curCfg.dependencies) cfg.dependencies = curCfg.dependencies;
            if (!cfg.files && curCfg.files) cfg.files = curCfg.files;
        } else break;
    }
    const readFromDirs = fn => {
        for (const d of dirsToSearch) {
            const fp = path.join(d, fn);
            if (fs.existsSync(fp)) return fs.readFileSync(fp, "utf8");
        }
        return null;
    };
    if (!cfg.dependencies) cfg.dependencies = {};
    if (!cfg.files) cfg.files = [];
    out[prefix + "pxt.json"] = JSON.stringify(cfg);
    for (const fn of cfg.files) {
        const content = readFromDirs(fn);
        if (content !== null) out[prefix + fn] = content;
    }
    const commonLibs = path.resolve(ROOT, "../pxt-common-packages/libs");
    for (const [dep, ver] of Object.entries(cfg.dependencies || {})) {
        let depDir = null;
        if (typeof ver === "string" && ver.startsWith("file:")) {
            depDir = path.resolve(abs, ver.slice(5));
        } else {
            for (const base of [path.join(ROOT, "libs"), commonLibs]) {
                const candidate = path.join(base, dep);
                if (fs.existsSync(path.join(candidate, "pxt.json"))) {
                    depDir = candidate;
                    break;
                }
            }
        }
        if (depDir) loadPkgFiles(depDir, `pxt_modules/${dep}/`, visited, out);
    }
    return out;
}

async function compileDryRun(projectName) {
    require(PXT_CLI);
    const pxtarget = JSON.parse(fs.readFileSync(path.join(ROOT, "pxtarget.json"), "utf8"));
    if (!pxtarget.bundledpkgs) pxtarget.bundledpkgs = {};
    pxt.setAppTarget(pxtarget);
    const projDir = path.join(PROJECTS_DIR, projectName);
    const commonLibs = path.resolve(ROOT, "../pxt-common-packages/libs");
    const fileSystem = loadPkgFiles(path.join(ROOT, "libs/seeed-xiao-esp32c6"), "pxt_modules/seeed-xiao-esp32c6/");
    loadPkgFiles(path.join(commonLibs, "base"), "pxt_modules/base/", new Set(), fileSystem);
    const baseBuilt = path.join(ROOT, "libs/base/built");
    fileSystem["pxt_modules/base/pxt-core.d.ts"] = fs.readFileSync(path.join(baseBuilt, "pxt-core.d.ts"), "utf8");
    fileSystem["pxt_modules/base/pxt-helpers.ts"] = fs.readFileSync(path.join(baseBuilt, "pxt-helpers.ts"), "utf8");
    fileSystem["pxt.json"] = fs.readFileSync(path.join(projDir, "pxt.json"), "utf8");
    fileSystem["main.ts"] = fs.readFileSync(path.join(projDir, "main.ts"), "utf8");
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
    const res = pxtc.compile(opts);
    if (!res.success || !res.outfiles[pxtc.BINARY_JS]) {
        console.error(JSON.stringify(res.diagnostics, null, 2));
        throw new Error(`Dry-run compile failed for ${projectName}`);
    }
    console.log(`[HIL]   OK: ${projectName}`);
}

async function buildProject(projectName, native) {
    const projDir = path.join(PROJECTS_DIR, projectName);
    if (!fs.existsSync(path.join(projDir, "pxt.json"))) {
        throw new Error(`Missing pxt.json in ${projDir}`);
    }
    if (!fs.existsSync(path.join(projDir, "main.ts"))) {
        throw new Error(`Missing main.ts in ${projDir}`);
    }
    if (!native) {
        console.log(`[HIL] Compiling ${projectName} (JS/bytecode dry-run)...`);
        await compileDryRun(projectName);
        return;
    }
    const pxtCli = resolvePxtCli();
    console.log(`[HIL] Building ${projectName} (native esp32c6)...`);
    const res = spawnSync("node", [pxtCli, "build", "--localbuild", "--hwvariant", "esp32c6"], {
        cwd: projDir,
        env: { ...process.env, PXT_FORCE_LOCAL: "1" },
        stdio: "pipe",
        encoding: "utf8"
    });
    if (res.status !== 0) {
        console.error(res.stdout);
        console.error(res.stderr);
        throw new Error(`Build failed for ${projectName} (exit ${res.status})`);
    }
    const appBin = path.join(projDir, "built/dockerespidf/build/pxtapp.bin");
    if (!fs.existsSync(appBin)) {
        throw new Error(`Expected native binary not found: ${appBin}`);
    }
    console.log(`[HIL]   OK: ${projectName}`);
}

function flashBoard(port, projectName) {
    const buildDir = path.join(PROJECTS_DIR, projectName, "built/dockerespidf/build");
    const bootloader = path.join(buildDir, "bootloader/bootloader.bin");
    const partTable = path.join(buildDir, "partition_table/partition-table.bin");
    const appBin = path.join(buildDir, "pxtapp.bin");
    for (const f of [bootloader, partTable, appBin]) {
        if (!fs.existsSync(f)) throw new Error(`Missing flash artifact: ${f}`);
    }
    console.log(`[HIL] Flashing ${projectName} -> ${port}...`);
    execFileSync("python3", [
        "-m", "esptool",
        "--chip", "esp32c6",
        "--port", port,
        "--baud", "460800",
        "write_flash", "-z",
        "0x0", bootloader,
        "0x8000", partTable,
        "0x10000", appBin
    ], { stdio: "inherit" });
}

function monitorBoards(boardsWithPorts, timeoutMs) {
    return new Promise((resolve, reject) => {
        const pending = new Map();
        const streams = [];
        let finished = false;

        for (const item of boardsWithPorts) {
            pending.set(item.role, new Set(item.expect));
            execFileSync("stty", ["-F", item.port, "115200", "raw", "-echo"]);
            const stream = fs.createReadStream(item.port, { encoding: "utf8" });
            streams.push(stream);
            let buf = "";
            stream.on("data", chunk => {
                if (finished) return;
                buf += chunk;
                let idx;
                while ((idx = buf.indexOf("\n")) >= 0) {
                    const line = buf.slice(0, idx).replace(/\r$/, "");
                    buf = buf.slice(idx + 1);
                    console.log(`[${item.role}:${path.basename(item.port)}] ${line}`);
                    if (line.includes("HIL_FAIL:")) {
                        cleanup(new Error(`Board ${item.role} reported failure: ${line}`));
                        return;
                    }
                    const rem = pending.get(item.role);
                    for (const marker of Array.from(rem)) {
                        if (line.includes(marker)) rem.delete(marker);
                    }
                    if (Array.from(pending.values()).every(s => s.size === 0)) {
                        cleanup(null);
                        return;
                    }
                }
            });
            stream.on("error", err => cleanup(err));
        }

        const timer = setTimeout(() => {
            const missing = Array.from(pending.entries())
                .filter(([, s]) => s.size > 0)
                .map(([role, s]) => `${role}: [${Array.from(s).join(", ")}]`);
            cleanup(new Error(`HIL timeout after ${timeoutMs}ms. Missing markers: ${missing.join("; ")}`));
        }, timeoutMs);

        function cleanup(err) {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            for (const s of streams) {
                try { s.destroy(); } catch (_) {}
            }
            if (err) reject(err);
            else resolve();
        }
    });
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const suiteNames = opts.suite === "all" ? Object.keys(SUITES) : [opts.suite];
    for (const name of suiteNames) {
        if (!SUITES[name]) {
            throw new Error(`Unknown suite '${name}'. Valid: ${Object.keys(SUITES).join(", ")}, all`);
        }
    }

    const uniqueProjects = new Set();
    for (const name of suiteNames) {
        for (const b of SUITES[name].boards) uniqueProjects.add(b.project);
    }

    if (opts.dryRun) {
        console.log(`[HIL] Running DRY-RUN for suites: ${suiteNames.join(", ")}`);
        for (const proj of uniqueProjects) {
            await buildProject(proj, opts.native);
        }
        console.log(`[HIL] DRY-RUN PASSED (${uniqueProjects.size} projects verified).`);
        return;
    }

    const ports = opts.ports.length ? opts.ports : discoverSerialPorts();
    for (const name of suiteNames) {
        const suite = SUITES[name];
        if (ports.length < suite.boards.length) {
            throw new Error(`Suite '${name}' requires ${suite.boards.length} XIAO ESP32-C6 boards, found ${ports.length} (${ports.join(", ") || "none"}).`);
        }
        console.log(`\n=== HIL Suite: ${name} ===`);
        const assigned = suite.boards.map((b, idx) => ({ ...b, port: ports[idx] }));
        if (!opts.skipFlash) {
            for (const b of assigned) {
                await buildProject(b.project, true);
                flashBoard(b.port, b.project);
            }
        }
        await monitorBoards(assigned, opts.timeoutMs);
        console.log(`=== HIL Suite ${name}: PASSED ===`);
    }
}

main().catch(err => {
    console.error(`[HIL] ERROR: ${err.message}`);
    process.exit(1);
});

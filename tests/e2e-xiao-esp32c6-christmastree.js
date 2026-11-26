"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

require("../../pxt/built/pxt.js");

const makerDir = path.resolve(__dirname, "..");
const pxtCoreDir = path.resolve(makerDir, "../pxt");
const commonLibsDir = path.resolve(makerDir, "node_modules/pxt-common-packages/libs");
const projDir = path.join(__dirname, "e2e-xiao-esp32c6-christmastree");
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
        name: "xiao-esp32c6-christmastree-sim",
        dependencies: {
            "seeed-xiao-esp32c6": "file:pxt_modules/seeed-xiao-esp32c6"
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
    assert.ok(res.usedParts && res.usedParts.indexOf("christmastree") >= 0,
        "Expected usedParts to contain 'christmastree', got: " + JSON.stringify(res.usedParts));
    console.log("✔ Step 1: Compiled e2e-xiao-esp32c6-christmastree JS (usedParts:", res.usedParts, ")");
    return res;
}

function captureLayoutScreenshot(compileRes) {
    const chromeBin = "/usr/bin/google-chrome";
    if (!fs.existsSync(chromeBin)) {
        console.log("⚠ Screenshot skipped: /usr/bin/google-chrome not found");
        return;
    }

    const pxtsimJs = fs.readFileSync(path.join(pxtCoreDir, "built/pxtsim.js"), "utf8");
    const commonSimJs = fs.readFileSync(path.join(makerDir, "built/common-sim.js"), "utf8");
    const simJs = fs.readFileSync(path.join(makerDir, "built/sim.js"), "utf8");
    const boardJson = JSON.parse(fs.readFileSync(path.join(makerDir, "libs/seeed-xiao-esp32c6/board.json"), "utf8"));
    const boardSvg = fs.readFileSync(path.join(makerDir, "libs/seeed-xiao-esp32c6/board.svg"), "utf8");
    boardJson.visual.image = "data:image/svg+xml;base64," + Buffer.from(boardSvg, "utf8").toString("base64");

    const coreParts = JSON.parse(fs.readFileSync(path.join(commonLibsDir, "core/pxtparts.json"), "utf8"));
    const treeParts = JSON.parse(fs.readFileSync(path.join(makerDir, "libs/christmas-tree/pxtparts.json"), "utf8"));
    const partDefinitions = Object.assign({}, coreParts, treeParts);

    const runMsg = {
        type: "run",
        code: compileRes.outfiles[pxtc.BINARY_JS],
        boardDefinition: boardJson,
        parts: compileRes.usedParts,
        partDefinitions,
        fnArgs: compileRes.usedArguments || {},
        cdnUrl: ""
    };

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { width: 100%; height: 100%; margin: 0; padding: 12px; box-sizing: border-box; background: #f4f6f8; display: flex; align-items: center; justify-content: center; overflow: hidden; }
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

    const tmpHtml = "/tmp/e2e-xiao-esp32c6-christmastree-sim.html";
    const outPng = path.join(projDir, "layout.png");
    fs.writeFileSync(tmpHtml, html, "utf8");

    execFileSync(
        chromeBin,
        [
            "--headless",
            "--no-sandbox",
            "--disable-gpu",
            "--window-size=640,860",
            "--virtual-time-budget=2000",
            `--screenshot=${outPng}`,
            `file://${tmpHtml}`
        ],
        { stdio: "ignore" }
    );

    assert.ok(fs.existsSync(outPng) && fs.statSync(outPng).size > 4096, "Expected non-empty layout.png screenshot");
    console.log(`✔ Step 2: Captured Christmas Tree simulator layout screenshot at ${outPng} (${fs.statSync(outPng).size}B)`);
}

(async () => {
    const compileRes = await compileSimulatorJs();
    captureLayoutScreenshot(compileRes);
    console.log("✔ End-to-End XIAO ESP32-C6 Christmas Tree test passed!");
})().catch(err => {
    console.error(err);
    process.exit(1);
});

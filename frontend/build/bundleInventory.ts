import type { Plugin } from "vite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

// Opt-in build evidence. Never publish module sources or source maps with the app.
export function bundleInventory(): Plugin | false {
  const label = process.env.GROUPDEAL_BUNDLE_REPORT;
  if (label && !/^[a-zA-Z0-9-]{1,64}$/.test(label)) throw new Error("Invalid bundle report label");
  let frontendRoot = "";
  let outputDirectory = "";
  return {
    name: "groupdeal-bundle-inventory",
    apply: "build",
    configResolved(config) { frontendRoot = config.root; outputDirectory = resolve(config.root, config.build.outDir); },
    writeBundle(_options, bundle) {
      const modules = Object.values(bundle).filter(item => item.type === "chunk").flatMap(chunk => Object.keys(chunk.modules).map(id => id.replaceAll("\\", "/")));
      if (modules.some(id => /\/(?:react|react-dom)\/cjs\/[^/]*\.development\.js$/.test(id))) throw new Error("Frontend build includes React development runtime; use NODE_ENV=production");
      if (!label) return;
      const modulePath = (id: string) => id.startsWith("\0")
        ? "<virtual>/" + id.slice(1)
        : relative(frontendRoot, id).replaceAll("\\", "/");
      const chunks = Object.values(bundle).filter(item => item.type === "chunk").map(chunk => {
        // Vite import/preload transforms can run after generateBundle observers.
        // Hash the actual final file rather than an intermediate chunk string.
        const bytes = readFileSync(resolve(outputDirectory, chunk.fileName));
        return {
          file: chunk.fileName, entry: chunk.isEntry, dynamicEntry: chunk.isDynamicEntry,
          facadeModule: chunk.facadeModuleId ? modulePath(chunk.facadeModuleId) : null,
          imports: chunk.imports, dynamicImports: chunk.dynamicImports,
          bytes: bytes.length, gzipBytes: gzipSync(bytes).length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          evalLikeToken: /\beval\s*\(/.test(bytes.toString("utf8")),
          modules: Object.keys(chunk.modules).map(modulePath).sort(),
        };
      }).sort((a, b) => a.file.localeCompare(b.file));
      const directory = resolve(frontendRoot, "../.cache");
      mkdirSync(directory, { recursive: true });
      writeFileSync(resolve(directory, `bundle-${label}.json`), JSON.stringify({
        schemaVersion: 1, recordedAt: new Date().toISOString(), layer: "LOCAL_BUILD_GRAPH",
        runtime: process.version, chunks, acceptanceEligible: false,
        limitation: "Emitted build graph and byte counts only; no live provider, CSP, LCP or INP acceptance.",
      }, null, 2) + "\n");
    },
  };
}

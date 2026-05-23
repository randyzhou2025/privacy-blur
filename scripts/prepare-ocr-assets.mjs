import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const copies = [
  ["node_modules/tesseract.js/dist/worker.min.js", "public/ocr/worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "public/ocr/tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm", "public/ocr/tesseract-core-lstm.wasm"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "public/ocr/tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm", "public/ocr/tesseract-core-simd-lstm.wasm"],
  ["node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz", "public/tessdata/eng.traineddata.gz"],
  ["node_modules/@tesseract.js-data/chi_sim/4.0.0/chi_sim.traineddata.gz", "public/tessdata/chi_sim.traineddata.gz"],
];

await rm(resolve(root, "public/ocr"), { recursive: true, force: true });
await rm(resolve(root, "public/tessdata"), { recursive: true, force: true });

for (const [from, to] of copies) {
  const source = resolve(root, from);
  const destination = resolve(root, to);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  console.log(`copied ${to}`);
}

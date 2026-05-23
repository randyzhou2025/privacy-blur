import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const copies = [
  ["node_modules/tesseract.js/dist/worker.min.js", "public/ocr/worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core.wasm.js", "public/ocr/tesseract-core.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core.wasm", "public/ocr/tesseract-core.wasm"],
  ["node_modules/tesseract.js-core/tesseract-core-simd.wasm.js", "public/ocr/tesseract-core-simd.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd.wasm", "public/ocr/tesseract-core-simd.wasm"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "public/ocr/tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm", "public/ocr/tesseract-core-lstm.wasm"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "public/ocr/tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm", "public/ocr/tesseract-core-simd-lstm.wasm"],
  ["node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz", "public/tessdata/eng.traineddata.gz"],
  ["node_modules/@tesseract.js-data/chi_sim/4.0.0/chi_sim.traineddata.gz", "public/tessdata/chi_sim.traineddata.gz"],
];

for (const [from, to] of copies) {
  const source = resolve(root, from);
  const destination = resolve(root, to);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  console.log(`copied ${to}`);
}


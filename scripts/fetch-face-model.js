// Downloads MediaPipe's face landmarker model (Google, Apache 2.0) into renderer/assets/face/, for the
// hands-free control (spec/004-hands-free-control.md). Run once with `npm run models` and commit the file,
// like the hand model in renderer/assets/hands/: the app never downloads anything at run time.
// Fixed URL over HTTPS (certificates checked); the file is checked to be a model bundle before it is kept.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const URL_ = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
const target = path.join(__dirname, '..', 'renderer', 'assets', 'face', 'face_landmarker.task');
const MIN_BYTES = 1_000_000;
const MAX_BYTES = 50_000_000;

function download(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const { statusCode, headers } = res;
      if ([301, 302, 307, 308].includes(statusCode) && headers.location && redirects > 0) {
        res.resume();
        const next = new URL(headers.location, url);
        if (next.protocol !== 'https:') return reject(new Error(`Refusing a non-HTTPS redirect: ${next.href}`));
        return resolve(download(next.href, redirects - 1));
      }
      if (statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${statusCode}`)); }
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) { res.destroy(new Error('The model is larger than expected')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// A .task file is a zip of .tflite models
function looksLikeModel(buffer) {
  return buffer.length >= MIN_BYTES && buffer.includes(Buffer.from('PK\u0003\u0004', 'latin1')) && buffer.includes(Buffer.from('.tflite')) && buffer.includes(Buffer.from('face'));
}

(async () => {
  const data = await download(URL_);
  if (!looksLikeModel(data)) throw new Error('The download does not look like the face landmarker model');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const partial = `${target}.partial`;
  fs.writeFileSync(partial, data);
  fs.renameSync(partial, target);
  console.log(`Face model (${(data.length / 1e6).toFixed(1)} MB) -> ${path.relative(path.join(__dirname, '..'), target)}`);
})().catch((error) => {
  console.error(`Could not fetch the face model: ${error.message}`);
  process.exit(1);
});

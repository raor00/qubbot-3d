// Camera -> what the hands-free math reads from a face, on this computer (no logic: it lives in
// models/gazeModel.js and models/faceGesture.js; spec/004-hands-free-control.md). MediaPipe's face landmarker
// (the same WASM as the hands, and a local model in assets/face/, fetched with `npm run models`) is only
// loaded the first time. One face. Each frame is analysed and dropped: only the mesh points, 10 blendshapes
// (2 blinks and MediaPipe's 8 gaze guesses) and the head's pose matrix are passed on, and nothing is kept,
// logged or sent anywhere.
import { createCameraLoop } from './cameraLoop.js';

const MODEL_URL = new URL('../assets/face/face_landmarker.task', import.meta.url).href;
// The only blendshapes Platanus reads; the other 42 (smiles, frowns…) are dropped right here
export const BLENDSHAPES = [
  'eyeBlinkLeft', 'eyeBlinkRight',
  'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft', 'eyeLookDownLeft',
  'eyeLookInRight', 'eyeLookOutRight', 'eyeLookUpRight', 'eyeLookDownRight',
];

let landmarkerPromise = null;
function loadLandmarker() {
  landmarkerPromise ??= (async () => {
    const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
    const wasm = new URL('./wasm', import.meta.resolve('@mediapipe/tasks-vision')).href;
    const fileset = await FilesetResolver.forVisionTasks(wasm);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: 'VIDEO', numFaces: 1, // one face: MediaPipe smooths it
      outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true, // the head's pose compensates the gaze
    });
    return FaceLandmarker.createFromOptions(fileset, options('GPU'))
      .then((landmarker) => ({ landmarker, delegate: 'GPU' }))
      .catch(() => FaceLandmarker.createFromOptions(fileset, options('CPU')).then((landmarker) => ({ landmarker, delegate: 'CPU' })));
  })();
  landmarkerPromise.catch(() => { landmarkerPromise = null; });
  return landmarkerPromise;
}

// The light (spec/004, B37): once a second the frame is drawn into a 32 × 24 thumbnail and only its mean
// luminance goes on (0 black .. 1 white); the thumbnail is overwritten each time and never leaves this file
const LIGHT_EVERY_MS = 1000;
const THUMB = { width: 32, height: 24 };
export function meanLuma(data) {
  const n = Math.floor((data?.length ?? 0) / 4);
  if (!n) return null;
  let sum = 0;
  for (let i = 0; i < n * 4; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return sum / (n * 255);
}

// MediaPipe's result -> what the logic gets: the first face's points, the 10 blendshapes above and the pose
// matrix (16 numbers), nothing else. null without a face.
export function faceFromResult(result) {
  const landmarks = result?.faceLandmarks?.[0];
  if (!landmarks) return null;
  const blendshapes = {};
  for (const c of result.faceBlendshapes?.[0]?.categories ?? []) if (BLENDSHAPES.includes(c.categoryName)) blendshapes[c.categoryName] = c.score;
  const m = result.facialTransformationMatrixes?.[0]?.data;
  return { landmarks, blendshapes, matrix: m && m.length === 16 ? Array.from(m) : null };
}

export function createFaceTrackingService() {
  // 1280 × 720: the eyes get twice the pixels of 640 × 480, so the iris trembles less (spec/004, B36)
  const camera = createCameraLoop({ size: { width: 1280, height: 720 } });
  let thumb = null;
  let light = null;
  let lightAt = -Infinity;
  const measureLight = (video, now) => {
    if (now - lightAt < LIGHT_EVERY_MS) return;
    lightAt = now;
    try {
      thumb ??= Object.assign(document.createElement('canvas'), THUMB).getContext('2d', { willReadFrequently: true });
      thumb.drawImage(video, 0, 0, THUMB.width, THUMB.height);
      light = meanLuma(thumb.getImageData(0, 0, THUMB.width, THUMB.height).data);
    } catch {
      light = null; // no canvas here: the light is simply not known
    }
  };

  return {
    video: camera.video,

    // onFace({ landmarks, blendshapes, matrix } | null, { now, delegate, light, size }) for every analysed frame.
    // Rejects with the camera's DOMException or a loading error (for example, the model was not fetched).
    async start(onFace) {
      lightAt = -Infinity;
      await camera.start(loadLandmarker, ({ landmarker, delegate }, video, now) => {
        measureLight(video, now);
        const size = { width: video.videoWidth, height: video.videoHeight };
        onFace(faceFromResult(landmarker.detectForVideo(video, now)), { now, delegate, light, size });
      });
    },

    stop() {
      camera.stop();
    },
  };
}

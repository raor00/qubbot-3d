// Camera -> hand landmarks, on this computer (no logic: gestures live in models/handGesture.js).
// MediaPipe's hand landmarker (WASM + a local model in assets/hands/) is only loaded the first time it
// is turned on. The camera (services/cameraLoop.js) is opened for video only and released when it is
// turned off. Up to two hands (two-hand zoom, spec/003-hand-gestures.md); each frame also says when it was
// analysed and whether MediaPipe runs on the GPU or the CPU, so the view model can measure the frame rate.
import { createCameraLoop } from './cameraLoop.js';

const MODEL_URL = new URL('../assets/hands/hand_landmarker.task', import.meta.url).href;
const MAX_HANDS = 2;

let landmarkerPromise = null;
let currentHands = MAX_HANDS; // what the loaded landmarker looks for
function loadLandmarker() {
  landmarkerPromise ??= (async () => {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    // The WASM files sit next to the bundle (node_modules in the app, vendor/ in the web build)
    const wasm = new URL('./wasm', import.meta.resolve('@mediapipe/tasks-vision')).href;
    const fileset = await FilesetResolver.forVisionTasks(wasm);
    const options = (delegate) => ({ baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: 'VIDEO', numHands: MAX_HANDS });
    return HandLandmarker.createFromOptions(fileset, options('GPU'))
      .then((landmarker) => ({ landmarker, delegate: 'GPU' }))
      .catch(() => HandLandmarker.createFromOptions(fileset, options('CPU')).then((landmarker) => ({ landmarker, delegate: 'CPU' })));
  })();
  landmarkerPromise.catch(() => { landmarkerPromise = null; }); // a failed load can be retried
  return landmarkerPromise;
}

export function createHandTrackingService() {
  const camera = createCameraLoop();

  return {
    // The camera image, for the small preview (the view mirrors it)
    video: camera.video,

    // onHands([landmarks, …], { now, delegate }) for every analysed frame (an empty list: no hand). Rejects
    // with the camera's DOMException (NotAllowedError, NotFoundError…) or a loading error.
    async start(onHands) {
      const load = async () => {
        const loaded = await loadLandmarker();
        if (currentHands !== MAX_HANDS) { // a previous run lowered it (slow CPU): each run tries two hands again
          currentHands = MAX_HANDS;
          await loaded.landmarker.setOptions({ numHands: MAX_HANDS }).catch(() => {});
        }
        return loaded;
      };
      await camera.start(load, ({ landmarker, delegate }, video, now) => {
        const result = landmarker.detectForVideo(video, now);
        onHands(result.landmarks ?? [], { now, delegate });
      });
    },

    stop() {
      camera.stop();
    },

    // Fewer hands to look for (the CPU is too slow for two): less work per frame
    async setMaxHands(n) {
      const loaded = await landmarkerPromise?.catch(() => null);
      if (!loaded || currentHands === n) return;
      currentHands = n;
      await loaded.landmarker.setOptions({ numHands: n }).catch(() => {});
    },
  };
}

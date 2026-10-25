// The camera and the analysis loop shared by the hands and the face (no logic): opens the camera for video
// only, plays it in a <video> (for the small preview), loads a detector the first time, and calls detect()
// at most ~30 times per second. Frames are analysed here and dropped: nothing is kept or sent.
const FRAME_MS = 33;

// Video only (never the microphone), from the front camera. The size is an ideal: a camera that cannot give
// it falls back on its own to what it has.
export function videoConstraints({ width = 640, height = 480 } = {}) {
  return { video: { width: { ideal: width }, height: { ideal: height }, facingMode: 'user' }, audio: false };
}

// size: the ideal camera size ({ width, height }); the face asks for more than the hands (spec/004, B36)
export function createCameraLoop({ frameMs = FRAME_MS, size } = {}) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;

  let stream = null;
  let run = 0;
  let frameRequest = null;

  function stopCamera() {
    if (frameRequest !== null) cancelAnimationFrame(frameRequest);
    frameRequest = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  }

  return {
    video,

    // load() -> the detector (loaded once by the caller); detect(detector, video, now) runs per frame.
    // Resolves with the detector, or null when stopped meanwhile. Rejects with the camera's DOMException
    // (NotAllowedError, NotFoundError…) or a loading error.
    async start(load, detect) {
      const mine = ++run;
      const camera = await navigator.mediaDevices.getUserMedia(videoConstraints(size));
      if (mine !== run) { camera.getTracks().forEach((track) => track.stop()); return null; }
      stream = camera;
      video.srcObject = camera;
      await video.play();
      const detector = await load();
      if (mine !== run) return null;
      let last = 0;
      const tick = (now) => {
        if (mine !== run) return;
        frameRequest = requestAnimationFrame(tick);
        if (now - last < frameMs || video.readyState < 2) return;
        last = now;
        detect(detector, video, now);
      };
      frameRequest = requestAnimationFrame(tick);
      return detector;
    },

    stop() {
      run++;
      stopCamera();
    },
  };
}

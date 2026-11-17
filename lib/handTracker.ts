import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export type GestureCallbacks = {
  onSpin: (delta: number) => void;
  onZoom: (delta: number) => void;
  onPinch: (count: number) => void;
};

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export async function createHandTracker(video: HTMLVideoElement, cb: GestureCallbacks) {
  const vision = await FilesetResolver.forVisionTasks(WASM);
  const landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
  });
  video.srcObject = stream;
  await video.play();

  let running = true;
  let raf = 0;
  let prevX: number | null = null;
  let prevSpan: number | null = null;
  let lastVideoTime = -1;
  let lastPinchCount = 0;

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;

    const result = landmarker.detectForVideo(video, performance.now());
    const hands = result.landmarks || [];

    const pinched = hands.map((hand) => {
      const thumb = hand[4];
      const index = hand[8];
      const wrist = hand[0];
      const middleMcp = hand[9];
      const handSize = Math.max(dist(wrist, middleMcp), 0.001);
      return {
        amount: dist(thumb, index) / handSize,
        center: {
          x: (thumb.x + index.x) / 2,
          y: (thumb.y + index.y) / 2,
        },
      };
    }).filter((h) => h.amount < 0.42);

    if (pinched.length !== lastPinchCount) {
      lastPinchCount = pinched.length;
      cb.onPinch(pinched.length);
    }

    if (pinched.length === 1) {
      const x = pinched[0].center.x;
      if (prevX !== null) cb.onSpin((x - prevX) * 18);
      prevX = x;
      prevSpan = null;
    } else if (pinched.length === 2) {
      const span = Math.hypot(
        pinched[0].center.x - pinched[1].center.x,
        pinched[0].center.y - pinched[1].center.y
      );
      if (prevSpan !== null) cb.onZoom((span - prevSpan) * 140);
      prevSpan = span;
      prevX = null;
    } else {
      prevX = null;
      prevSpan = null;
    }
  }
  loop();

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      landmarker.close();
    },
  };
}

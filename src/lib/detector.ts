import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { DetectionResult } from '../types';

let modelPromise: Promise<cocoSsd.ObjectDetection> | null = null;

export async function getCocoModel(onProgress?: (msg: string) => void): Promise<cocoSsd.ObjectDetection> {
  if (!modelPromise) {
    if (onProgress) onProgress('Loading TensorFlow.js COCO-SSD (MobileNet V2)…');
    // Ensure tfjs backend is initialized
    await tf.ready();
    modelPromise = cocoSsd.load({ base: 'mobilenet_v2' });
  }
  return modelPromise;
}

export async function detectObjects(
  mediaEl: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  maxBoxes = 30,
  minScore = 0.50
): Promise<DetectionResult[]> {
  const model = await getCocoModel();
  const rawDetections = await model.detect(mediaEl, maxBoxes, minScore);
  return rawDetections.map((d) => ({
    bbox: d.bbox as [number, number, number, number],
    class: d.class,
    score: d.score,
  }));
}

export function drawDetectionBoxes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  preds: DetectionResult[],
  thermalOn = false
) {
  preds.forEach((p) => {
    const [x, y, bw, bh] = p.bbox;
    const isPerson = p.class === 'person';
    const color = isPerson ? (thermalOn ? '#FFF6D8' : '#C5432E') : '#49D3E0';

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, bw, bh);

    // Corner tactical ticks
    const tickLen = Math.min(bw, bh, 12);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x, y + tickLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + tickLen, y);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + bw - tickLen, y);
    ctx.lineTo(x + bw, y);
    ctx.lineTo(x + bw, y + tickLen);
    ctx.stroke();

    // Label tag
    ctx.fillStyle = color;
    ctx.font = '11px "IBM Plex Mono", monospace';
    const confPct = Math.round(p.score * 100);
    const labelText = `${p.class.toUpperCase()} ${confPct}%`;
    const textWidth = ctx.measureText(labelText).width;

    ctx.fillRect(x, Math.max(0, y - 18), textWidth + 10, 18);
    ctx.fillStyle = '#0E1A26';
    ctx.fillText(labelText, x + 5, Math.max(12, y - 5));
  });
}

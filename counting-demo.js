import { pipeline, env, RawImage } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";

env.allowLocalModels = false;

const imageInput = document.querySelector("#imageInput");
const modeInput = document.querySelector("#modeInput");
const labelInput = document.querySelector("#labelInput");
const labelField = document.querySelector("#labelField");
const thresholdInput = document.querySelector("#thresholdInput");
const thresholdValue = document.querySelector("#thresholdValue");
const spacingInput = document.querySelector("#spacingInput");
const spacingValue = document.querySelector("#spacingValue");
const spacingField = document.querySelector("#spacingField");
const runButton = document.querySelector("#runButton");
const downloadCsv = document.querySelector("#downloadCsv");
const downloadImage = document.querySelector("#downloadImage");
const copyJson = document.querySelector("#copyJson");
const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const resultTitle = document.querySelector("#resultTitle");
const countList = document.querySelector("#countList");
const rawOutput = document.querySelector("#rawOutput");

let image = null;
let imageBlob = null;
let detectorPromise = null;
let lastResults = [];

thresholdInput.addEventListener("input", () => {
  thresholdValue.textContent = thresholdInput.value;
});

spacingInput.addEventListener("input", () => {
  spacingValue.textContent = spacingInput.value;
});

modeInput.addEventListener("change", () => {
  const detectorMode = modeInput.value === "detector";
  labelField.style.display = detectorMode ? "grid" : "none";
  spacingField.style.display = detectorMode ? "none" : "grid";
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) return;

  imageBlob = file;
  const url = URL.createObjectURL(file);
  image = new Image();
  image.onload = () => {
    drawImage();
    resultTitle.textContent = "图片已加载";
    countList.innerHTML = "";
    rawOutput.textContent = "点击“开始计数”。默认花朵颜色计数不需要下载模型。";
    lastResults = [];
    updateExportButtons();
    URL.revokeObjectURL(url);
  };
  image.src = url;
});

runButton.addEventListener("click", async () => {
  if (!image) {
    rawOutput.textContent = "请先上传图片。";
    return;
  }

  setBusy(true, "正在计数...");

  try {
    if (modeInput.value === "flower") {
      runFlowerCounter();
    } else {
      await runDetector();
    }
  } catch (error) {
    resultTitle.textContent = "计数失败";
    rawOutput.textContent = `${error.message}\n\n如果是通用目标检测模式，可能是模型 CDN 或 Hugging Face 模型文件无法访问。可以切回花朵颜色计数模式。`;
  } finally {
    setBusy(false);
    updateExportButtons();
  }
});

downloadCsv.addEventListener("click", () => {
  if (!lastResults.length) return;
  const lines = [["label", "score", "xmin", "ymin", "xmax", "ymax", "area"]];
  lastResults.forEach((item) => {
    const box = normalizeBox(item.box);
    lines.push([
      item.label,
      Number(item.score || 1).toFixed(6),
      Math.round(box.xmin),
      Math.round(box.ymin),
      Math.round(box.xmax),
      Math.round(box.ymax),
      Math.round(item.area || 0)
    ]);
  });
  downloadText("counting-results.csv", lines.map((row) => row.join(",")).join("\n"), "text/csv");
});

downloadImage.addEventListener("click", () => {
  if (!image) return;
  const link = document.createElement("a");
  link.download = "counting-annotated.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

copyJson.addEventListener("click", async () => {
  if (!lastResults.length) return;
  await navigator.clipboard.writeText(JSON.stringify(lastResults, null, 2));
  copyJson.textContent = "已复制";
  setTimeout(() => {
    copyJson.textContent = "复制 JSON";
  }, 1200);
});

async function runDetector() {
  const labels = labelInput.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!labels.length) {
    rawOutput.textContent = "请输入至少一个目标名称，例如 person, car, flower。";
    return;
  }

  setBusy(true, "正在加载检测模型，首次运行会比较慢...");
  const detector = await getDetector();
  const inputImage = await RawImage.fromBlob(imageBlob);
  const results = await detector(inputImage, labels, {
    threshold: Number(thresholdInput.value)
  });

  lastResults = results;
  drawImage();
  drawBoxes(results);
  renderCounts(results);
  rawOutput.textContent = JSON.stringify(results, null, 2);
  resultTitle.textContent = `检测到 ${results.length} 个目标`;
}

function runFlowerCounter() {
  drawImage();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const score = buildFlowerScore(imageData);
  const blurred = boxBlur(score, canvas.width, canvas.height, 2);
  const threshold = flowerThreshold(blurred, Number(thresholdInput.value));
  const spacing = Number(spacingInput.value);
  const peaks = findPeaks(blurred, canvas.width, canvas.height, threshold, spacing);

  lastResults = peaks.map((peak) => ({
    label: "flower",
    score: peak.score,
    area: 0,
    box: {
      xmin: Math.max(0, peak.x - spacing),
      ymin: Math.max(0, peak.y - spacing),
      xmax: Math.min(canvas.width, peak.x + spacing),
      ymax: Math.min(canvas.height, peak.y + spacing)
    },
    center: { x: peak.x, y: peak.y }
  }));

  drawFlowerPeaks(lastResults, spacing);
  renderFlowerCount(lastResults.length, threshold, spacing);
  rawOutput.textContent = JSON.stringify({ total: lastResults.length, threshold, spacing, peaks: lastResults }, null, 2);
  resultTitle.textContent = `估算 ${lastResults.length} 朵花`;
}

function buildFlowerScore(imageData) {
  const data = imageData.data;
  const score = new Float32Array(imageData.width * imageData.height);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const { h, s, v } = rgbToHsv(r, g, b);

    const redDistance = Math.min(Math.abs(h), Math.abs(360 - h));
    const pinkDistance = Math.abs(h - 315);
    const yellowDistance = Math.abs(h - 48);
    const redWeight = Math.max(0, 1 - redDistance / 34);
    const pinkWeight = Math.max(0, 1 - pinkDistance / 46);
    const yellowWeight = Math.max(0, 1 - yellowDistance / 35);
    const colorWeight = Math.max(redWeight, pinkWeight, yellowWeight);
    const greenPenalty = g > r * 1.12 && g > b * 1.12 ? 0.25 : 1;
    score[p] = colorWeight * Math.pow(s, 0.85) * Math.pow(v, 0.75) * greenPenalty;
  }

  return score;
}

function boxBlur(values, width, height, radius) {
  const output = new Float32Array(values.length);
  const area = (radius * 2 + 1) ** 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          sum += values[ny * width + nx];
        }
      }
      output[y * width + x] = sum / area;
    }
  }

  return output;
}

function flowerThreshold(values, sensitivity) {
  let max = 0;
  let sum = 0;
  for (const value of values) {
    if (value > max) max = value;
    sum += value;
  }
  const mean = sum / values.length;
  return Math.max(mean * (1.8 + sensitivity), max * (0.16 + sensitivity * 0.34));
}

function findPeaks(values, width, height, threshold, spacing) {
  const candidates = [];
  const localRadius = Math.max(2, Math.floor(spacing / 3));
  const maxCandidates = 12000;

  for (let y = spacing; y < height - spacing; y += 1) {
    for (let x = spacing; x < width - spacing; x += 1) {
      const value = values[y * width + x];
      if (value < threshold) continue;
      let isPeak = true;
      for (let dy = -localRadius; dy <= localRadius && isPeak; dy += 1) {
        for (let dx = -localRadius; dx <= localRadius; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          if (values[(y + dy) * width + x + dx] > value) {
            isPeak = false;
            break;
          }
        }
      }
      if (isPeak) candidates.push({ x, y, score: value });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected = [];
  const minDistanceSq = spacing * spacing;

  for (const candidate of candidates.slice(0, maxCandidates)) {
    const tooClose = selected.some((peak) => {
      const dx = peak.x - candidate.x;
      const dy = peak.y - candidate.y;
      return dx * dx + dy * dy < minDistanceSq;
    });
    if (!tooClose) selected.push(candidate);
  }

  return selected;
}

function drawFlowerPeaks(results, spacing) {
  ctx.strokeStyle = "#b9ff4a";
  ctx.fillStyle = "#b9ff4a";
  ctx.lineWidth = 2;
  results.forEach((item) => {
    const { x, y } = item.center;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(3, spacing * 0.45), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillRect(x - 1, y - 1, 3, 3);
  });
}

function renderFlowerCount(total, threshold, spacing) {
  countList.innerHTML = `
    <div class="count-pill"><span>flower estimate</span><strong>${total}</strong></div>
    <div class="count-pill"><span>peak spacing</span><strong>${spacing}px</strong></div>
  `;
  rawOutput.textContent = `Estimated flowers: ${total}\nScore threshold: ${threshold.toFixed(4)}\nPeak spacing: ${spacing}px`;
}

function getDetector() {
  if (!detectorPromise) {
    detectorPromise = pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32");
  }
  return detectorPromise;
}

function setBusy(isBusy, message = "") {
  runButton.disabled = isBusy;
  runButton.textContent = isBusy ? "运行中..." : "开始计数";
  if (message) rawOutput.textContent = message;
}

function updateExportButtons() {
  const hasResults = lastResults.length > 0;
  downloadCsv.disabled = !hasResults;
  copyJson.disabled = !hasResults;
  downloadImage.disabled = !image;
}

function drawImage() {
  const maxWidth = 960;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
}

function drawBoxes(results) {
  const colors = ["#b9ff4a", "#55e2d0", "#ffb14a", "#ff6b6b", "#b18cff"];

  results.forEach((item, index) => {
    const box = normalizeBox(item.box);
    const color = colors[index % colors.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(box.xmin, box.ymin, box.xmax - box.xmin, box.ymax - box.ymin);

    const label = `${item.label} ${(item.score * 100).toFixed(1)}%`;
    ctx.font = "14px system-ui, sans-serif";
    const width = ctx.measureText(label).width + 10;
    ctx.fillStyle = color;
    ctx.fillRect(box.xmin, Math.max(0, box.ymin - 24), width, 22);
    ctx.fillStyle = "#0f1110";
    ctx.fillText(label, box.xmin + 5, Math.max(15, box.ymin - 8));
  });
}

function normalizeBox(box) {
  if (box.xmin !== undefined) return box;
  if (box.x1 !== undefined) {
    return { xmin: box.x1, ymin: box.y1, xmax: box.x2, ymax: box.y2 };
  }
  return { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };
}

function renderCounts(results) {
  const counts = new Map();
  results.forEach((item) => counts.set(item.label, (counts.get(item.label) || 0) + 1));

  if (!counts.size) {
    countList.innerHTML = `<p class="small-note">没有检测到超过阈值的目标。可以降低阈值或换更具体的英文目标名。</p>`;
    return;
  }

  countList.innerHTML = Array.from(counts.entries())
    .map(([label, count]) => `<div class="count-pill"><span>${label}</span><strong>${count}</strong></div>`)
    .join("");
}

function rgbToHsv(r, g, b) {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === nr) h = 60 * (((ng - nb) / delta) % 6);
    else if (max === ng) h = 60 * ((nb - nr) / delta + 2);
    else h = 60 * ((nr - ng) / delta + 4);
  }

  if (h < 0) h += 360;
  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

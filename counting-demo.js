import { pipeline, env, RawImage } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";

env.allowLocalModels = false;

const imageInput = document.querySelector("#imageInput");
const modeInput = document.querySelector("#modeInput");
const labelInput = document.querySelector("#labelInput");
const labelField = document.querySelector("#labelField");
const thresholdInput = document.querySelector("#thresholdInput");
const thresholdValue = document.querySelector("#thresholdValue");
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

modeInput.addEventListener("change", () => {
  labelField.style.display = modeInput.value === "detector" ? "grid" : "none";
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
  const mask = buildFlowerMask(imageData, Number(thresholdInput.value));
  const components = connectedComponents(mask, canvas.width, canvas.height);
  const filtered = components.filter((item) => item.area >= 10);
  const smallAreas = filtered
    .map((item) => item.area)
    .filter((area) => area >= 12 && area <= 650)
    .sort((a, b) => a - b);
  const unitArea = median(smallAreas) || 90;

  const expanded = [];
  filtered.forEach((item) => {
    const estimated = Math.max(1, Math.round(item.area / unitArea));
    expanded.push({
      label: "flower",
      score: 1,
      area: item.area,
      estimated,
      box: { xmin: item.xmin, ymin: item.ymin, xmax: item.xmax, ymax: item.ymax }
    });
  });

  const total = expanded.reduce((sum, item) => sum + item.estimated, 0);
  lastResults = expanded;
  drawFlowerComponents(expanded);
  renderFlowerCount(total, expanded, unitArea);
  rawOutput.textContent = JSON.stringify({ total, unitArea, components: expanded }, null, 2);
  resultTitle.textContent = `估算 ${total} 朵花`;
}

function buildFlowerMask(imageData, threshold) {
  const data = imageData.data;
  const mask = new Uint8Array(imageData.width * imageData.height);
  const sensitivity = 1 - threshold;

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const { h, s, v } = rgbToHsv(r, g, b);

    const red = h <= 25 || h >= 335;
    const pink = h >= 285 && h <= 334;
    const yellow = h >= 28 && h <= 70 && r > g * 0.85;
    const brightEnough = v > 0.12 + threshold * 0.12;
    const saturated = s > 0.22 + threshold * 0.2;
    const strongerThanGreen = r > g * (0.82 - sensitivity * 0.18) || b > g * 0.95;

    if ((red || pink || yellow) && brightEnough && saturated && strongerThanGreen) {
      mask[p] = 1;
    }
  }

  return mask;
}

function connectedComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const queue = [];
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) continue;

      let area = 0;
      let xmin = x;
      let ymin = y;
      let xmax = x;
      let ymax = y;
      visited[start] = 1;
      queue.length = 0;
      queue.push([x, y]);

      for (let head = 0; head < queue.length; head += 1) {
        const [cx, cy] = queue[head];
        area += 1;
        if (cx < xmin) xmin = cx;
        if (cy < ymin) ymin = cy;
        if (cx > xmax) xmax = cx;
        if (cy > ymax) ymax = cy;

        neighbors.forEach(([dx, dy]) => {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
          const next = ny * width + nx;
          if (!mask[next] || visited[next]) return;
          visited[next] = 1;
          queue.push([nx, ny]);
        });
      }

      components.push({ area, xmin, ymin, xmax, ymax });
    }
  }

  return components;
}

function drawFlowerComponents(results) {
  ctx.strokeStyle = "#b9ff4a";
  ctx.lineWidth = 2;
  results.forEach((item) => {
    const box = normalizeBox(item.box);
    if (item.area < 10) return;
    ctx.strokeRect(box.xmin, box.ymin, box.xmax - box.xmin, box.ymax - box.ymin);
  });
}

function renderFlowerCount(total, components, unitArea) {
  countList.innerHTML = `
    <div class="count-pill"><span>flower estimate</span><strong>${total}</strong></div>
    <div class="count-pill"><span>color blobs</span><strong>${components.length}</strong></div>
  `;
  rawOutput.textContent = `Estimated flowers: ${total}\nColor blobs: ${components.length}\nEstimated unit area: ${unitArea.toFixed(1)} px`;
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

function median(values) {
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
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

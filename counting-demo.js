import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";

env.allowLocalModels = false;

const imageInput = document.querySelector("#imageInput");
const labelInput = document.querySelector("#labelInput");
const thresholdInput = document.querySelector("#thresholdInput");
const thresholdValue = document.querySelector("#thresholdValue");
const runButton = document.querySelector("#runButton");
const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d");
const resultTitle = document.querySelector("#resultTitle");
const countList = document.querySelector("#countList");
const rawOutput = document.querySelector("#rawOutput");

let image = null;
let detectorPromise = null;

thresholdInput.addEventListener("input", () => {
  thresholdValue.textContent = thresholdInput.value;
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  image = new Image();
  image.onload = () => {
    drawImage();
    resultTitle.textContent = "图片已加载";
    countList.innerHTML = "";
    rawOutput.textContent = "点击“开始计数”运行检测。";
    URL.revokeObjectURL(url);
  };
  image.src = url;
});

runButton.addEventListener("click", async () => {
  if (!image) {
    rawOutput.textContent = "请先上传图片。";
    return;
  }

  const labels = labelInput.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!labels.length) {
    rawOutput.textContent = "请输入至少一个目标名称，例如 flower, person, car。";
    return;
  }

  setBusy(true, "正在加载模型，首次运行会比较慢...");

  try {
    const detector = await getDetector();
    setBusy(true, "正在检测...");

    const results = await detector(canvas, {
      candidate_labels: labels,
      threshold: Number(thresholdInput.value)
    });

    drawImage();
    drawBoxes(results);
    renderCounts(results);
    rawOutput.textContent = JSON.stringify(results, null, 2);
    resultTitle.textContent = `检测到 ${results.length} 个目标`;
  } catch (error) {
    resultTitle.textContent = "检测失败";
    rawOutput.textContent = `${error.message}\n\n如果你在国内网络环境，可能是模型 CDN 或 Hugging Face 模型文件无法访问。`;
  } finally {
    setBusy(false);
  }
});

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

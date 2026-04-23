import { pipeline, env, RawImage } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";

env.allowLocalModels = false;

const imageInput = document.querySelector("#imageInput");
const labelInput = document.querySelector("#labelInput");
const thresholdInput = document.querySelector("#thresholdInput");
const thresholdValue = document.querySelector("#thresholdValue");
const runButton = document.querySelector("#runButton");
const downloadCsv = document.querySelector("#downloadCsv");
const downloadImage = document.querySelector("#downloadImage");
const copyJson = document.querySelector("#copyJson");
const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d");
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

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) return;

  imageBlob = file;
  const url = URL.createObjectURL(file);
  image = new Image();
  image.onload = () => {
    drawImage();
    resultTitle.textContent = "Image loaded";
    countList.innerHTML = "";
    rawOutput.textContent = "Click Run counting to detect objects.";
    lastResults = [];
    updateExportButtons();
    URL.revokeObjectURL(url);
  };
  image.src = url;
});

runButton.addEventListener("click", async () => {
  if (!image) {
    rawOutput.textContent = "Upload an image first.";
    return;
  }

  const labels = labelInput.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!labels.length) {
    rawOutput.textContent = "Enter at least one label, such as person, car, flower.";
    return;
  }

  setBusy(true, "Loading model. The first run can be slow...");

  try {
    const detector = await getDetector();
    setBusy(true, "Detecting objects...");
    const inputImage = await RawImage.fromBlob(imageBlob);

    const results = await detector(inputImage, labels, {
      threshold: Number(thresholdInput.value)
    });

    lastResults = results;
    drawImage();
    drawBoxes(results);
    renderCounts(results);
    rawOutput.textContent = JSON.stringify(results, null, 2);
    resultTitle.textContent = `Detected ${results.length} objects`;
  } catch (error) {
    resultTitle.textContent = "Detection failed";
    rawOutput.textContent = `${error.message}\n\nThe browser may be blocked from downloading the model files from the CDN or Hugging Face.`;
  } finally {
    setBusy(false);
    updateExportButtons();
  }
});

downloadCsv.addEventListener("click", () => {
  if (!lastResults.length) return;
  const lines = [["label", "score", "xmin", "ymin", "xmax", "ymax"]];
  lastResults.forEach((item) => {
    const box = normalizeBox(item.box);
    lines.push([
      item.label,
      item.score.toFixed(6),
      Math.round(box.xmin),
      Math.round(box.ymin),
      Math.round(box.xmax),
      Math.round(box.ymax)
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
  copyJson.textContent = "Copied";
  setTimeout(() => {
    copyJson.textContent = "Copy JSON";
  }, 1200);
});

function getDetector() {
  if (!detectorPromise) {
    detectorPromise = pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32");
  }
  return detectorPromise;
}

function setBusy(isBusy, message = "") {
  runButton.disabled = isBusy;
  runButton.textContent = isBusy ? "Running..." : "Run counting";
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
    countList.innerHTML = `<p class="small-note">No objects above the threshold. Try a lower threshold or more specific English labels.</p>`;
    return;
  }

  countList.innerHTML = Array.from(counts.entries())
    .map(([label, count]) => `<div class="count-pill"><span>${label}</span><strong>${count}</strong></div>`)
    .join("");
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

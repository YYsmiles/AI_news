let models = [];
let sources = [];

const rows = document.querySelector("#rows");
const filters = document.querySelector(".filters");
const search = document.querySelector("#search");
const detailTitle = document.querySelector("#detailTitle");
const detailText = document.querySelector("#detailText");
const demoLink = document.querySelector("#demoLink");
const commandBox = document.querySelector("#commandBox");
const sourceList = document.querySelector("#sourceList");

async function loadData() {
  try {
    const response = await fetch("models.json");
    if (!response.ok) throw new Error(`models.json returned ${response.status}`);
    const data = await response.json();
    models = data.models || [];
    sources = data.sources || [];
    renderRows();
    renderSources();
    if (models.length) pick(0);
  } catch (error) {
    rows.innerHTML = `
      <tr>
        <td colspan="5">
          无法加载 models.json。请通过本地服务或部署站点打开：node server.js
          <br>${error.message}
        </td>
      </tr>
    `;
  }
}

function renderRows() {
  rows.innerHTML = models.map((m, i) => `
    <tr data-index="${i}" data-category="${m.category}">
      <td>${m.task}</td>
      <td><span class="model">${m.name}</span><span class="provider">${m.provider}</span></td>
      <td>${m.use}</td>
      <td><button class="demo" data-pick="${i}" type="button">${m.demo}</button></td>
      <td><code>${firstLine(m.command)}</code></td>
    </tr>
  `).join("");
}

function renderSources() {
  sourceList.innerHTML = sources.map((source) => (
    `<a href="${source.url}" target="_blank" rel="noreferrer">${source.label}</a>`
  )).join("");
}

function firstLine(text) {
  return String(text || "").split("\n").find((line) => line.trim()) || "";
}

function pick(index) {
  const m = models[index];
  if (!m) return;
  detailTitle.textContent = m.name;
  detailText.textContent = `${m.task}：${m.use}`;
  demoLink.href = m.url;
  commandBox.textContent = m.command;
}

function applyFilter() {
  const active = document.querySelector(".chip.active")?.dataset.filter || "all";
  const q = search.value.trim().toLowerCase();

  document.querySelectorAll("tbody tr").forEach((row) => {
    const m = models[Number(row.dataset.index)];
    if (!m) return;
    const text = `${m.task} ${m.name} ${m.provider} ${m.use}`.toLowerCase();
    const categoryMatch = active === "all" || m.category === active;
    const searchMatch = !q || text.includes(q);
    row.classList.toggle("hidden", !(categoryMatch && searchMatch));
  });
}

filters.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll(".chip").forEach((item) => item.classList.remove("active"));
  chip.classList.add("active");
  applyFilter();
});

search.addEventListener("input", applyFilter);

rows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-pick]");
  if (button) pick(Number(button.dataset.pick));
});

loadData();

const feedbackEl = document.getElementById("feedback");
const totalChipEl = document.getElementById("total-chip");
const checkedChipEl = document.getElementById("checked-chip");
const pickBtn = document.getElementById("pick-btn");
const scanBtn = document.getElementById("scan-btn");
const refreshBtn = document.getElementById("refresh-btn");
const selectAllBtn = document.getElementById("select-all-btn");
const downloadBtn = document.getElementById("download-btn");
const downloadTypeEl = document.getElementById("download-type");
const clearBtn = document.getElementById("clear-btn");
const videoListEl = document.getElementById("video-list");

const MAX_SELECTION = 30;

let currentTabId = null;
let selectedUrls = [];
let checkedUrls = new Set();

init().catch((error) => setFeedback(String(error), true));

pickBtn.addEventListener("click", async () => {
  try {
    const tab = await ensureTab();
    await chrome.tabs.sendMessage(tab.id, { type: "enable_picker" });
    setFeedback("Modo de selecao por clique ativado na aba.");
    window.close();
  } catch (error) {
    setFeedback(`Erro ao ativar selecao: ${error}`, true);
  }
});

scanBtn.addEventListener("click", async () => {
  try {
    const tab = await ensureTab();
    const scanResponse = await chrome.tabs.sendMessage(tab.id, {
      type: "scan_visible_videos"
    });

    if (!scanResponse?.ok) {
      throw new Error("Nao foi possivel varrer videos na aba.");
    }

    const addResponse = await chrome.runtime.sendMessage({
      type: "add_selected_videos",
      tabId: tab.id,
      videoUrls: scanResponse.videoUrls || []
    });

    if (!addResponse?.ok) {
      throw new Error(addResponse?.error || "Falha ao importar videos.");
    }

    selectedUrls = addResponse.videoUrls || [];
    checkedUrls = new Set(selectedUrls);
    renderVideoList();
    updateCounters();
    const extra = addResponse.limitReached ? " Limite de 30 atingido." : "";
    setFeedback(`${addResponse.added} videos importados.${extra}`);
  } catch (error) {
    setFeedback(`Erro ao importar: ${error}`, true);
  }
});

refreshBtn.addEventListener("click", async () => {
  await syncSelectedList();
  setFeedback("Lista atualizada.");
});

selectAllBtn.addEventListener("click", () => {
  if (selectedUrls.length === 0) {
    setFeedback("Nao ha videos na lista.");
    return;
  }

  const allSelected = checkedUrls.size === selectedUrls.length;
  if (allSelected) {
    checkedUrls = new Set();
    setFeedback("Todos desmarcados.");
  } else {
    checkedUrls = new Set(selectedUrls);
    setFeedback("Todos marcados.");
  }

  renderVideoList();
  updateCounters();
});

downloadBtn.addEventListener("click", async () => {
  try {
    const tab = await ensureTab();
    const urls = selectedUrls.filter((url) => checkedUrls.has(url)).slice(0, MAX_SELECTION);
    const downloadType = getDownloadType();
    if (urls.length === 0) {
      throw new Error("Nenhum video marcado para download.");
    }

    const response = await chrome.runtime.sendMessage({
      type: "download_selected_no_watermark",
      tabId: tab.id,
      videoUrls: urls,
      downloadType
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Falha no download.");
    }

    const failCount = response.failures?.length || 0;
    const formatLabel = downloadType === "mp3" ? "MP3" : "MP4";
    setFeedback(
      `Downloads ${formatLabel} iniciados: ${response.success?.length || 0}/${response.total}. Falhas: ${failCount}.`,
      failCount > 0
    );
  } catch (error) {
    setFeedback(`Erro: ${error}`, true);
  }
});

clearBtn.addEventListener("click", async () => {
  try {
    const tab = await ensureTab();
    const response = await chrome.runtime.sendMessage({
      type: "clear_selected_videos",
      tabId: tab.id
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Falha ao limpar selecao.");
    }

    selectedUrls = [];
    checkedUrls = new Set();
    renderVideoList();
    updateCounters();
    setFeedback("Lista limpa.");
  } catch (error) {
    setFeedback(`Erro ao limpar: ${error}`, true);
  }
});

async function init() {
  await ensureTab();
  await syncSelectedList();
}

async function ensureTab() {
  if (Number.isInteger(currentTabId)) {
    const tab = await chrome.tabs.get(currentTabId);
    return tab;
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !Number.isInteger(tab.id)) {
    throw new Error("Aba ativa nao encontrada.");
  }

  currentTabId = tab.id;
  return tab;
}

async function syncSelectedList() {
  const tab = await ensureTab();
  const response = await chrome.runtime.sendMessage({
    type: "get_selected_videos",
    tabId: tab.id
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Nao foi possivel ler selecao.");
  }

  selectedUrls = Array.isArray(response.videoUrls) ? response.videoUrls : [];
  checkedUrls = new Set(selectedUrls);
  renderVideoList();
  updateCounters();
}

function renderVideoList() {
  videoListEl.innerHTML = "";
  if (selectedUrls.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "empty";
    emptyEl.textContent = "Sem videos selecionados. Use Selecao por clique ou Importar visiveis.";
    videoListEl.appendChild(emptyEl);
    return;
  }

  for (const url of selectedUrls) {
    const item = document.createElement("article");
    item.className = "video-item";

    const meta = document.createElement("div");
    meta.className = "video-meta";

    const idEl = document.createElement("span");
    idEl.className = "video-id";
    idEl.textContent = `ID ${extractVideoId(url)}`;

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = checkedUrls.has(url);
    check.addEventListener("change", () => {
      if (check.checked) {
        checkedUrls.add(url);
      } else {
        checkedUrls.delete(url);
      }
      updateCounters();
    });

    meta.append(idEl, check);

    const urlEl = document.createElement("p");
    urlEl.className = "video-url";
    urlEl.textContent = url;

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const origin = document.createElement("span");
    origin.className = "video-url";
    origin.textContent = "Pronto para download";

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "Remover";
    removeBtn.addEventListener("click", () => removeUrl(url));

    actions.append(origin, removeBtn);

    item.append(meta, urlEl, actions);
    videoListEl.appendChild(item);
  }
}

async function removeUrl(url) {
  try {
    const tab = await ensureTab();
    const response = await chrome.runtime.sendMessage({
      type: "remove_selected_video",
      tabId: tab.id,
      videoUrl: url
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Falha ao remover video.");
    }

    selectedUrls = Array.isArray(response.videoUrls) ? response.videoUrls : [];
    checkedUrls = new Set(Array.from(checkedUrls).filter((checkedUrl) => checkedUrl !== url));
    renderVideoList();
    updateCounters();
    setFeedback("Video removido.");
  } catch (error) {
    setFeedback(`Erro ao remover: ${error}`, true);
  }
}

function updateCounters() {
  totalChipEl.textContent = `${selectedUrls.length}/${MAX_SELECTION} selecionados`;
  checkedChipEl.textContent = `${checkedUrls.size} marcados`;
  selectAllBtn.textContent =
    checkedUrls.size === selectedUrls.length && selectedUrls.length > 0 ? "Desmarcar todos" : "Marcar todos";
}

function extractVideoId(url) {
  const match = url.match(/\/video\/(\d{8,})/);
  return match ? match[1] : "desconhecido";
}

function getDownloadType() {
  const value = downloadTypeEl?.value;
  return value === "mp3" ? "mp3" : "mp4";
}

function setFeedback(message, isError = false) {
  feedbackEl.textContent = message;
  feedbackEl.className = `feedback ${isError ? "err" : "ok"}`;
}

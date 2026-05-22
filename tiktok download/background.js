const STORAGE_KEY = "selectedVideosByTab";
const MAX_SELECTION = 30;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "add_selected_video") {
    const tabId = sender.tab?.id;
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false, error: "tab_id_missing" });
      return;
    }

    addSelectedVideo(tabId, message.videoUrl)
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "add_selected_videos") {
    const tabId = message.tabId;
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false, error: "invalid_tab_id" });
      return;
    }

    addSelectedVideos(tabId, message.videoUrls || [])
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "get_selected_videos") {
    const tabId = message.tabId;
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false, error: "invalid_tab_id" });
      return;
    }

    getSelectedVideos(tabId)
      .then((videoUrls) => sendResponse({ ok: true, videoUrls }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "remove_selected_video") {
    const tabId = message.tabId;
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false, error: "invalid_tab_id" });
      return;
    }

    removeSelectedVideo(tabId, message.videoUrl)
      .then((videoUrls) => sendResponse({ ok: true, videoUrls }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "clear_selected_videos") {
    const tabId = message.tabId;
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false, error: "invalid_tab_id" });
      return;
    }

    clearSelectedVideos(tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "download_selected_no_watermark") {
    const tabId = message.tabId;
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false, error: "invalid_tab_id" });
      return;
    }

    handleNoWatermarkDownloads(tabId, message.videoUrls)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
});

async function handleNoWatermarkDownloads(tabId, explicitVideoUrls) {
  const sourceUrls = Array.isArray(explicitVideoUrls) ? explicitVideoUrls : await getSelectedVideos(tabId);
  const videoUrls = sourceUrls.slice(0, MAX_SELECTION).map(normalizeTikTokVideoUrl).filter(Boolean);

  if (videoUrls.length === 0) {
    throw new Error("Nenhum video selecionado para download.");
  }

  const summary = {
    total: videoUrls.length,
    success: [],
    failures: []
  };

  for (let index = 0; index < videoUrls.length; index += 1) {
    const selectedVideoUrl = videoUrls[index];
    try {
      const { downloadUrl, filename } = await resolveNoWatermarkUrl(selectedVideoUrl);
      const downloadId = await chrome.downloads.download({
        url: downloadUrl,
        filename,
        saveAs: false,
        conflictAction: "uniquify"
      });

      summary.success.push({
        selectedVideoUrl,
        downloadUrl,
        downloadId
      });
    } catch (error) {
      summary.failures.push({
        selectedVideoUrl,
        error: String(error)
      });
    }

    await wait(140);
  }

  return summary;
}

async function resolveNoWatermarkUrl(tiktokUrl) {
  const resolvers = [resolveWithTikwm, resolveWithTiklydown];
  let lastError = null;

  for (const resolver of resolvers) {
    try {
      const result = await resolver(tiktokUrl);
      if (result?.downloadUrl) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("Nenhum resolver retornou uma URL valida.");
}

async function resolveWithTikwm(tiktokUrl) {
  const response = await fetch("https://www.tikwm.com/api/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: tiktokUrl, hd: 1 })
  });

  if (!response.ok) {
    throw new Error(`TikWM falhou: HTTP ${response.status}`);
  }

  const data = await response.json();
  const payload = data?.data || {};
  const downloadUrl = payload.hdplay || payload.play || payload.nwm_video_url || null;

  if (!downloadUrl) {
    throw new Error("TikWM nao retornou URL sem marca d'agua.");
  }

  return {
    downloadUrl,
    filename: buildFilename(tiktokUrl)
  };
}

async function resolveWithTiklydown(tiktokUrl) {
  const endpoint = `https://api.tiklydown.eu.org/api/download/v4?url=${encodeURIComponent(tiktokUrl)}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`TiklyDown falhou: HTTP ${response.status}`);
  }

  const data = await response.json();
  const videoData = data?.video || {};
  const downloadUrl =
    videoData.noWatermark || videoData.no_watermark || data?.noWatermark || null;

  if (!downloadUrl) {
    throw new Error("TiklyDown nao retornou URL sem marca d'agua.");
  }

  return {
    downloadUrl,
    filename: buildFilename(tiktokUrl)
  };
}

function buildFilename(tiktokUrl) {
  const match = tiktokUrl.match(/\/video\/(\d{8,})/);
  const id = match ? match[1] : `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  return `tiktok-${id}.mp4`;
}

async function addSelectedVideo(tabId, videoUrl) {
  const normalized = normalizeTikTokVideoUrl(videoUrl);
  if (!normalized) {
    throw new Error("URL de video invalida.");
  }

  const current = await getSelectedVideos(tabId);
  if (current.includes(normalized)) {
    return {
      alreadyExists: true,
      total: current.length,
      videoUrls: current
    };
  }

  if (current.length >= MAX_SELECTION) {
    throw new Error(`Limite atingido. Maximo de ${MAX_SELECTION} videos.`);
  }

  const next = [...current, normalized];
  await setSelectedVideos(tabId, next);

  return {
    alreadyExists: false,
    total: next.length,
    videoUrls: next
  };
}

async function addSelectedVideos(tabId, videoUrls) {
  const current = await getSelectedVideos(tabId);
  const normalizedSet = new Set(current);
  let added = 0;

  for (const rawUrl of videoUrls) {
    const normalized = normalizeTikTokVideoUrl(rawUrl);
    if (!normalized || normalizedSet.has(normalized)) {
      continue;
    }
    if (normalizedSet.size >= MAX_SELECTION) {
      break;
    }
    normalizedSet.add(normalized);
    added += 1;
  }

  const next = Array.from(normalizedSet);
  await setSelectedVideos(tabId, next);
  return {
    added,
    total: next.length,
    videoUrls: next,
    limitReached: next.length >= MAX_SELECTION
  };
}

async function getSelectedVideos(tabId) {
  const state = await chrome.storage.local.get(STORAGE_KEY);
  const byTab = state[STORAGE_KEY] || {};
  const selected = byTab[String(tabId)];
  return Array.isArray(selected) ? selected : [];
}

async function setSelectedVideos(tabId, videoUrls) {
  const state = await chrome.storage.local.get(STORAGE_KEY);
  const byTab = state[STORAGE_KEY] || {};
  byTab[String(tabId)] = videoUrls;
  await chrome.storage.local.set({ [STORAGE_KEY]: byTab });
}

async function removeSelectedVideo(tabId, videoUrl) {
  const normalized = normalizeTikTokVideoUrl(videoUrl);
  const current = await getSelectedVideos(tabId);
  const next = current.filter((url) => url !== normalized);
  await setSelectedVideos(tabId, next);
  return next;
}

async function clearSelectedVideos(tabId) {
  const state = await chrome.storage.local.get(STORAGE_KEY);
  const byTab = state[STORAGE_KEY] || {};
  delete byTab[String(tabId)];
  await chrome.storage.local.set({ [STORAGE_KEY]: byTab });
}

function normalizeTikTokVideoUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return null;
  }

  try {
    const url = new URL(rawUrl.trim());
    if (!url.hostname.includes("tiktok.com")) {
      return null;
    }

    const match = url.pathname.match(/\/video\/(\d{8,})/);
    if (!match) {
      return null;
    }

    const canonicalPath = url.pathname.split("?")[0];
    return `${url.origin}${canonicalPath}`;
  } catch {
    return null;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let pickerEnabled = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "enable_picker") {
    pickerEnabled = true;
    setPickerUI(true);
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "scan_visible_videos") {
    const urls = collectVideoUrlsFromPage().slice(0, 60);
    sendResponse({ ok: true, videoUrls: urls });
    return;
  }
});

document.addEventListener(
  "click",
  async (event) => {
    if (!pickerEnabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const target = event.target;
    const videoUrl = resolveVideoUrlFromTarget(target, event.composedPath());

    if (!videoUrl) {
      showToast("Nao consegui identificar um video. Tente clicar em outra area.");
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: "add_selected_video",
        videoUrl
      });

      if (response?.ok) {
        if (response.alreadyExists) {
          showToast(`Video ja estava na lista. Total: ${response.total}/30`);
        } else {
          showToast(`Video adicionado. Total: ${response.total}/30`);
        }
      } else {
        showToast(response?.error || "Falha ao salvar a selecao.");
      }
    } catch {
      showToast("Erro ao comunicar com a extensao.");
    }
  },
  true
);

document.addEventListener("keydown", (event) => {
  if (!pickerEnabled) {
    return;
  }
  if (event.key === "Escape") {
    pickerEnabled = false;
    setPickerUI(false);
    showToast("Modo multi-selecao desativado.");
  }
});

function resolveVideoUrlFromTarget(target, eventPath = []) {
  if (!(target instanceof Element)) {
    return null;
  }

  const fromPath = resolveFromPathElements(eventPath);
  if (fromPath) {
    return fromPath;
  }

  const directAnchor = target.closest("a[href*='/video/']");
  if (directAnchor) {
    return normalizeUrlLikeValue(directAnchor.getAttribute("href"));
  }

  const fromCard = resolveFromCard(target);
  if (fromCard) {
    return fromCard;
  }

  const fromVisible = firstValidVideoUrl(collectVideoUrlsFromPage());
  if (fromVisible) {
    return fromVisible;
  }

  if (location.pathname.includes("/video/")) {
    return normalizeUrlLikeValue(location.href);
  }

  return null;
}

function resolveFromPathElements(pathElements) {
  for (const item of pathElements) {
    if (!(item instanceof Element)) {
      continue;
    }

    if (item.matches?.("a[href*='/video/']")) {
      const resolved = normalizeUrlLikeValue(item.getAttribute("href"));
      if (resolved) {
        return resolved;
      }
    }

    const anchor = item.querySelector?.("a[href*='/video/']");
    if (anchor) {
      const resolved = normalizeUrlLikeValue(anchor.getAttribute("href"));
      if (resolved) {
        return resolved;
      }
    }

    const attrValues = readElementAttributes(item);
    for (const value of attrValues) {
      const resolved = normalizeUrlLikeValue(value);
      if (resolved) {
        return resolved;
      }
      const fromId = buildUrlFromVideoId(value, item);
      if (fromId) {
        return fromId;
      }
    }
  }
  return null;
}

function resolveFromCard(target) {
  const card = target.closest(
    "article, [data-e2e*='feed'], [data-e2e*='browse'], [data-e2e*='recommend'], [class*='DivItemContainer']"
  );
  if (!card) {
    return null;
  }

  const candidates = collectVideoUrlsFromRoot(card);
  return firstValidVideoUrl(candidates);
}

function collectVideoUrlsFromPage() {
  const all = new Set();

  for (const url of collectVideoUrlsFromRoot(document)) {
    all.add(url);
  }

  const html = document.documentElement?.innerHTML || "";
  const regex = /https:\/\/www\.tiktok\.com\/@[^"'\\\s<>]+\/video\/\d{8,}/g;
  let match = regex.exec(html);
  while (match) {
    const normalized = normalizeUrlLikeValue(match[0]);
    if (normalized) {
      all.add(normalized);
    }
    match = regex.exec(html);
  }

  if (location.pathname.includes("/video/")) {
    const current = normalizeUrlLikeValue(location.href);
    if (current) {
      all.add(current);
    }
  }

  return Array.from(all);
}

function collectVideoUrlsFromRoot(rootNode) {
  if (!rootNode || !rootNode.querySelectorAll) {
    return [];
  }

  const found = new Set();

  const anchors = rootNode.querySelectorAll("a[href*='/video/']");
  for (const anchor of anchors) {
    const normalized = normalizeUrlLikeValue(anchor.getAttribute("href"));
    if (normalized) {
      found.add(normalized);
    }
  }

  const richNodes = rootNode.querySelectorAll("[href], [src], [poster], [data-e2e], [data-video-id], video");
  for (const node of richNodes) {
    const values = readElementAttributes(node);
    for (const value of values) {
      const normalized = normalizeUrlLikeValue(value);
      if (normalized) {
        found.add(normalized);
        continue;
      }
      const maybeById = buildUrlFromVideoId(value, node);
      if (maybeById) {
        found.add(maybeById);
      }
    }
  }

  return Array.from(found);
}

function readElementAttributes(element) {
  if (!(element instanceof Element)) {
    return [];
  }

  const values = [];
  for (const attr of element.getAttributeNames()) {
    const raw = element.getAttribute(attr);
    if (raw) {
      values.push(raw);
    }
  }

  if ("href" in element && typeof element.href === "string") {
    values.push(element.href);
  }

  return values;
}

function normalizeUrlLikeValue(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const match = value.match(/(https?:\/\/[^"'\\\s<>]+|\/@[^"'\\\s<>]+\/video\/\d{8,})/);
  if (!match) {
    return null;
  }

  try {
    const resolved = new URL(match[1], location.origin);
    if (!resolved.hostname.includes("tiktok.com")) {
      return null;
    }

    const videoMatch = resolved.pathname.match(/\/video\/(\d{8,})/);
    if (!videoMatch) {
      return null;
    }

    return `${resolved.origin}${resolved.pathname}`;
  } catch {
    return null;
  }
}

function buildUrlFromVideoId(value, contextNode) {
  if (typeof value !== "string") {
    return null;
  }

  const idMatch = value.match(/\b(\d{18,20})\b/);
  if (!idMatch) {
    return null;
  }

  const username = resolveNearestUsername(contextNode);
  if (username) {
    return `https://www.tiktok.com/@${username}/video/${idMatch[1]}`;
  }

  return null;
}

function resolveNearestUsername(contextNode) {
  const nearestAnchor = contextNode
    ?.closest?.("article, [data-e2e], [class*='DivItemContainer']")
    ?.querySelector?.("a[href*='/@']");

  if (!nearestAnchor) {
    return null;
  }

  const href = nearestAnchor.getAttribute("href") || "";
  const match = href.match(/\/@([^\/?#]+)/);
  return match ? match[1] : null;
}

function firstValidVideoUrl(urls) {
  for (const url of urls) {
    const normalized = normalizeUrlLikeValue(url);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function setPickerUI(enabled) {
  if (enabled) {
    document.documentElement.style.cursor = "crosshair";
    showToast("Modo multi-selecao ativado. Clique em videos e use ESC para sair.");
  } else {
    document.documentElement.style.cursor = "";
  }
}

function showToast(message) {
  let toast = document.getElementById("tt-dl-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "tt-dl-toast";
    toast.style.position = "fixed";
    toast.style.right = "16px";
    toast.style.bottom = "16px";
    toast.style.zIndex = "999999";
    toast.style.background = "rgba(0, 0, 0, 0.85)";
    toast.style.color = "#fff";
    toast.style.padding = "10px 12px";
    toast.style.borderRadius = "10px";
    toast.style.fontFamily = "system-ui, sans-serif";
    toast.style.fontSize = "12px";
    toast.style.maxWidth = "280px";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.display = "block";
  clearTimeout(showToast._timerId);
  showToast._timerId = setTimeout(() => {
    toast.style.display = "none";
  }, 2500);
}

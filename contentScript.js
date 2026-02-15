// test comment for merge conflict
// contentScript.js - injected into every page

// new test comment to check branch
(function() {
  chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (message && message.type === "TOPIC_TUTOR_FORCE_ANALYZE") {
      const topic = (message.payload && message.payload.topic) || "";
      const { keywords } = inferTopicFromPage();
      buildPanel(topic, keywords, "");
      requestResources(topic, keywords);
    }
  });
  if (window.__topicTutorInjected) return;
  window.__topicTutorInjected = true;

  const PANEL_ID = "topic-tutor-panel";
  const BUTTON_ID = "topic-tutor-toggle";

  function createFloatingButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.innerText = "Topic Tutor";
    btn.title = "Analyze this page and get learning resources";
    btn.addEventListener("click", onButtonClick);
    document.documentElement.appendChild(btn);
  }

  function onButtonClick() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      existing.remove();
      return;
    }

    const { topic, keywords, debugText } = inferTopicFromPage();
    buildPanel(topic, keywords, debugText);
    requestResources(topic, keywords);
  }

  function inferTopicFromPage() {
    let textPieces = [];

    const title = document.title || "";
    textPieces.push(title);

    const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
    if (metaDesc) textPieces.push(metaDesc);

    const h1 = document.querySelector("h1")?.innerText || "";
    if (h1) textPieces.push(h1);

    const paragraphs = Array.from(document.querySelectorAll("p"))
      .slice(0, 10)
      .map(p => p.innerText);
    textPieces.push(paragraphs.join(" "));

    // Special handling for YouTube watch pages
    if (location.host.includes("youtube.com")) {
      const ytTitle =
        document.querySelector("h1.title")?.innerText ||
        document.querySelector("#title h1")?.innerText ||
        title;
      if (ytTitle) textPieces.unshift(ytTitle);
    }

    const fullText = textPieces.join(" ");
    const keywords = extractKeywords(fullText, 6);
    const topic = title || keywords.join(" ");
    return { topic: topic.trim(), keywords, debugText: fullText.slice(0, 1500) };
  }

  function extractKeywords(text, maxKeywords) {
    text = text.toLowerCase();
    const stopwords = new Set([
      "the","is","in","at","of","on","and","a","to","for","with","that","this","it","as","an",
      "by","from","or","be","are","was","were","about","you","your","i","we","they","he","she",
      "them","his","her","its","our","us","will","can","if","not","but","how","what","when",
      "where","why","which","into","using","use","based","intro","introduction","overview"
    ]);

    const words = text
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w));

    const freq = new Map();
    for (const w of words) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([w]) => w);
  }

  function buildPanel(topic, keywords, debugText) {
    const old = document.getElementById(PANEL_ID);
    if (old) old.remove();

    const panel = document.createElement("div");
    panel.id = PANEL_ID;

    panel.innerHTML = `
      <div class="tt-header">
        <div>
          <div class="tt-title">Topic Tutor</div>
          <div class="tt-subtitle">Analyzing: <span class="tt-topic">${escapeHtml(topic || "(unknown)")}</span></div>
        </div>
        <button class="tt-close" aria-label="Close">&times;</button>
      </div>
      <div class="tt-body">
        <div class="tt-loading">Finding the best courses, books, and videos for you...</div>
        <div class="tt-results" style="display:none;"></div>
      </div>
      <div class="tt-footer">
        <span class="tt-keywords-label">Keywords:</span>
        <span class="tt-keywords">${keywords.map(k => `<span class="tt-tag">${escapeHtml(k)}</span>`).join(" ") || "None"}</span>
      </div>
    `;

    panel.querySelector(".tt-close").addEventListener("click", () => panel.remove());
    document.documentElement.appendChild(panel);
  }

  function requestResources(topic, keywords) {
    chrome.runtime.sendMessage(
      {
        type: "FETCH_RESOURCES",
        payload: { topic, keywords }
      },
      response => {
        if (!response) return renderError("No response from Topic Tutor background script.");
        if (!response.success) return renderError(response.error || "Unknown error.");
        renderResults(response.results || []);
      }
    );
  }

  function renderError(msg) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const loading = panel.querySelector(".tt-loading");
    const resultsEl = panel.querySelector(".tt-results");
    if (loading) loading.style.display = "none";
    if (resultsEl) {
      resultsEl.style.display = "block";
      resultsEl.innerHTML = `<div class="tt-error">⚠️ ${escapeHtml(msg)}</div>`;
    }
  }

  function renderResults(items) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const loading = panel.querySelector(".tt-loading");
    const resultsEl = panel.querySelector(".tt-results");
    if (loading) loading.style.display = "none";
    if (!resultsEl) return;

    resultsEl.style.display = "block";

    if (!items.length) {
      resultsEl.innerHTML = `<div class="tt-error">No resources found. Try a different page or topic.</div>`;
      return;
    }

    const html = items
      .map(item => {
        const sourceLabel =
          item.source === "youtube"
            ? "YouTube"
            : item.source === "book"
            ? "Book"
            : item.source === "coursera"
            ? "Coursera"
            : "Resource";

        const desc =
          (item.description || "").length > 180
            ? item.description.slice(0, 177) + "..."
            : item.description || "";

        const metrics = formatMetrics(item);
        return `
          <a class="tt-card" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener noreferrer">
            <div class="tt-card-media">
              ${
                item.thumbnail
                  ? `<img src="${escapeHtml(item.thumbnail)}" alt="thumbnail" />`
                  : `<div class="tt-placeholder-icon">${sourceLabel[0] || "R"}</div>`
              }
            </div>
            <div class="tt-card-content">
              <div class="tt-card-title">${escapeHtml(item.title || "Untitled resource")}</div>
              <div class="tt-card-meta">
                <span class="tt-badge tt-badge-${escapeHtml(item.source || "other")}">${escapeHtml(sourceLabel)}</span>
                ${metrics ? `<span class="tt-metrics">${metrics}</span>` : ""}
              </div>
              <div class="tt-card-desc">${escapeHtml(desc)}</div>
            </div>
          </a>
        `;
      })
      .join("");

    resultsEl.innerHTML = html;
  }

  function formatMetrics(item) {
    if (item.source === "youtube" && item.metrics) {
      const v = item.metrics.viewCount;
      const l = item.metrics.likeCount;
      const views = typeof v === "number" ? numAbbrev(v) + " views" : "";
      const likes = typeof l === "number" ? numAbbrev(l) + " likes" : "";
      return [views, likes].filter(Boolean).join(" • ");
    }
    if (item.source === "book" && item.metrics) {
      const r = item.metrics.averageRating;
      const c = item.metrics.ratingsCount;
      const rating = typeof r === "number" && r > 0 ? `⭐ ${r.toFixed(1)}` : "";
      const count = typeof c === "number" && c > 0 ? `${numAbbrev(c)} ratings` : "";
      return [rating, count].filter(Boolean).join(" • ");
    }
    if (item.source === "coursera") {
      return "Multiple curated courses";
    }
    return "";
  }

  function numAbbrev(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createFloatingButton);
  } else {
    createFloatingButton();
  }
})();

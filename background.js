// background.js - service worker for Topic Tutor

// ====== CONFIGURE YOUR API KEYS HERE ======
// 1. Create a YouTube Data API v3 key in Google Cloud Console
// 2. Create a Google Books API key (can reuse the same project)
// 3. Paste them below.

const YOUTUBE_API_KEY = "AIzaSyCYwu_K57URBYZ9RcVLryx9Hk5WgDBilr0";
const GOOGLE_BOOKS_API_KEY = "AIzaSyD-jAf-SWIp3PYJuuKnZX4XSOa4HmSyKT8";

// ====== MAIN MESSAGE HANDLER ======
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "FETCH_RESOURCES") {
    const { topic, keywords } = message.payload || {};
    handleFetchResources(topic, keywords)
      .then(results => {
        sendResponse({ success: true, results });
      })
      .catch(err => {
        console.error("Topic Tutor error:", err);
        sendResponse({ success: false, error: err?.message || String(err) });
      });
    return true; // keep the message channel open for async response
  }
});

async function handleFetchResources(topic, keywords) {
  const query = topic || (keywords || []).join(" ") || "learning";

  const [ytItems, bookItems, courseraItems] = await Promise.all([
    fetchYouTubeResources(query),
    fetchBookResources(query),
    buildCourseraResources(query)
  ]);

  const all = [...ytItems, ...bookItems, ...courseraItems];
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, 15);
}

// ====== YOUTUBE FETCH & RANKING ======
async function fetchYouTubeResources(query) {
  if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY.startsWith("YOUR_")) {
    console.warn("Topic Tutor: YouTube API key not configured.");
    return [];
  }

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", "8");
  searchUrl.searchParams.set("order", "relevance");
  searchUrl.searchParams.set("key", YOUTUBE_API_KEY);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    console.error("YouTube search failed", searchRes.status);
    return [];
  }
  const searchData = await searchRes.json();
  const items = searchData.items || [];
  if (!items.length) return [];

  const ids = items.map(it => it.id && it.id.videoId).filter(Boolean);
  if (!ids.length) return [];

  const statsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  statsUrl.searchParams.set("part", "statistics,snippet");
  statsUrl.searchParams.set("id", ids.join(","));
  statsUrl.searchParams.set("key", YOUTUBE_API_KEY);

  const statsRes = await fetch(statsUrl.toString());
  if (!statsRes.ok) {
    console.error("YouTube stats failed", statsRes.status);
    return [];
  }
  const statsData = await statsRes.json();

  const statsMap = new Map();
  (statsData.items || []).forEach(v => {
    statsMap.set(v.id, v);
  });

  const now = Date.now();

  return ids
    .map(id => {
      const data = statsMap.get(id);
      if (!data) return null;

      const snippet = data.snippet || {};
      const statistics = data.statistics || {};
      const viewCount = Number(statistics.viewCount || 0);
      const likeCount = Number(statistics.likeCount || 0);
      const publishedAt = snippet.publishedAt ? new Date(snippet.publishedAt).getTime() : now;

      const ageDays = Math.max(1, (now - publishedAt) / (1000 * 60 * 60 * 24));
      const recencyScore = 1 / (1 + ageDays / 365);

      const likeRatio = viewCount > 0 ? likeCount / viewCount : 0;
      const popularityScore = Math.log10(viewCount + 1) + 2 * likeRatio;

      const score = 0.6 * popularityScore + 0.4 * recencyScore;

      return {
        id: `yt_${id}`,
        source: "youtube",
        title: snippet.title || "YouTube Video",
        url: `https://www.youtube.com/watch?v=${id}`,
        description: snippet.description || "",
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null,
        metrics: {
          viewCount,
          likeCount,
          publishedAt: snippet.publishedAt || null
        },
        score
      };
    })
    .filter(Boolean);
}

// ====== GOOGLE BOOKS FETCH & RANKING ======
async function fetchBookResources(query) {
  if (!GOOGLE_BOOKS_API_KEY || GOOGLE_BOOKS_API_KEY.startsWith("YOUR_")) {
    console.warn("Topic Tutor: Google Books API key not configured.");
    return [];
  }

  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "8");
  url.searchParams.set("printType", "books");
  url.searchParams.set("key", GOOGLE_BOOKS_API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error("Google Books fetch failed", res.status);
    return [];
  }
  const data = await res.json();
  const items = data.items || [];
  const nowYear = new Date().getFullYear();

  return items.map(item => {
    const info = item.volumeInfo || {};
    const title = info.title || "Book";
    const authors = info.authors || [];
    const avgRating = Number(info.averageRating || 0);
    const ratingsCount = Number(info.ratingsCount || 0);
    let year = nowYear;
    if (info.publishedDate) {
      const match = info.publishedDate.match(/^(\d{4})/);
      if (match) year = Number(match[1]);
    }
    const ageYears = Math.max(1, nowYear - year + 1);
    const recencyScore = 1 / ageYears;

    const popularityScore = avgRating + Math.log10(ratingsCount + 1);
    const score = 0.5 * popularityScore + 0.5 * recencyScore;

    return {
      id: `book_${item.id}`,
      source: "book",
      title,
      url: info.infoLink || info.previewLink || "",
      description: info.description || "",
      thumbnail: info.imageLinks?.thumbnail || null,
      metrics: {
        authors,
        averageRating: avgRating,
        ratingsCount,
        publishedDate: info.publishedDate || null
      },
      score
    };
  });
}

// ====== COURSERA (LINK-BASED) ======
async function buildCourseraResources(query) {
  const url = `https://www.coursera.org/search?query=${encodeURIComponent(query)}`;
  return [
    {
      id: "coursera_search",
      source: "coursera",
      title: `Top Coursera courses for "${query}"`,
      url,
      description: "Open a curated list of Coursera courses related to this topic in a new tab.",
      thumbnail: null,
      metrics: {},
      score: 5.0
    }
  ];
}

const CACHE_CONTROL_MAX_AGE = 60;

const loadJsonCache = async (key) => {
  try {
    const { head } = await import("@vercel/blob");
    const blob = await head(key);
    const response = await fetch(blob.url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch (error) {
    return null;
  }
};

const saveJsonCache = async (key, payload) => {
  try {
    const { put } = await import("@vercel/blob");
    await put(key, JSON.stringify(payload, null, 2), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: CACHE_CONTROL_MAX_AGE,
    });
    return true;
  } catch (error) {
    console.error(`[blob-cache] save failed for ${key}`, error);
    return false;
  }
};

module.exports = {
  loadJsonCache,
  saveJsonCache,
};

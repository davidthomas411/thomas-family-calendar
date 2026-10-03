(() => {
  const HOCKEY_API_URL = "/api/calendar?source=hockey";
  const UPCOMING_DAYS = 30;
  const container = document.getElementById("upcoming-events");

  if (!container) return;

  const monthIndex = new Map(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      .map((month, index) => [month.toLowerCase(), index])
  );

  const startOfWeek = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    return start;
  };

  const upcomingRange = () => {
    const start = startOfWeek(new Date());
    start.setDate(start.getDate() + 7);
    const end = new Date(start);
    end.setDate(end.getDate() + UPCOMING_DAYS);
    return { start, end };
  };

  const parseEventStart = (event) => {
    if (!event || !event.startDate) return null;
    const time = event.startTime || "00:00";
    const value = new Date(`${event.startDate}T${time}:00`);
    return Number.isNaN(value.getTime()) ? null : value;
  };

  const parseRenderedStart = (item, rangeStart) => {
    if (item.dataset.sortTime) return new Date(Number(item.dataset.sortTime));
    const meta = item.querySelector(".upcoming-meta")?.textContent?.trim() || "";
    const match = meta.match(/^[A-Za-z]{3},\s+([A-Za-z]{3})\s+(\d{1,2})(?:\s+·\s+(\d{1,2}):(\d{2})\s+(AM|PM))?$/i);
    if (!match) return null;
    const month = monthIndex.get(match[1].toLowerCase());
    if (month == null) return null;
    let hour = Number(match[3] || 0);
    const minute = Number(match[4] || 0);
    const suffix = (match[5] || "").toUpperCase();
    if (suffix === "PM" && hour < 12) hour += 12;
    if (suffix === "AM" && hour === 12) hour = 0;
    let value = new Date(rangeStart.getFullYear(), month, Number(match[2]), hour, minute);
    if (value < rangeStart) value = new Date(rangeStart.getFullYear() + 1, month, Number(match[2]), hour, minute);
    return value;
  };

  const itemKey = (item, rangeStart) => {
    const start = parseRenderedStart(item, rangeStart);
    const title = item.querySelector(".upcoming-title")?.textContent?.trim().toLowerCase() || "";
    return `${start ? start.getTime() : ""}|${title}`;
  };

  const createItem = (event, start) => {
    const item = document.createElement("div");
    item.className = "upcoming-item lady-dragons-upcoming";
    item.dataset.sortTime = `${start.getTime()}`;

    const meta = document.createElement("div");
    meta.className = "upcoming-meta";
    const dateLabel = start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    const timeLabel = event.allDay
      ? ""
      : start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    meta.textContent = timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;

    const title = document.createElement("div");
    title.className = "upcoming-title";
    title.textContent = event.summary || "K · Lady Dragons";

    item.append(meta, title);
    return item;
  };

  let ladyDragons = [];
  let syncing = false;

  const sync = () => {
    if (syncing || !ladyDragons.length) return;
    syncing = true;
    try {
      const { start: rangeStart, end: rangeEnd } = upcomingRange();
      const existing = [...container.querySelectorAll(".upcoming-item:not(.lady-dragons-upcoming)")];
      const existingKeys = new Set(existing.map((item) => itemKey(item, rangeStart)));
      const additions = ladyDragons
        .map((event) => ({ event, start: parseEventStart(event) }))
        .filter(({ start }) => start && start >= rangeStart && start < rangeEnd)
        .map(({ event, start }) => createItem(event, start))
        .filter((item) => !existingKeys.has(itemKey(item, rangeStart)));
      const combined = [...existing, ...additions].sort((left, right) => {
        const leftStart = parseRenderedStart(left, rangeStart);
        const rightStart = parseRenderedStart(right, rangeStart);
        return (leftStart?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (rightStart?.getTime() ?? Number.MAX_SAFE_INTEGER);
      });
      const current = [...container.querySelectorAll(".upcoming-item")];
      const currentSignature = current.map((item) => itemKey(item, rangeStart)).join("\n");
      const nextSignature = combined.map((item) => itemKey(item, rangeStart)).join("\n");
      if (currentSignature !== nextSignature) container.replaceChildren(...combined);
    } finally {
      syncing = false;
    }
  };

  const observer = new MutationObserver(sync);
  observer.observe(container, { childList: true });

  const load = async () => {
    try {
      const response = await fetch(HOCKEY_API_URL, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      ladyDragons = (Array.isArray(data.events) ? data.events : [])
        .filter((event) => /^K\s*·\s*Lady Dragons\b/i.test(event.summary || ""));
      sync();
    } catch (error) {
      // Keep the dashboard usable when the optional hockey feed is unavailable.
    }
  };

  load();
  setInterval(load, 10 * 60 * 1000);
})();

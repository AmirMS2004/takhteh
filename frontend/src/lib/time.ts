const relative = new Intl.RelativeTimeFormat("fa", { numeric: "auto" });

/** A server time ("YYYY-MM-DD HH:MM:SS", UTC) in Persian relative to now: "۵ دقیقه پیش", "دیروز", ... */
export function timeAgo(utc: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(utc.replace(" ", "T") + "Z") - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
  ];
  let value = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return unit === "second" ? "همین حالا" : relative.format(value, unit);
    value = Math.round(value / size);
  }
  return new Date(Date.parse(utc.replace(" ", "T") + "Z")).toLocaleDateString("fa-IR", { day: "numeric", month: "long" });
}

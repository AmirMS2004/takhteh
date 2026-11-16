import type { I18n } from "./i18n";

/** A server time ("YYYY-MM-DD HH:MM:SS", UTC) relative to now: "۵ دقیقه پیش" / "5 minutes ago", "دیروز", ... */
export function timeAgo(utc: string, { t, locale }: I18n, now = Date.now()): string {
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const at = Date.parse(utc.replace(" ", "T") + "Z");
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
  ];
  let value = Math.round((at - now) / 1000);
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return unit === "second" ? t("time.justNow") : relative.format(value, unit);
    value = Math.round(value / size);
  }
  return new Date(at).toLocaleDateString(locale, { day: "numeric", month: "long" });
}

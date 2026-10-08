// Festival times are local to Ghent (CEST during the festival).
export const screeningDate = (date: string, time: string) => new Date(`${date}T${time}:00+02:00`);

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/Brussels" });
const weekdayLong = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/Brussels" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Brussels" });

const noon = (date: string) => new Date(`${date}T12:00:00+02:00`);
export const fmtWeekday = (date: string) => weekday.format(noon(date));
export const fmtWeekdayLong = (date: string) => weekdayLong.format(noon(date));
export const fmtDayMonth = (date: string) => dayMonth.format(noon(date));
export const dayNumber = (date: string) => Number(date.slice(8, 10));

export function relativeDay(date: string, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(now);
  const diff = Math.round((noon(date).getTime() - noon(today).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `${fmtWeekday(date)} ${dayNumber(date)}`;
}

export const fmtRuntime = (m: number | null) => (m ? (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}` : `${m} min`) : null);

export const fmtVotes = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

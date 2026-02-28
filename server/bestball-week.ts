import type { League } from "@shared/schema";

const MLB_TIME_ZONE = "America/New_York";

function formatYmdFromDateParts(parts: Intl.DateTimeFormatPart[]): string {
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function getMlbDateKey(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MLB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatYmdFromDateParts(formatter.formatToParts(date));
}

function parseYmdAsUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function formatYmdUtc(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(ymd: string, days: number): string {
  const d = parseYmdAsUtc(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return formatYmdUtc(d);
}

function startOfMlbWeek(ymd: string): string {
  const d = parseYmdAsUtc(ymd);
  const day = d.getUTCDay(); // Sun=0, Mon=1
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return formatYmdUtc(d);
}

function diffDays(startYmd: string, endYmd: string): number {
  const start = parseYmdAsUtc(startYmd).getTime();
  const end = parseYmdAsUtc(endYmd).getTime();
  return Math.floor((end - start) / (24 * 60 * 60 * 1000));
}

export interface BestBallWeekContext {
  anchorWeekStart: string;
  currentWeekStart: string;
  currentWeekEnd: string;
  currentWeekNumber: number;
  previousWeekStart: string | null;
  previousWeekEnd: string | null;
}

export function getBestBallWeekContext(league: League, now: Date = new Date()): BestBallWeekContext {
  const anchorSource = league.draftDate
    ? new Date(league.draftDate)
    : league.createdAt ?? new Date();
  const anchorDateKey = getMlbDateKey(anchorSource);
  const anchorWeekStart = startOfMlbWeek(anchorDateKey);

  const nowDateKey = getMlbDateKey(now);
  const inferredCurrentWeek = startOfMlbWeek(nowDateKey);
  const currentWeekStart = diffDays(anchorWeekStart, inferredCurrentWeek) < 0
    ? anchorWeekStart
    : inferredCurrentWeek;
  const currentWeekEnd = addDays(currentWeekStart, 6);

  const weekOffset = Math.max(0, Math.floor(diffDays(anchorWeekStart, currentWeekStart) / 7));
  const currentWeekNumber = weekOffset + 1;

  const previousWeekStartCandidate = addDays(currentWeekStart, -7);
  const hasPreviousWeek = diffDays(anchorWeekStart, previousWeekStartCandidate) >= 0;

  return {
    anchorWeekStart,
    currentWeekStart,
    currentWeekEnd,
    currentWeekNumber,
    previousWeekStart: hasPreviousWeek ? previousWeekStartCandidate : null,
    previousWeekEnd: hasPreviousWeek ? addDays(previousWeekStartCandidate, 6) : null,
  };
}

export function listCompletedWeekStarts(league: League, now: Date = new Date()): string[] {
  const ctx = getBestBallWeekContext(league, now);
  const starts: string[] = [];
  if (!ctx.previousWeekStart) return starts;

  let cursor = ctx.anchorWeekStart;
  while (diffDays(cursor, ctx.previousWeekStart) >= 0) {
    starts.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return starts;
}

export function addDaysToYmd(ymd: string, days: number): string {
  return addDays(ymd, days);
}

export function weekNumberFromAnchor(anchorWeekStart: string, weekStart: string): number {
  return Math.floor(diffDays(anchorWeekStart, weekStart) / 7) + 1;
}

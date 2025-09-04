export function normalizeFrontmatterDate(input: unknown): Date {
  const str = typeof input === "string" ? input : String(input); // Treat Date objects as strings

  const match = str.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (match) {
    const [_, y, m, d, h, min, s] = match;
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(h),
      Number(min),
      Number(s ?? "0")
    );
  }

  return new Date(); // fallback
}

export function toUtcIsoString(date: Date): string {
  return date.toISOString().split(".")[0] + "Z";
}

export function toLocalDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

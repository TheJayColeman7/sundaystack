import { parse } from "csv-parse/sync";

export type CsvRow = Record<string, string | undefined>;

const USER_AGENT = "sundaystack/0.1 (fantasy-sports; +https://github.com/TheJayColeman7/sundaystack)";

export async function downloadCsv(url: string): Promise<CsvRow[]> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/csv,text/plain,*/*" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as CsvRow[];
}

export async function downloadCsvIfPresent(url: string): Promise<CsvRow[] | null> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/csv,text/plain,*/*" },
    redirect: "follow",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as CsvRow[];
}

export async function downloadCsvWithFallback(urls: readonly string[]): Promise<CsvRow[]> {
  let lastError: unknown;
  for (const url of urls) {
    try {
      return await downloadCsv(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All CSV URLs failed");
}

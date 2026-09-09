// One-off fetch script: pulls the public scheme listing from SupportGoWhere's underlying
// CMS listing API (the same endpoint https://supportgowhere.life.gov.sg embeds in an iframe)
// and writes a deduped reference JSON file per requested category.
//
// This is a RAW REFERENCE PULL, not curated engine data — see data/reference/README.md.
// Run with: npx tsx scripts/fetch-supportgowhere.ts

import { writeFile } from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://www.ccube.gov.sg/coordinator/api/resources/v1";

// bc_domains values, as used by https://supportgowhere.life.gov.sg/topics/<slug> pages.
const CATEGORIES: Record<string, string> = {
  caregiving_support: "CAREGIVING_SUPPORT",
  financial_support_and_benefits: "FINANCIAL_SUPPORT",
  disability_support: "DISABILITY_SUPPORT",
  healthcare_and_wellbeing: "HEALTHCARE",
  family_parenting_and_relationships: "FAMILY_PARENTING",
};

interface RawResource {
  id: string;
  title?: string;
  description?: string;
  keywords?: string[];
  domainsFriendlyIds?: string[];
}

interface CatalogEntry {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  domains: string[];
  detailUrl: string;
}

async function fetchDomain(domain: string): Promise<RawResource[]> {
  const url = `${API_BASE}?domains=${domain}&page=1&lang=en&serviceId=sgw-cms&limit=1000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch domain ${domain}: HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { resources?: RawResource[] } };
  return json.data?.resources ?? [];
}

async function main() {
  const byId = new Map<string, CatalogEntry>();
  const perCategory: Record<string, string[]> = {};

  for (const [categoryKey, domain] of Object.entries(CATEGORIES)) {
    const resources = await fetchDomain(domain);
    perCategory[categoryKey] = resources.map((r) => r.id);
    for (const r of resources) {
      if (byId.has(r.id)) continue;
      byId.set(r.id, {
        id: r.id,
        title: (r.title ?? "").trim(),
        description: (r.description ?? "").trim(),
        keywords: r.keywords ?? [],
        domains: r.domainsFriendlyIds ?? [],
        detailUrl: `https://supportgowhere.life.gov.sg/schemes/${r.id}`,
      });
    }
    console.log(`${categoryKey} (${domain}): ${resources.length} resources`);
  }

  const outPath = path.join(import.meta.dirname, "..", "data", "reference", "supportgowhere-raw.json");
  const output = {
    fetchedAt: new Date().toISOString(),
    source: "https://www.ccube.gov.sg/coordinator/api/resources/v1 (embedded by https://supportgowhere.life.gov.sg)",
    categories: perCategory,
    uniqueSchemeCount: byId.size,
    schemes: [...byId.values()].sort((a, b) => a.title.localeCompare(b.title)),
  };

  await writeFile(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${byId.size} unique schemes to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

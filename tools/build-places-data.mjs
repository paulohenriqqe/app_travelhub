#!/usr/bin/env node
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL = "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries+states+cities.json";
const OUT_DIR = path.resolve("assets/data/places");
const ATTRIBUTION = "Data by Countries States Cities Database (https://github.com/dr5hn/countries-states-cities-database), licensed under ODbL v1.0.";

function toNumber(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(6)) : null;
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function displayCountryName(country) {
  return clean(country?.translations?.["pt-BR"] || country?.translations?.pt || country?.name || country?.iso2);
}

function comparePt(a, b) {
  return String(a || "").localeCompare(String(b || ""), "pt-BR");
}

function simplifyCity(city, stateCode) {
  const name = clean(city.name);
  if (!name) return null;
  return {
    name,
    stateCode,
    lat: toNumber(city.latitude),
    lng: toNumber(city.longitude)
  };
}

function simplifyState(state) {
  const code = clean(state.iso2 || state.state_code || state.code || state.name);
  const cities = (state.cities || [])
    .map(city => simplifyCity(city, code))
    .filter(Boolean)
    .sort((a, b) => comparePt(a.name, b.name));

  return {
    id: state.id ?? null,
    code,
    name: clean(state.name || code),
    cities
  };
}

async function main() {
  console.log(`Downloading ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Failed to download source: ${response.status} ${response.statusText}`);
  const countries = await response.json();

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const index = {
    source: "countries-states-cities-database",
    attribution: ATTRIBUTION,
    generatedAt: new Date().toISOString(),
    countries: []
  };

  let cityCount = 0;
  for (const country of countries) {
    const iso2 = clean(country.iso2).toUpperCase();
    if (!iso2) continue;

    const states = (country.states || [])
      .map(simplifyState)
      .filter(state => state.name || state.code)
      .sort((a, b) => comparePt(a.name, b.name));

    cityCount += states.reduce((sum, state) => sum + state.cities.length, 0);

    index.countries.push({
      iso2,
      iso3: clean(country.iso3).toUpperCase(),
      name: clean(country.name),
      displayName: displayCountryName(country),
      states: states.map(({ id, code, name }) => ({ id, code, name }))
    });

    await writeFile(
      path.join(OUT_DIR, `${iso2}.json`),
      JSON.stringify({ countryCode: iso2, states }),
      "utf8"
    );
  }

  index.countries.sort((a, b) => comparePt(a.displayName, b.displayName));
  await writeFile(path.join(OUT_DIR, "index.json"), JSON.stringify(index), "utf8");
  await writeFile(path.join(OUT_DIR, "ATTRIBUTION.txt"), `${ATTRIBUTION}\n`, "utf8");

  console.log(`Generated ${index.countries.length} countries and ${cityCount} cities in ${OUT_DIR}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL = "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries+states+cities.json";
const IBGE_MUNICIPALITIES_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";
const BRAZIL_COORDS_URL = "https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv";
const OUT_DIR = path.resolve("assets/data/places");
const ATTRIBUTION = "Data by Countries States Cities Database (https://github.com/dr5hn/countries-states-cities-database), licensed under ODbL v1.0. Brazilian municipality list by IBGE. Brazilian municipality coordinates by kelvins/Municipios-Brasileiros, licensed under MIT.";

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

function normalizeKey(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

function buildBrazilSourceCityLookup(country) {
  const lookup = new Map();
  (country.states || []).forEach(state => {
    const stateCode = clean(state.iso2 || state.state_code || state.code || state.name).toUpperCase();
    (state.cities || []).forEach(city => {
      const simplified = simplifyCity(city, stateCode);
      if (!simplified) return;
      lookup.set(`${stateCode}:${normalizeKey(simplified.name)}`, simplified);
    });
  });
  return lookup;
}

async function loadBrazilCoordinates() {
  console.log(`Downloading ${BRAZIL_COORDS_URL}`);
  const response = await fetch(BRAZIL_COORDS_URL);
  if (!response.ok) throw new Error(`Failed to download Brazilian coordinates: ${response.status} ${response.statusText}`);

  const lines = (await response.text()).trim().split(/\r?\n/).slice(1);
  const coordinates = new Map();
  lines.forEach(line => {
    const [ibgeCode, , latitude, longitude] = line.split(",");
    const lat = toNumber(latitude);
    const lng = toNumber(longitude);
    if (ibgeCode && lat !== null && lng !== null) {
      coordinates.set(String(ibgeCode), { lat, lng });
    }
  });
  return coordinates;
}

async function buildBrazilStatesFromIbge(country) {
  console.log(`Downloading ${IBGE_MUNICIPALITIES_URL}`);
  const response = await fetch(IBGE_MUNICIPALITIES_URL);
  if (!response.ok) throw new Error(`Failed to download IBGE municipalities: ${response.status} ${response.statusText}`);

  const municipalities = await response.json();
  const coordinatesByIbge = await loadBrazilCoordinates();
  const sourceCities = buildBrazilSourceCityLookup(country);
  const stateMap = new Map();

  municipalities.forEach(municipality => {
    const uf = municipality?.microrregiao?.mesorregiao?.UF;
    const code = clean(uf?.sigla).toUpperCase();
    const cityName = clean(municipality?.nome);
    if (!code || !cityName) return;

    if (!stateMap.has(code)) {
      stateMap.set(code, {
        id: uf?.id ?? null,
        code,
        name: clean(uf?.nome || code),
        cities: []
      });
    }

    const sourceCity = sourceCities.get(`${code}:${normalizeKey(cityName)}`);
    const officialCoordinates = coordinatesByIbge.get(String(municipality.id));
    stateMap.get(code).cities.push({
      name: cityName,
      stateCode: code,
      lat: officialCoordinates?.lat ?? sourceCity?.lat ?? null,
      lng: officialCoordinates?.lng ?? sourceCity?.lng ?? null
    });
  });

  return Array.from(stateMap.values())
    .map(state => ({
      ...state,
      cities: state.cities.sort((a, b) => comparePt(a.name, b.name))
    }))
    .sort((a, b) => comparePt(a.name, b.name));
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

    const states = iso2 === "BR"
      ? await buildBrazilStatesFromIbge(country)
      : (country.states || [])
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

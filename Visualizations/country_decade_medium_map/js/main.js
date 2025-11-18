// main.js – Country × Decade × Medium choropleth with centroid highlights
//
// Expected CSV: data/counts_by_country_decade_medium.csv
// Columns (flexible – auto-detected):
//   country       – origin country name
//   decade        – numeric decade (e.g. 1890)
//   medium_group  – canonical medium category
//   n_objects     – count
//   region        – optional, not required by the viz
//

const WORLD_TOPOJSON_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const DATA_CSV = "data/counts_by_country_decade_medium.csv";

// Reasonable decade bounds
const MIN_DECADE = 1400;
const MAX_DECADE = 2020;

// How many medium categories to expose in the dropdown
const MAX_MEDIUMS = 5;

const state = {
  decadeIndex: 0,
  decades: [],
  medium: "ALL",
};

const dataStore = {
  rows: [],        // cleaned rows
  decades: [],
  mediums: [],     // all canonical mediums
  topMediums: [],  // top N mediums by total count
};

let tooltip;

// Country name fixes from data → world-atlas names
const COUNTRY_NAME_FIXES = {
  "United States": "United States of America",
  "USA": "United States of America",
  "U.S.A.": "United States of America",

  "Democratic Republic of the Congo": "Dem. Rep. Congo",
  "Congo, Democratic Republic of the": "Dem. Rep. Congo",

  "Iran, Islamic Republic of": "Iran",
  "Syrian Arab Republic": "Syria",

  "Ivory Coast": "Côte d'Ivoire",
  "Cote d'Ivoire": "Côte d'Ivoire",

  "Korea": "South Korea",
  "Korea, unspecified": "South Korea",
  "Korea (South)": "South Korea",
  "Korea (North)": "North Korea",
  "Republic of Korea": "South Korea",
  "Korea, Republic of": "South Korea",
  "Democratic People's Republic of Korea": "North Korea",
};

document.addEventListener("DOMContentLoaded", () => {
  tooltip = d3.select("body")
    .append("div")
    .attr("class", "tt-tooltip");

  Promise.all([
    d3.json(WORLD_TOPOJSON_URL),
    d3.csv(DATA_CSV, d3.autoType),
  ])
    .then(([world, rows]) => {
      prepareData(rows);
      initControls();
      drawBaseMap(world);
      updateAll();
    })
    .catch((err) => {
      console.error("Error loading map or data:", err);
      alert("Error loading the world map or data CSV. Open the console for details.");
    });
});

// ---------------------------
// Data prep
// ---------------------------

function pickColumn(columns, candidates, fallback) {
  for (const c of candidates) {
    if (columns.includes(c)) return c;
  }
  return fallback;
}

function canonicalCountryName(name) {
  if (!name) return null;
  const trimmed = String(name).trim();
  if (!trimmed) return null;
  if (COUNTRY_NAME_FIXES.hasOwnProperty(trimmed)) {
    return COUNTRY_NAME_FIXES[trimmed];
  }
  return trimmed;
}

function prepareData(rows) {
  if (!rows || !rows.length) {
    throw new Error("Data CSV is empty or missing rows.");
  }

  const columns = rows.columns || Object.keys(rows[0]);

  const countryCol = pickColumn(columns, ["country", "Country", "origin_country_std"], "country");
  const decadeCol = pickColumn(columns, ["decade", "Decade"], "decade");
  const mediumCol = pickColumn(columns, ["medium_group", "Medium_group", "medium_std", "classification_std"], "medium_group");
  const countCol = pickColumn(columns, ["n_objects", "count", "N"], "n_objects");

  const cleaned = rows
    .map((d) => {
      const countryRaw = d[countryCol];
      const country = canonicalCountryName(countryRaw);
      const decade = +d[decadeCol];
      const mediumRaw = d[mediumCol];
      const medium = mediumRaw ? String(mediumRaw).trim() : "Other";
      const n_objects = +d[countCol] || 0;

      if (!country || Number.isNaN(decade) || n_objects <= 0) return null;
      if (decade < MIN_DECADE || decade > MAX_DECADE) return null;

      return {
        country,
        decade,
        medium,
        n_objects,
      };
    })
    .filter((d) => d);

  dataStore.rows = cleaned;

  // decades
  const decades = Array.from(new Set(cleaned.map((d) => d.decade))).sort(d3.ascending);
  dataStore.decades = decades;
  state.decades = decades;
  state.decadeIndex = decades.length - 1;

  // mediums: compute totals and pick top N
  const mediumTotals = d3
    .rollups(
      cleaned,
      (v) => d3.sum(v, (d) => d.n_objects),
      (d) => d.medium
    )
    .sort((a, b) => d3.descending(a[1], b[1]));

  const topMediums = mediumTotals.slice(0, MAX_MEDIUMS).map((d) => d[0]);
  dataStore.mediums = mediumTotals.map((d) => d[0]);
  dataStore.topMediums = topMediums;
}

// ---------------------------
// Controls
// ---------------------------

function initControls() {
  // decade slider
  const slider = d3.select("#decade-slider");
  slider
    .attr("min", 0)
    .attr("max", state.decades.length - 1)
    .attr("step", 1)
    .property("value", state.decadeIndex);

  slider.on("input", (event) => {
    state.decadeIndex = +event.target.value;
    updateAll();
  });

  updateDecadeLabel();

  // medium dropdown
  const mediumSelect = d3.select("#medium-select");
  mediumSelect.selectAll("option").remove();

  const options = ["ALL", ...dataStore.topMediums];

  mediumSelect
    .selectAll("option")
    .data(options)
    .join("option")
    .attr("value", (d) => d)
    .text((d) => (d === "ALL" ? "All media" : d));

  mediumSelect.on("change", (event) => {
    state.medium = event.target.value;
    updateAll();
  });
}

function updateDecadeLabel() {
  const decade = state.decades[state.decadeIndex];
  const label = decade ? `${decade}s` : "—";
  d3.select("#decade-label").text(`Decade: ${label}`);
}

// ---------------------------
// Map drawing
// ---------------------------

function drawBaseMap(world) {
  const svg = d3.select("#country-map");
  const { width, height } = svg.node().getBoundingClientRect();
  svg.selectAll("*").remove();

  const margin = { top: 10, right: 10, bottom: 10, left: 10 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const countries = topojson.feature(world, world.objects.countries);

  const projection = d3.geoNaturalEarth1().fitSize([innerWidth, innerHeight], countries);
  const path = d3.geoPath(projection);

  // base land
  g.append("g")
    .selectAll("path")
    .data(countries.features)
    .join("path")
    .attr("class", "land")
    .attr("d", path);

  const countryFeatures = countries.features.map((f) => {
    const name = f.properties.name;
    const canonical = canonicalCountryName(name);
    f.properties.tt_name = canonical || name;
    return f;
  });

  const countryLayer = g.append("g").attr("class", "country-layer");
  countryLayer
    .selectAll("path")
    .data(countryFeatures)
    .join("path")
    .attr("class", "country-shape")
    .attr("d", path);

  const centroidLayer = g.append("g").attr("class", "centroid-layer");

  svg.node().__ctx = { g, projection, path, countryFeatures, centroidLayer };
}

// ---------------------------
// Update logic
// ---------------------------

function updateAll() {
  updateDecadeLabel();
  shadeCountries();
  updateSummary();
}

function shadeCountries() {
  const svg = d3.select("#country-map");
  const ctx = svg.node().__ctx;
  if (!ctx) return;
  const { countryFeatures, projection, centroidLayer } = ctx;

  const decade = state.decades[state.decadeIndex];
  const rows = dataStore.rows.filter((d) => d.decade === decade);

  const filtered = rows.filter(
    (d) => state.medium === "ALL" || d.medium === state.medium
  );

  const byCountry = d3.rollups(
    filtered,
    (v) => d3.sum(v, (d) => d.n_objects),
    (d) => d.country
  );

  const valueByName = new Map(byCountry);
  const maxVal = d3.max(byCountry, (d) => d[1]) || 1;

  const color = d3
    .scaleSequential()
    .domain([0, maxVal])
    .interpolator((t) => d3.interpolateRgb("#F2F1E3", "#B73247")(t));

  // shade countries
  svg
    .select(".country-layer")
    .selectAll(".country-shape")
    .attr("fill", (f) => {
      const name = f.properties.tt_name;
      const val = valueByName.get(name) || 0;
      return val > 0 ? color(val) : "#F2F1E3";
    })
    .on("mousemove", (event, f) => {
      const name = f.properties.tt_name;
      const val = valueByName.get(name) || 0;
      if (!val) {
        hideTooltip();
        return;
      }
      const total = d3.sum(byCountry, (d) => d[1]);
      const share = total > 0 ? val / total : 0;

      const html = `
        <strong>${name}</strong><br/>
        Decade: ${decade}s<br/>
        Objects: ${d3.format(",")(val)}<br/>
        Share of selected view: ${d3.format(".0%")(share)}
      `;
      showTooltip(html, event);
    })
    .on("mouseleave", hideTooltip);

  // centroid highlights
  const dotData = countryFeatures
    .map((f) => {
      const name = f.properties.tt_name;
      const val = valueByName.get(name) || 0;
      if (!val) return null;
      const centroid = d3.geoCentroid(f);
      const [x, y] = projection(centroid);
      return { name, value: val, x, y };
    })
    .filter((d) => d);

  const radiusScale = d3
    .scaleSqrt()
    .domain([0, maxVal])
    .range([2, 9]);

  const dots = centroidLayer.selectAll("circle").data(dotData, (d) => d.name);

  dots
    .join(
      (enter) =>
        enter
          .append("circle")
          .attr("class", "centroid-dot")
          .attr("cx", (d) => d.x)
          .attr("cy", (d) => d.y)
          .attr("r", 0)
          .call((enter) =>
            enter
              .transition()
              .duration(300)
              .attr("r", (d) => radiusScale(d.value))
          ),
      (update) =>
        update.call((update) =>
          update
            .transition()
            .duration(300)
            .attr("cx", (d) => d.x)
            .attr("cy", (d) => d.y)
            .attr("r", (d) => radiusScale(d.value))
        ),
      (exit) =>
        exit.call((exit) =>
          exit
            .transition()
            .duration(200)
            .attr("r", 0)
            .remove()
        )
    );

  renderLegend(maxVal);
}

function renderLegend(maxVal) {
  const legend = d3.select("#map-legend");
  legend.html("");

  legend.append("span").text("Fewer objects");
  legend.append("div").attr("class", "legend-gradient");
  legend
    .append("span")
    .text(`More objects (up to ${d3.format("~s")(maxVal)})`);
}

// ---------------------------
// Summary
// ---------------------------

function updateSummary() {
  const box = d3.select("#summary-box");
  const decade = state.decades[state.decadeIndex];
  const rows = dataStore.rows.filter((d) => d.decade === decade);

  const filtered = rows.filter(
    (d) => state.medium === "ALL" || d.medium === state.medium
  );

  if (!filtered.length) {
    box.html("<em>No objects in this view.</em>");
    return;
  }

  const total = d3.sum(filtered, (d) => d.n_objects);

  const byCountry = d3
    .rollups(
      filtered,
      (v) => d3.sum(v, (d) => d.n_objects),
      (d) => d.country
    )
    .sort((a, b) => d3.descending(a[1], b[1]));

  let html = `Decade: <strong>${decade}s</strong><br/>`;
  html += `Medium: <strong>${
    state.medium === "ALL" ? "All media" : state.medium
  }</strong><br/>`;
  html += `Total objects (current filters): <strong>${d3.format(",")(total)}</strong><br/><br/>`;

  byCountry.slice(0, 6).forEach(([country, value]) => {
    const share = value / total;
    html += `${country}: ${d3.format(",")(value)} (${d3.format(".0%")(share)})<br/>`;
  });

  box.html(html);
}

// ---------------------------
// Tooltip helpers
// ---------------------------

function showTooltip(html, event) {
  tooltip
    .html(html)
    .style("left", event.clientX + 12 + "px")
    .style("top", event.clientY + 12 + "px")
    .style("opacity", 1);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

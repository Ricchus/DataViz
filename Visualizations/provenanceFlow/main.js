// main.js – Provenance Flow Map (robust version)

/*
Expected CSV: flows_country_to_museum.csv with columns:
  origin_country       e.g. "France", "United States", "Unknown origin", etc.
  region               broad region ("Europe", "Asia", "North America", "Unknown", …)
  museum               "MET" | "CMA" | "NGA"
  n_objects            number
  is_unknown_origin    (optional) 0/1, true/false, or absent
*/
document.addEventListener("DOMContentLoaded", function () {
  const svg = d3.select("#chart1")
    .append("svg")
    .attr("width", 300)
    .attr("height", 200);

  svg.append("circle")
    .attr("cx", 150)
    .attr("cy", 100)
    .attr("r", 50)
    .attr("fill", "skyblue");
});


const WORLD_TOPOJSON_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const FLOWS_CSV = "flows_country_to_museum.csv";

// Museum positions (lon, lat)
const MUSEUM_COORDS = {
  MET: { lon: -73.9632, lat: 40.7794 }, // NYC
  CMA: { lon: -81.6944, lat: 41.4993 }, // Cleveland
  NGA: { lon: -77.0199, lat: 38.8921 }, // DC
};

const MUSEUM_LABELS = {
  MET: "Metropolitan Museum of Art",
  CMA: "Cleveland Museum of Art",
  NGA: "National Gallery of Art",
};

const MUSEUM_COLORS = {
  MET: "#8ED0F6", // brand Color 1
  CMA: "#DB8E2F", // brand Color 3
  NGA: "#B73247"  // brand Color 4
};


// World-atlas country name fixes
const COUNTRY_NAME_FIXES = {
  "United States": "United States of America",
  "U.S.A.": "United States of America",
  USA: "United States of America",
  Russia: "Russian Federation",
  "Democratic Republic of the Congo": "Democratic Republic of the Congo",
  Iran: "Iran, Islamic Republic of",
  Syria: "Syrian Arab Republic",
  "Côte d'Ivoire": "Ivory Coast",
  "Korea": "South Korea",
  "Korea, unspecified": "South Korea",
  "Korea (South)": "South Korea",
  "Korea (North)": "North Korea",
  "Republic of Korea": "South Korea",
  "Korea, Republic of": "South Korea",
  "Korea, North": "North Korea",
  "Democratic People's Republic of Korea": "North Korea",
  "North Korea": "North Korea",
  "South Korea": "South Korea",
  // add more here if your console logs show unmapped names
};

// Fallback region centroids (lon, lat) for when a country name doesn't match
const REGION_COORDS = {
  "North America": [-100, 40],
  "Latin America & Caribbean": [-70, 0],
  "Europe": [10, 50],
  "Middle East & North Africa": [35, 25],
  "Sub-Saharan Africa": [20, -5],
  "Africa": [20, 5],
  "Asia": [90, 30],
  "Oceania": [150, -20],
  Unknown: [0, 10],
};

// Global state
const state = {
  museums: new Set(["MET", "CMA", "NGA"]),
  region: "ALL",
};

// Data store
const dataStore = {
  flows: [],
  countries: null,
  centroids: new Map(), // country → [lon, lat]
};

let tooltip;

// --------------------------------------------------
// Entry
// --------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tt-tooltip");

  try {
    const [world, flows] = await Promise.all([
      d3.json(WORLD_TOPOJSON_URL),
      d3.csv(FLOWS_CSV, d3.autoType),
    ]);

    dataStore.countries = topojson.feature(world, world.objects.countries);
    dataStore.flows = flows;

    buildCountryCentroids();
    initFilters();
    initLegend();
    drawBaseMap(); // will call redrawFlows()
  } catch (err) {
    console.error("Error loading world topojson or CSV:", err);
    alert(
      "There was an error loading the map or the flows CSV. Open the browser console for details."
    );
  }
});

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function buildCountryCentroids() {
  dataStore.countries.features.forEach((f) => {
    const name = f.properties.name;
    const centroid = d3.geoCentroid(f);
    dataStore.centroids.set(name, centroid);
  });
}

function getCountryCentroid(originCountry) {
  if (!originCountry) return null;
  let name = originCountry.trim();
  if (!name || name === "Unknown origin") return null;

  if (COUNTRY_NAME_FIXES[name]) {
    name = COUNTRY_NAME_FIXES[name];
  }
  const centroid = dataStore.centroids.get(name);
  if (!centroid) {
    // This will only show in console; it's a clue if you want to add more fixes
    console.warn("No centroid for", originCountry, "→ tried", name);
  }
  return centroid || null;
}

function isUnknownRow(d) {
  const originCountry = d.origin_country;
  const region = (d.region || "").toLowerCase();

  const unknownRegion =
    region === "unknown" || region === "unknown region";

  const unknownCountry =
    !originCountry ||
    originCountry === "Unknown origin" ||
    originCountry === "Unknown" ||
    originCountry === "unknown";

  const flag =
    unknownRegion ||
    unknownCountry ||
    d.is_unknown_origin === true ||
    d.is_unknown_origin === "true" ||
    d.is_unknown_origin === 1 ||
    d.is_unknown_origin === "1";

  return flag;
}


// --------------------------------------------------
// Filters & legend
// --------------------------------------------------

function initFilters() {
  // Museum checkboxes
  d3.selectAll(".museum-filter").on("change", function () {
    const val = this.value;
    if (this.checked) {
      state.museums.add(val);
    } else {
      state.museums.delete(val);
    }
    if (state.museums.size === 0) {
      state.museums.add(val);
      this.checked = true;
    }
    redrawFlows();
  });

  // Region options from data
  const regions = Array.from(
    new Set(
      dataStore.flows
        .map((d) => d.region)
        .filter((r) => r && r !== "")
    )
  ).sort(d3.ascending);

  const regionSelect = d3.select("#region-select");
  regions.forEach((r) => {
    regionSelect.append("option").attr("value", r).text(r);
  });

  regionSelect.on("change", (event) => {
    state.region = event.target.value;
    redrawFlows();
  });
}

function initLegend() {
  const legend = d3.select("#legend");
  legend.html("");

  const items = [
    { label: MUSEUM_LABELS.MET, color: MUSEUM_COLORS.MET },
    { label: MUSEUM_LABELS.CMA, color: MUSEUM_COLORS.CMA },
    { label: MUSEUM_LABELS.NGA, color: MUSEUM_COLORS.NGA },
  ];

  const li = legend
    .selectAll(".legend-item")
    .data(items)
    .join("div")
    .attr("class", "legend-item");

  li.append("div")
    .attr("class", "legend-swatch")
    .style("background", (d) => d.color);

  li.append("span").text((d) => d.label);
}

// --------------------------------------------------
// Map + flows
// --------------------------------------------------

function drawBaseMap() {
  const svg = d3.select("#provenance-viz");
  const { width, height } = svg.node().getBoundingClientRect();
  svg.selectAll("*").remove();

  const margin = { top: 10, right: 10, bottom: 10, left: 10 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const projection = d3
    .geoNaturalEarth1()
    .fitSize([innerWidth, innerHeight], dataStore.countries);

  const path = d3.geoPath(projection);

  const graticule = d3.geoGraticule();
  g.append("path")
    .datum(graticule())
    .attr("class", "graticule")
    .attr("d", path);

  g.append("g")
    .selectAll("path")
    .data(dataStore.countries.features)
    .join("path")
    .attr("class", "land")
    .attr("d", path);

  svg.node().__ctx = { g, projection };
  redrawFlows();
}

function redrawFlows() {
  const svg = d3.select("#provenance-viz");
  const ctx = svg.node().__ctx;
  if (!ctx) return;
  const { g, projection } = ctx;

  // Clear flow layers
  g.selectAll(".flow-layer").remove();
  g.selectAll(".origin-layer").remove();
  g.selectAll(".museum-layer").remove();

  let flows = dataStore.flows.filter((d) => state.museums.has(d.museum));

  if (state.region !== "ALL") {
    flows = flows.filter((d) => d.region === state.region);
  }

  const flowsKnown = flows.filter((d) => !isUnknownRow(d));
  const flowsUnknown = flows.filter((d) => isUnknownRow(d));

  updateUnknownBox(flowsUnknown);

  const maxN = d3.max(flowsKnown, (d) => d.n_objects) || 1;
  const widthScale = d3.scaleLinear().domain([0, maxN]).range([0.3, 4]);

  const flowLayer = g.append("g").attr("class", "flow-layer");
  const originLayer = g.append("g").attr("class", "origin-layer");
  const museumLayer = g.append("g").attr("class", "museum-layer");

  function museumPoint(museum) {
    const m = MUSEUM_COORDS[museum];
    const [x, y] = projection([m.lon, m.lat]);
    return { x, y };
  }

  function originPoint(row) {
    // Try real country centroid first
    let coord = getCountryCentroid(row.origin_country);

    // If that fails, fall back to region centroid
    if (!coord) {
      const region = row.region || "Unknown";
      coord = REGION_COORDS[region] || REGION_COORDS.Unknown;
    }

    const [x, y] = projection(coord);
    return { x, y };
  }

  const pathsData = [];
  flowsKnown.forEach((row) => {
    const origin = originPoint(row);
    const museum = museumPoint(row.museum);
    const value = row.n_objects || 0;

    const midX = (origin.x + museum.x) / 2;
    const midY = (origin.y + museum.y) / 2 - 40;

    const d = `M${origin.x},${origin.y} Q${midX},${midY} ${museum.x},${museum.y}`;
    pathsData.push({
      path: d,
      museum: row.museum,
      origin_country: row.origin_country,
      region: row.region,
      value,
    });
  });

  // Draw arcs
  flowLayer
    .selectAll("path")
    .data(pathsData)
    .join("path")
    .attr("class", (d) => `flow-link ${d.museum}`)
    .attr("d", (d) => d.path)
    .attr("stroke-width", (d) => widthScale(d.value))
    .on("mousemove", (event, d) => {
      const html = `
        <strong>${d.origin_country}</strong><br/>
        Region: ${d.region}<br/>
        → ${d.museum} (${MUSEUM_LABELS[d.museum]})<br/>
        ${d3.format(",")(d.value)} objects
      `;
      showTooltip(html, event);
    })
    .on("mouseleave", hideTooltip);

  // Origin dots (one per origin country)
  const byCountry = d3.group(flowsKnown, (d) => d.origin_country);
  const originDots = [];
  for (const [country, rows] of byCountry.entries()) {
    const sample = rows[0];
    const coord = originPoint(sample);
    const total = d3.sum(rows, (r) => r.n_objects || 0);
    originDots.push({ country, x: coord.x, y: coord.y, total });
  }

  originLayer
    .selectAll("circle")
    .data(originDots)
    .join("circle")
    .attr("class", "origin-dot")
    .attr("r", 2)
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .on("mousemove", (event, d) => {
      const html = `
        <strong>${d.country}</strong><br/>
        ${d3.format(",")(d.total)} objects (all selected museums)
      `;
      showTooltip(html, event);
    })
    .on("mouseleave", hideTooltip);

  // Museum dots + labels
  const museums = Array.from(state.museums);
  const museumDots = museums.map((m) => {
    const p = museumPoint(m);
    return { museum: m, x: p.x, y: p.y };
  });

  museumLayer
    .selectAll("circle")
    .data(museumDots)
    .join("circle")
    .attr("class", "museum-dot")
    .attr("r", 4)
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y);

  museumLayer
    .selectAll("text")
    .data(museumDots)
    .join("text")
    .attr("class", "museum-label")
    .attr("x", (d) => d.x + 5)
    .attr("y", (d) => d.y - 4)
    .text((d) => d.museum);
}

// --------------------------------------------------
// Unknown origins summary
// --------------------------------------------------

function updateUnknownBox(flowsUnknown) {
  const box = d3.select("#unknown-box");
  if (!flowsUnknown || !flowsUnknown.length) {
    box.html("<em>No unknown-origin objects in this view.</em>");
    return;
  }

  const byMuseum = d3.rollups(
    flowsUnknown,
    (v) => d3.sum(v, (d) => d.n_objects || 0),
    (d) => d.museum
  );
  const total = d3.sum(byMuseum, (d) => d[1]);

  let html = `Total: <strong>${d3.format(",")(total)}</strong><br/>`;
  byMuseum.forEach(([museum, n]) => {
    html += `${museum}: ${d3.format(",")(n)}<br/>`;
  });

  box.html(html);
}

// --------------------------------------------------
// Tooltip helpers
// --------------------------------------------------

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

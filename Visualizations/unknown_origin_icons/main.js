// main.js – Unknown origin isotype visualization (improved)
//
// Expects: data/types_by_region_country.csv
// Columns:
//   region        – broad region label (e.g. "Europe", "Asia", "Unknown")
//   country       – origin country (not used directly here)
//   type_group    – object type (Prints, Drawings, etc.)
//   n_objects     – count of objects
//

const DATA_CSV = "data/types_by_region_country.csv";
const TARGET_MAX_ICONS = 40; // rough target; actual depends on height

const state = {
  showUnknown: false
};

const dataStore = {
  rows: [],           // {region, type, n_objects}
  regions: [],
  topTypes: []        // all canonical types we end up with
};

let tooltip;

// Normalize synonyms / duplicates into canonical type labels.
// Any mapping to null means "drop this category entirely".
const TYPE_SYNONYMS = {
  "print": "Prints",
  "prints": "Prints",
  "prints|ephemera": "Prints",
  "prints & ephemera": "Prints",
  "print / ephemera": "Prints",

  "photograph": "Photographs",
  "photographs": "Photographs",
  "photo": "Photographs",
  "photos": "Photographs",

  "painting": "Paintings",
  "paintings": "Paintings",

  "drawing": "Drawings",
  "drawings": "Drawings",
  "watercolor": "Drawings",
  "watercolour": "Drawings",
  "watercolours": "Drawings",

  "sculpture": "Sculpture",
  "sculptures": "Sculpture",

  "textile": "Textiles",
  "textiles": "Textiles",

  "decorative arts": "Decorative arts",
  "decorative art": "Decorative arts",

  "index of american design": null // explicitly dropped
};

// Icons to use for canonical types
const ICON_FOR_TYPE = {
  "Paintings": "🖼️",
  "Prints": "🖨️",
  "Photographs": "📷",
  "Drawings": "✏️",
  "Sculpture": "🗿",
  "Textiles": "🧵",
  "Decorative arts": "🏺",
  "Other": "❓",
  "Ceramics": "🏺",
  "Pottery": "🏺",
  "Vessels": "🏺",
  "Vases": "🏺"
};

document.addEventListener("DOMContentLoaded", () => {
  tooltip = d3.select("body")
    .append("div")
    .attr("class", "tt-tooltip");

  d3.csv(DATA_CSV, d3.autoType)
    .then(rows => {
      prepareData(rows);
      initControls();
      renderAll();
    })
    .catch(err => {
      console.error("Error loading CSV", err);
      alert("Error loading types_by_region_country.csv. Check console for details.");
    });
});

// ---------------------------
// Data preparation
// ---------------------------

function normalizeType(label) {
  if (!label) return null;
  const raw = String(label).trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(TYPE_SYNONYMS, lower)) {
    return TYPE_SYNONYMS[lower]; // may be null => drop
  }
  return raw; // keep as-is if not in synonyms
}

function prepareData(rows) {
  if (!rows || !rows.length) {
    throw new Error("Data CSV is empty or missing rows.");
  }

  const columns = rows.columns || Object.keys(rows[0]);
  const regionCol = pickColumn(columns, ["region", "Region"], "region");
  const typeCol = pickColumn(columns, ["type_group", "Type_group", "classification_std"], "type_group");
  const countCol = columns.includes("n_objects") ? "n_objects" : null;

  const unknownLabels = new Set(["unknown", "unknown region", "unknown origin"]);

  const cleaned = rows.map(d => {
    let region = String(d[regionCol] ?? "").trim();
    let typeRaw = String(d[typeCol] ?? "").trim();

    if (!typeRaw) return null;

    // normalize region
    if (!region) region = "Unknown origin";
    const lowerRegion = region.toLowerCase();
    if (unknownLabels.has(lowerRegion)) {
      region = "Unknown origin";
    }

    // normalize type
    const type = normalizeType(typeRaw);
    if (!type) return null; // dropped category

    const n = countCol ? (+d[countCol] || 0) : 1;
    if (n <= 0) return null;

    return {
      region,
      type,
      n_objects: n
    };
  }).filter(d => d);

  // aggregate to region × type
  const groupedRT = d3.rollups(
    cleaned,
    v => d3.sum(v, d => d.n_objects),
    d => d.region,
    d => d.type
  );

  const regionTypeCounts = [];
  groupedRT.forEach(([region, typeEntries]) => {
    typeEntries.forEach(([type, n]) => {
      regionTypeCounts.push({ region, type, n_objects: n });
    });
  });

  // canonical type list, ordered by global weight
  const typeTotals = d3.rollups(
    regionTypeCounts,
    v => d3.sum(v, d => d.n_objects),
    d => d.type
  ).sort((a, b) => d3.descending(a[1], b[1]));

  // ✅ keep only the top 5 canonical types
  const MAX_TYPES = 5;
  const topTypes = typeTotals.slice(0, MAX_TYPES).map(d => d[0]);

  // Filter the region/type counts to only those top types
  const filteredCounts = regionTypeCounts.filter(d => topTypes.includes(d.type));


  // region list, with "Unknown origin" forced to last if present
  let regions = Array.from(new Set(regionTypeCounts.map(d => d.region)));
  const knownRegions = regions.filter(r => r !== "Unknown origin").sort(d3.ascending);
  const hasUnknown = regions.includes("Unknown origin");
  regions = knownRegions;
  if (hasUnknown) regions.push("Unknown origin");

  dataStore.rows = filteredCounts;
  dataStore.topTypes = topTypes;
  dataStore.regions = regions;
}

function pickColumn(columns, candidates, fallback) {
  if (!columns) return fallback;
  for (const c of candidates) {
    if (columns.includes(c)) return c;
  }
  return fallback;
}

// ---------------------------
// Controls
// ---------------------------

function initControls() {
  const toggle = d3.select("#toggle-unknown");
  toggle.property("checked", false);
  state.showUnknown = false;

  toggle.on("change", function () {
    state.showUnknown = this.checked;
    renderAll();
  });
}

// ---------------------------
// Rendering
// ---------------------------

function renderAll() {
  renderIcons();
}

function renderIcons() {
  const svg = d3.select("#unknown-origin-viz");
  const { width, height } = svg.node().getBoundingClientRect();
  svg.selectAll("*").remove();

  const margin = { top: 30, right: 20, bottom: 80, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  if (innerWidth <= 0 || innerHeight <= 0) return;

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const allRegions = dataStore.regions;
  const knownRegions = allRegions.filter(r => r !== "Unknown origin");
  const regions = state.showUnknown ? allRegions : knownRegions;

  if (!regions.length) {
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#6b5a3e")
      .text("No data to display.");
    return;
  }

  const topTypes = dataStore.topTypes;
  const rows = dataStore.rows.filter(d => regions.includes(d.region));

  // region×type totals
  const countByRegionType = new Map();
  rows.forEach(d => {
    const key = `${d.region}||${d.type}`;
    const prev = countByRegionType.get(key) || 0;
    countByRegionType.set(key, prev + d.n_objects);
  });

  const stacks = [];
  countByRegionType.forEach((value, key) => {
    const [region, type] = key.split("||");
    stacks.push({ region, type, n_objects: value });
  });

  if (!stacks.length) {
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#6b5a3e")
      .text("No data for selected view.");
    return;
  }

  // --- CONSTANT icon scale based on GLOBAL max count ---
  const globalMaxCount = d3.max(dataStore.rows, d => d.n_objects) || 1;

  const iconSize = 14;      // logical size (font size-ish)
  const iconPadding = 2;
  const maxIconsFit = Math.max(5, Math.floor(innerHeight / (iconSize + iconPadding)));
  const unitsPerIcon = Math.max(1, Math.ceil(globalMaxCount / maxIconsFit));

  // compute icon counts per stack using this global scale
  stacks.forEach(d => {
    d.iconCount = Math.ceil(d.n_objects / unitsPerIcon);
  });

  const xRegion = d3.scaleBand()
    .domain(regions)
    .range([0, innerWidth])
    .paddingInner(0.2)
    .paddingOuter(0.1);

  const xType = d3.scaleBand()
    .domain(topTypes)
    .range([0, xRegion.bandwidth()])
    .padding(0.25);

  // color per type (for legend swatches)
  const colorForType = d3.scaleOrdinal()
    .domain(topTypes)
    .range([
      "#DB8E2F", // gold
      "#8ED0F6", // blue
      "#B73247", // deep red
      "#C7DEAF", // sage
      "#335c81", // deep blue
      "#9b5de5",
      "#ff924c",
      "#6a994e"
    ]);

  // per-icon data
  const iconData = [];
  stacks.forEach(stack => {
    const { region, type, n_objects, iconCount } = stack;
    for (let i = 0; i < iconCount; i++) {
      iconData.push({
        region,
        type,
        index: i,
        iconCount,
        n_objects
      });
    }
  });

  // x-axis
  const xAxis = d3.axisBottom(xRegion);
  g.append("g")
    .attr("class", "axis axis--x")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll("text")
    .attr("transform", "rotate(-30)")
    .style("text-anchor", "end");

  // icons as text (emoji / symbols)
  const icons = g.append("g")
    .attr("class", "icons-layer")
    .selectAll("text")
    .data(iconData)
    .join("text")
    .attr("class", "isotype-icon")
    .text(d => ICON_FOR_TYPE[d.type] || ICON_FOR_TYPE["Other"]);

  icons
    .attr("x", d => {
      const regionX = xRegion(d.region);
      const typeX = xType(d.type) || 0;
      return regionX + typeX + xType.bandwidth() / 2;
    })
    .attr("y", d => {
      const level = d.index;
      const yBottom = innerHeight - iconSize; // stack from bottom
      return yBottom - level * (iconSize + iconPadding);
    })
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "hanging")
    .on("mousemove", (event, d) => {
      const html = `
        <strong>${d.type}</strong><br/>
        Region: ${d.region}<br/>
        Approx. objects: ${d3.format(",")(d.n_objects)}<br/>
        Icons in stack: ${d.iconCount}<br/>
        1 icon ≈ ${unitsPerIcon} objects
      `;
      showTooltip(html, event);
    })
    .on("mouseleave", hideTooltip);

  renderLegend(topTypes, colorForType, unitsPerIcon);
}

function renderLegend(topTypes, colorForType, unitsPerIcon) {
  const legend = d3.select("#icon-legend");
  legend.html("");

  topTypes.forEach(type => {
    const row = legend.append("div").attr("class", "legend-item");

    row.append("span")
      .attr("class", "legend-icon")
      .text(ICON_FOR_TYPE[type] || ICON_FOR_TYPE["Other"]);

    row.append("span")
      .text(type);
  });

  d3.select("#icon-scale-note")
    .text(`Scaling: 1 icon ≈ ${unitsPerIcon} objects (constant, even when "Unknown origin" is shown).`);
}

// ---------------------------
// Tooltip helpers
// ---------------------------

function showTooltip(html, event) {
  tooltip
    .html(html)
    .style("left", (event.clientX + 12) + "px")
    .style("top", (event.clientY + 12) + "px")
    .style("opacity", 1);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

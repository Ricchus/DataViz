// main.js – Type × Region × Time Heatmap

const TYPES_CSV = "types_by_region_decade.csv";
const COUNTRY_TYPES_CSV = "types_by_region_country.csv";

const MAX_TYPES = 12;      // top 10–12 types globally
const TOP_COUNTRY_ROWS = 6; // how many countries to show in side panel

const colorForType = d3.scaleOrdinal()
  .range(["#8ED0F6", "#DB8E2F", "#B73247", "#C7DEAF", "#335c81", "#9b5de5", "#f15bb5", "#ffc6ff", "#ff924c", "#ff595e", "#1982c4", "#6a994e"]);

const state = {
  region: null,
  metric: "share"  // "share" or "count"
};

const dataStore = {
  heat: [],
  countryTypes: [],
  regions: [],
  topTypes: []
};

let tooltip;

document.addEventListener("DOMContentLoaded", () => {
  tooltip = d3.select("body")
    .append("div")
    .attr("class", "tt-tooltip");

  Promise.all([
    d3.csv(TYPES_CSV, d3.autoType),
    d3.csv(COUNTRY_TYPES_CSV, d3.autoType)
  ]).then(([heatData, countryTypes]) => {
    dataStore.heat = heatData;
    dataStore.countryTypes = countryTypes;

    initRegionOptions();
    computeGlobalTopTypes();
    initMetricToggle();

    // default region = first alphabetically
    state.region = dataStore.regions[0];
    d3.select("#region-select").property("value", state.region);

    renderAll();
  }).catch(err => {
    console.error("Error loading CSVs", err);
    alert("Error loading the CSV files. Check the console for details.");
  });
});

// ---------------------------
// Setup helpers
// ---------------------------

function initRegionOptions() {
  const regions = Array.from(new Set(dataStore.heat.map(d => d.region))).sort(d3.ascending);
  dataStore.regions = regions;

  const regionSelect = d3.select("#region-select");
  regionSelect.selectAll("option").remove();
  regions.forEach(r => {
    regionSelect.append("option")
      .attr("value", r)
      .text(r);
  });

  regionSelect.on("change", (event) => {
    state.region = event.target.value;
    renderAll();
  });
}

function initMetricToggle() {
  d3.selectAll("input[name='metric']").on("change", (event) => {
    state.metric = event.target.value;
    renderAll();
  });
}

function computeGlobalTopTypes() {
  // sum n_objects across all regions/decades by type_group
  const totals = d3.rollups(
    dataStore.heat,
    v => d3.sum(v, d => d.n_objects),
    d => d.type_group
  );

  totals.sort((a, b) => d3.descending(a[1], b[1]));

  dataStore.topTypes = totals.slice(0, MAX_TYPES).map(d => d[0]);
  colorForType.domain(dataStore.topTypes);
}

// ---------------------------
// Rendering orchestration
// ---------------------------

function renderAll() {
  renderHeatmap();
  renderCountryPanel();
}

// ---------------------------
// Heatmap
// ---------------------------

function renderHeatmap() {
  const svg = d3.select("#type-heatmap");
  const { width, height } = svg.node().getBoundingClientRect();
  svg.selectAll("*").remove();

  const margin = { top: 32, right: 20, bottom: 80, left: 90 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const region = state.region;
  const metric = state.metric;

  const regionDataRaw = dataStore.heat.filter(d => d.region === region);
  const regionData = regionDataRaw.filter(d => dataStore.topTypes.includes(d.type_group));

  if (!regionData.length) {
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#6b5a3e")
      .text("No data for this region.");
    return;
  }

  const decades = Array.from(new Set(regionData.map(d => d.decade))).sort(d3.ascending);
  const types = dataStore.topTypes.slice(); // keep global order

  const x = d3.scaleBand()
    .domain(types)
    .range([0, innerWidth])
    .padding(0.05);

  const y = d3.scaleBand()
    .domain(decades.map(String))
    .range([innerHeight, 0])
    .padding(0.05);

  const metricField = metric === "count" ? "n_objects" : "share_within_region_decade";

  const maxVal = d3.max(regionData, d => d[metricField]) || 1;
  const color = d3.scaleSequential()
    .domain([0, maxVal])
    // brand-consistent gradient: background → deep red
    .interpolator(t => d3.interpolateRgb("#F2F1E3", "#B73247")(t));

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // axes
  const xAxis = d3.axisBottom(x);
  const yAxis = d3.axisLeft(y)
    .tickValues(decades.filter((d, i) => i % 10 === 0).map(String));

  g.append("g")
    .attr("class", "axis axis--x")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll("text")
    .attr("transform", "rotate(-40)")
    .style("text-anchor", "end");

  g.append("g")
    .attr("class", "axis axis--y")
    .call(yAxis);

  // grid (horizontal only)
  g.append("g")
    .selectAll("line")
    .data(decades)
    .join("line")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", d => y(String(d)) + y.bandwidth() / 2)
    .attr("y2", d => y(String(d)) + y.bandwidth() / 2)
    .attr("stroke", "#eee4d1")
    .attr("stroke-width", 0.5);

  // cells
  g.selectAll("rect")
    .data(regionData)
    .join("rect")
    .attr("class", "heat-cell")
    .attr("x", d => x(d.type_group))
    .attr("y", d => y(String(d.decade)))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("fill", d => color(d[metricField]))
    .on("mousemove", (event, d) => {
      const val = metric === "count"
        ? d3.format(",")(d.n_objects)
        : d3.format(".0%")(d.share_within_region_decade);

      const html = `
        <strong>${d.type_group}</strong><br/>
        Region: ${d.region}<br/>
        Decade: ${d.decade}s<br/>
        ${metric === "count" ? "Objects" : "Share"}: ${val}
      `;
      showTooltip(html, event);
    })
    .on("mouseleave", hideTooltip);

  // update title + legend text
  d3.select("#heatmap-title").text(`Region: ${region}`);
  d3.select("#heatmap-subtitle").text(
    metric === "count"
      ? "Each cell shows the number of objects of that type collected in that region and decade."
      : "Each cell shows the share of objects of that type within the region and decade."
  );

  renderHeatmapLegend(metric, maxVal);
}

function renderHeatmapLegend(metric, maxVal) {
  const legend = d3.select("#heatmap-legend");
  legend.html("");

  legend.append("span").text(
    metric === "count"
      ? "Few objects"
      : "Lower share"
  );

  legend.append("div")
    .attr("class", "legend-gradient");

  legend.append("span").text(
    metric === "count"
      ? `Many objects (up to ${d3.format("~s")(maxVal)})`
      : "Higher share"
  );
}

// ---------------------------
// Country panel
// ---------------------------

function renderCountryPanel() {
  const region = state.region;
  const container = d3.select("#country-summary");
  container.html("");

  // Special handling for Unknown region
  if (region === "Unknown") {
    container.append("div")
      .text("For objects with unknown region, we do not report country-level patterns.");
    return;
  }

  const data = dataStore.countryTypes.filter(d => d.region === region);

  if (!data.length) {
    container.append("div").text("No country-level type data for this region.");
    return;
  }

  // Group by country; for each, find total & dominant type
  const grouped = d3.rollups(
    data,
    v => {
      const total = d3.sum(v, d => d.n_objects);
      const sorted = v.slice().sort((a, b) => d3.descending(a.n_objects, b.n_objects));
      const top = sorted[0];
      return {
        total,
        topType: top.type_group,
        topCount: top.n_objects
      };
    },
    d => d.country
  );

  // Sort by total descending; keep top N
  grouped.sort((a, b) => d3.descending(a[1].total, b[1].total));
  const topCountries = grouped.slice(0, TOP_COUNTRY_ROWS);

  topCountries.forEach(([country, info]) => {
    const row = container.append("div").attr("class", "country-row");

    row.append("div")
      .attr("class", "country-row-type-swatch")
      .style("background", colorForType(info.topType));

    row.append("div")
      .html(`<strong>${country}</strong><br/><span>${info.topType} · ${d3.format(",")(info.total)} objects</span>`);
  });
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

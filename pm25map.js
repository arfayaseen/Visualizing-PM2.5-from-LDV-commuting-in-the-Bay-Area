
const BG_SHP = "Dataset/Boundaries/cb_2022_06_bg_500k/cb_2022_06_bg_500k";
const COUNTY_SHP = "Dataset/Boundaries/cb_2022_us_county_500k/cb_2022_us_county_500k";
const ROADS_SHP = "Dataset/Boundaries/tl_2026_06_prisecroads/tl_2026_06_prisecroads";
const PM25_FILE = "Dataset/Output PM2.5 Concentration/bg_pm25.csv";

const BAY_COUNTIES = ["001", "013", "041", "055", "075", "081", "085", "095", "097"]; //county FIPS codes (digits 3-5 of a GEOID) of the 9 Bay Area counties

const WIDTH = 900;
const HEIGHT = 900;
const LEGEND_SPACE = 180;
const NO_DATA = "#bdbdbd";   // block groups missing from bg_pm25.csv

// load the three files, then draw
Promise.all([
    shapefile.read(BG_SHP + ".shp", BG_SHP + ".dbf", { encoding: "utf-8" }),
    shapefile.read(COUNTY_SHP + ".shp", COUNTY_SHP + ".dbf", { encoding: "utf-8" }),
    shapefile.read(ROADS_SHP + ".shp", ROADS_SHP + ".dbf", { encoding: "utf-8" }),
    // GEOID stays text to keep its leading 0; PM25 becomes a number.
    d3.csv(PM25_FILE, d => ({ GEOID: d.GEOID, PM25: +d.PM25 })),
    ]).then(([blockGroups, counties, roads, pm25]) => {

    // look up a block group's PM2.5 by its GEOID.
    const pmByGeoid = new Map(pm25.map(d => [d.GEOID, d.PM25]));

    // keep the 9 Bay Area counties' block groups and outlines; every other county in the US becomes grey background
    const isBay = f => f.properties.STATEFP === "06"
                    && BAY_COUNTIES.includes(f.properties.COUNTYFP);
    const bayBlockGroups = blockGroups.features.filter(isBay);
    const bay = counties.features.filter(isBay);
    const neighbors = counties.features.filter(f => !isBay(f));

    // projection turns longitude/latitude into x/y on screen, zoomed so the 9 counties fill the SVG
    const projection = d3.geoConicConformal()
        .parallels([37, 39])
        .rotate([122, 0])
        .fitExtent([[20, 20], [WIDTH - LEGEND_SPACE, HEIGHT - 20]],
                    { type: "FeatureCollection", features: bay })
                .clipExtent([[-2000, -10], [WIDTH + 10, HEIGHT + 10]]);   // drop shapes far off screen;
    const path = d3.geoPath(projection);
    // y of the highest point of the 9 counties (path.bounds gives [[left, top], [right, bottom]])
    const mapTop = path.bounds({ type: "FeatureCollection", features: bay })[0][1]; 

    // colour: 5 orange bins with equal numbers of block groups in each (quantiles), so the skewed PM2.5 values spread across all shades.
    // The palest orange is dropped so low values don't look like water.
    const BREAKS = [0.03, 0.06, 0.09, 0.12];
    const color = d3.scaleThreshold()
        .domain(BREAKS)
        .range(d3.schemeOranges[6].slice(1));

    const fill = d => {
    const value = pmByGeoid.get(d.properties.GEOID);
    return value === undefined ? NO_DATA : color(value);
    };

    const svg = d3.select("#map")
        .attr("viewBox", [0, 0, WIDTH, HEIGHT])
        .attr("preserveAspectRatio", "xMaxYMid meet");   // map hugs the right edge; extra width shows more water on the left layers are drawn in order, so later ones sit on top.


    // 2. block groups coloured by PM2.5
    svg.append("g")
    .selectAll("path")
    .data(bayBlockGroups)
    .join("path")
        .attr("class", "block-group")
        .attr("d", path)
        .attr("fill", fill)
        .attr("stroke", fill);

    // Keep only roads whose bounding box touches the Bay Area (about 1,750 of 7,350)
    const [[west, south], [east, north]] = d3.geoBounds({ type: "FeatureCollection", features: bay });
    const nearBay = f => {
        const [[w, s], [e, n]] = d3.geoBounds(f);
        return e > west && w < east && n > south && s < north;
    };
    const bayRoads = roads.features.filter(nearBay);
    const primary = bayRoads.filter(d => d.properties.MTFCC === "S1100");
    const secondary = bayRoads.filter(d => d.properties.MTFCC === "S1200");

    // Each road is drawn twice: the wider outline first, then the coloured line on top.
    // Secondary roads go first so primary roads sit on top where they cross.
    const roadLayer = svg.append("g");
    roadLayer.selectAll("path.secondary-outline").data(secondary).join("path").attr("class", "road secondary-outline").attr("d", path);
    roadLayer.selectAll("path.secondary").data(secondary).join("path").attr("class", "road secondary").attr("d", path);
    roadLayer.selectAll("path.primary-outline").data(primary).join("path").attr("class", "road primary-outline").attr("d", path);
    roadLayer.selectAll("path.primary").data(primary).join("path").attr("class", "road primary").attr("d", path);

    // Grey neighbouring counties on top of the roads, so roads stop at the Bay Area edge
    svg.append("g").selectAll("path").data(neighbors).join("path").attr("class", "neighbor").attr("d", path);

    // 3. county outlines on top
    svg.append("g")
    .selectAll("path")
    .data(bay)
    .join("path")
        .attr("class", "county-border")
        .attr("d", path);

    // 4. Legend on the grey counties at the top right: one box per colour bin,
    //    highest at the top. The labels are the bin edges: the lowest value,
    //    the 4 quantile cut points, and the highest value.
    const BOX_WIDTH = 24;
    const BOX_HEIGHT = 100;
    const edges = [d3.min(pm25, d => d.PM25), ...color.domain(), d3.max(pm25, d => d.PM25)];
    const bins = color.range().map((c, i) => ({ color: c, low: edges[i], high: edges[i + 1] })).reverse();

    const LEGEND_LENGTH = bins.length * BOX_HEIGHT;
    const legendY = d3.scaleLinear()          // edge number (0-5) -> y, top = highest
      .domain([edges[0], edges[edges.length - 1]])
      .range([LEGEND_LENGTH, 0]);

    const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${WIDTH - 160}, 70)`);   // top right of the map

    // A white card behind the legend, so it reads clearly over the grey.
    const card = legend.append("rect")
      .attr("class", "legend-card")
      .attr("rx", 6);

    const title = legend.append("text")
        .attr("class", "legend-title")
        .attr("y", -32)
        .text("PM2.5 (µg/m³)");

    const bar = legend.append("g");
    bar.selectAll("rect.bin")
    .data(bins)
    .join("rect")
        .attr("class", "bin")
        .attr("y", d => legendY(d.high))
        .attr("width", BOX_WIDTH)
        .attr("height", d => legendY(d.low) - legendY(d.high))
        .attr("fill", d => d.color);

    // A tick and a label at each edge between boxes.
    const format = d3.format(".3~f");
    const ticks = bar.selectAll("g.tick")
    .data(edges)
    .join("g")
        .attr("class", "tick")
        .attr("transform", d => `translate(${BOX_WIDTH}, ${legendY(d)})`);
    ticks.append("line").attr("x2", 6);
    ticks.append("text")
        .attr("x", 10)
        .attr("dy", "0.35em")
        .text(d => format(d));
        // 5. Road legend: a second white card below the PM2.5 card.
    //    Each sample line is drawn twice (outline, then colour), like the roads on the map.
    const ROAD_TYPES = [
        { label: "Primary", type: "primary" },
        { label: "Secondary", type: "secondary" },
    ];
    const SAMPLE_LENGTH = 30;   // length of each sample line
    const ROW_GAP = 30;         // distance between the rows

    const roadLegend = svg.append("g").attr("class", "legend");
    const roadCard = roadLegend.append("rect")
        .attr("class", "legend-card")
        .attr("rx", 6);
    const roadContent = roadLegend.append("g");   // title + rows, centred in the card by fitCard
    roadContent.append("text")
        .attr("class", "legend-title")
        .text("Roads");
    const rows = roadContent.selectAll("g.road-key")
    .data(ROAD_TYPES)
    .join("g")
        .attr("class", "road-key")
        .attr("transform", (d, i) => `translate(0, ${ROW_GAP * (i + 1)})`);
    rows.append("line")
        .attr("class", d => `road ${d.type}-outline`)
        .attr("x2", SAMPLE_LENGTH);
    rows.append("line")
        .attr("class", d => `road ${d.type}`)
        .attr("x2", SAMPLE_LENGTH);
    rows.append("text")
        .attr("x", SAMPLE_LENGTH + 8)
        .attr("dy", "0.35em")
        .text(d => d.label);
        const fitCard = () => {
        const titleWidth = title.node().getBBox().width;
        const barWidth = bar.node().getBBox().width;
        bar.attr("transform", `translate(${(titleWidth - barWidth) / 2}, 0)`);
        card.attr("display", "none");
        const box = legend.node().getBBox();
        card.attr("display", null)
            .attr("x", box.x - 12)
            .attr("y", box.y - 12)
            .attr("width", box.width + 24)
            .attr("height", box.height + 24);
        // Move the legend down so the top of its card lines up with the top of the map
        const legendTop = mapTop - (box.y - 12);
        legend.attr("transform", `translate(${WIDTH - 160}, ${legendTop})`);
        // Road card: same x and width as the PM2.5 card, 16 units below it
        const cardX = box.x - 12;
        const cardWidth = box.width + 24;
        const cardBottom = box.y + box.height + 12;
        roadLegend.attr("transform", `translate(${WIDTH - 160}, ${legendTop + cardBottom + 16})`);

        // Centre the title + rows in the card
        roadContent.attr("transform", null);
        const content = roadContent.node().getBBox();
        const shiftX = cardX + (cardWidth - content.width) / 2 - content.x;
        const shiftY = 12 - content.y;   // 12 units of padding at the top
        roadContent.attr("transform", `translate(${shiftX}, ${shiftY})`);
        roadCard
            .attr("x", cardX)
            .attr("y", 0)
            .attr("width", cardWidth)
            .attr("height", content.height + 24);
    };
    fitCard();
    document.fonts.ready.then(fitCard);

    // 7. County bar chart at the bottom left (barchart.js)
    // The charts are placed by measuring the screen, so draw them again when the window changes size
    const drawCharts = () => {
        svg.selectAll(".county-chart").remove();          // old county chart
        d3.select("#overlay").selectAll("*").remove();    // old race chart
        drawCountyBars(svg, pmByGeoid, bay);
    };
    drawCharts();
    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(drawCharts, 200);        // wait until the resizing stops
    });

    // 6. The race/ethnicity dot map on the right (dotmap.js)
    drawDotMap(d3.select("#dot-map"), bayBlockGroups, bay, neighbors);
});
// Race/ethnicity dot map (ACS 2022 5-year, table B03002, block groups).
// One dot = PEOPLE_PER_DOT people of one group, placed at a random spot inside
// its block group. Everything for the dots lives in this file. To hide the dots,
// set SHOW_DOTS = false at the top of index.js.

const RACE_FILE = "Dataset/ACSDT5Y2022.B03002_2026-10-28T212523/ACSDT5Y2022.B03002-Data.csv";
const PEOPLE_PER_DOT = 100;
const DOT_RADIUS = 1;
const BATCHES = 20;   // dots are drawn in 20 mixed batches so no colour always ends up on top

// Columns are B03002 estimates. "Some other race alone" (008E, 0.6% of the Bay Area) is added to two or more races.
const RACE_GROUPS = [
    { key: "white",    label: "White",              color: "#5ab4f0", columns: ["B03002_003E"] },
    { key: "latino",   label: "Latino",             color: "#f79539", columns: ["B03002_012E"] },
    { key: "asian",    label: "Asian",              color: "#0eb958", columns: ["B03002_006E"] },
    { key: "black",    label: "Black",              color: "#e41a1c", columns: ["B03002_004E"] },
    { key: "multi",    label: "Two or more / other", color: "#a88372", columns: ["B03002_009E", "B03002_008E"] },
    { key: "pacific",  label: "Pacific Islander",   color: "#a32ce7", columns: ["B03002_007E"] },
    { key: "native",   label: "Native American",    color: "#f76dc2", columns: ["B03002_005E"] },
];

function drawDots(layer, blockGroups, projection) {
    return d3.csv(RACE_FILE).then(rows => {
        // ACS GEO_ID looks like "1500000US060014001001"; the last 12 characters are the GEOID.
        // The file's second row is the long column descriptions, so it has no "US" in GEO_ID and is skipped.
        const countsByGeoid = new Map(
            rows.filter(r => r.GEO_ID.includes("US"))
                .map(r => [r.GEO_ID.slice(-12), r])
        );

        // Same random numbers on every reload, so the dots don't jump around.
        const random = d3.randomUniform.source(d3.randomLcg(42))();

        // Points for each group, in screen (x, y) coordinates.
        const points = new Map(RACE_GROUPS.map(g => [g.key, []]));

        for (const bg of blockGroups) {
            const row = countsByGeoid.get(bg.properties.GEOID);
            if (!row) continue;

            // Every ring of the block group, projected to screen coordinates.
            // A point is inside if it falls in an odd number of rings (this handles islands and holes).
            const polygons = bg.geometry.type === "Polygon" ? [bg.geometry.coordinates] : bg.geometry.coordinates;
            const rings = polygons.flat().map(ring => ring.map(projection));
            const inside = p => rings.filter(ring => d3.polygonContains(ring, p)).length % 2 === 1;
            const xs = rings.flat().map(p => p[0]);
            const ys = rings.flat().map(p => p[1]);
            const [x0, x1, y0, y1] = [d3.min(xs), d3.max(xs), d3.min(ys), d3.max(ys)];

            for (const g of RACE_GROUPS) {
                const people = d3.sum(g.columns, c => +row[c]);
                // e.g. 120 people -> 2 dots, plus a 40% chance of a third, so small groups don't vanish.
                const exact = people / PEOPLE_PER_DOT;
                const dots = Math.floor(exact) + (random() < exact % 1 ? 1 : 0);
                for (let i = 0; i < dots; i++) {
                    // Try random spots in the block group's box until one lands inside the block group.
                    for (let tries = 0; tries < 100; tries++) {
                        const p = [x0 + random() * (x1 - x0), y0 + random() * (y1 - y0)];
                        if (inside(p)) { points.get(g.key).push(p); break; }
                    }
                }
            }
        }

        // Each group's dots are split into BATCHES pieces, and the pieces are
        // drawn interleaved (batch 1 of every group, then batch 2, ...). Each piece is one
        // <path> made of tiny circles, which is much faster than ~75,000 <circle> elements.
        const r = DOT_RADIUS;
        const circle = ([x, y]) => `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
        const pieces = [];
        for (let batch = 0; batch < BATCHES; batch++) {
            for (const g of d3.shuffle(RACE_GROUPS.slice(), random)) {
                const mine = points.get(g.key).filter((p, i) => i % BATCHES === batch);
                pieces.push({ color: g.color, d: mine.map(circle).join("") });
            }
        }
        layer.selectAll("path")
        .data(pieces)
        .join("path")
            .attr("class", "race-dots")
            .attr("fill", d => d.color)
            .attr("d", d => d.d);

    });
}

// Race/ethnicity dot map, drawn in its own SVG to the right of the PM2.5 map.
// Same size and projection as the PM2.5 map, mirrored: the map sits on the right
// and the legend on the left. Uses WIDTH, HEIGHT and LEGEND_SPACE from pm25.js,
// and drawDots + RACE_GROUPS from dots.js.

function drawDotMap(svg, bayBlockGroups, bay, neighbors) {
    const bayCollection = { type: "FeatureCollection", features: bay };

    // Same projection as the PM2.5 map, with the legend space on the left instead of the right
    const projection = d3.geoConicConformal()
        .parallels([37, 39])
        .rotate([122, 0])
        .fitExtent([[LEGEND_SPACE, 20], [WIDTH - 20, HEIGHT - 20]], bayCollection)
        .clipExtent([[-2000, -10], [WIDTH + 10, HEIGHT + 10]]);   // drop shapes far off screen;
    const path = d3.geoPath(projection);
    const mapTop = path.bounds(bayCollection)[0][1];

    const CARD_LEFT = 175;
    const VIEW_LEFT = CARD_LEFT - 8;
    svg.attr("viewBox", [VIEW_LEFT, 0, WIDTH - VIEW_LEFT, HEIGHT]);

    // 1. grey neighbouring counties
    svg.append("g").selectAll("path").data(neighbors).join("path").attr("class", "neighbor").attr("d", path);

    // 2. Bay Area land in one plain colour, so the dots are the only thing that changes
    svg.append("g").selectAll("path").data(bay).join("path").attr("class", "dot-land").attr("d", path);

    // 3. the dots (dots.js)
    const dotLayer = svg.append("g");
    const dotsDrawn = drawDots(dotLayer, bayBlockGroups, projection);

    // 4. county outlines on top
    svg.append("g").selectAll("path").data(bay).join("path").attr("class", "county-border").attr("d", path);

    // 5. Legend on the left: one row per group, a dot and its label
    const ROW_GAP = 30;
    const legend = svg.append("g").attr("class", "legend");
    const card = legend.append("rect").attr("class", "legend-card").attr("rx", 6);
    const content = legend.append("g");
    content.append("text")
        .attr("class", "legend-title")
        .text("Race/Ethnicity");
    const rows = content.selectAll("g.race-key")
    .data(RACE_GROUPS)
    .join("g")
        .attr("class", "race-key")
        .attr("transform", (d, i) => `translate(0, ${ROW_GAP * (i + 1)})`);
    rows.append("circle")
        .attr("cx", 7)
        .attr("r", 7)
        .attr("fill", d => d.color);
    rows.append("text")
        .attr("x", 22)
        .attr("dy", "0.35em")
        .text(d => d.label);
    content.append("text")
        .attr("class", "legend-note")
        .attr("y", ROW_GAP * (RACE_GROUPS.length + 1))
        .attr("dy", "0.35em")
        .text(`1 dot = ${PEOPLE_PER_DOT} people`);

    // Card around the content, its top at the top of the map, 20 units from the left edge
    const fitCard = () => {
        const box = content.node().getBBox();
        card.attr("x", box.x - 12)
            .attr("y", box.y - 12)
            .attr("width", box.width + 24)
            .attr("height", box.height + 24);
        legend.attr("transform", `translate(${CARD_LEFT - (box.x - 12)}, ${HEIGHT/2 - (box.y - 12)})`);
    };
    fitCard();
    document.fonts.ready.then(fitCard);

    return dotsDrawn;
}
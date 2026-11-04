// County bar chart: the population-weighted average PM2.5 of each Bay Area county,
// on a white card in the water at the bottom left of the PM2.5 map.
// Population = ACS B03002 total (B03002_001E), read from the same file as the dot map
// (RACE_FILE in dotmap.js). Uses WIDTH, HEIGHT and BAY_COUNTIES from pm25map.js.

const BELOW_COLOR = "#43c2ad";   // counties below the Bay Area average
const ABOVE_COLOR = "#d66d4d";   // counties above it
const COUNTY_CARD_WIDTH = 530;             // the card's right edge stays left of this x (the San Mateo coast)

function drawCountyBars(svg, pmByGeoid, bay) {
    return d3.csv(RACE_FILE).then(rows => {
        // Population of each block group, by GEOID (same GEO_ID trick as the dot map)
        const popByGeoid = new Map(
            rows.filter(r => r.GEO_ID.includes("US"))
                .map(r => [r.GEO_ID.slice(-12), +r.B03002_001E])
        );

        // One record per Bay Area block group that has both a population and a PM2.5 value
        // (row = the block group's whole ACS row, used by the race chart)
        const rowByGeoid = new Map(rows.map(r => [r.GEO_ID.slice(-12), r]));
        const blockGroups = [];
        for (const [geoid, pm] of pmByGeoid) {
            const county = geoid.slice(2, 5);
            const pop = popByGeoid.get(geoid);
            if (geoid.startsWith("06") && BAY_COUNTIES.includes(county) && pop > 0) {
                blockGroups.push({ county, pop, pm, row: rowByGeoid.get(geoid) });
            }
        }

        // Population-weighted average = sum(population x PM2.5) / sum(population)
        const weightedAverage = list => d3.sum(list, d => d.pop * d.pm) / d3.sum(list, d => d.pop);
        const bayAverage = weightedAverage(blockGroups);
        const nameByFips = new Map(bay.map(f => [f.properties.COUNTYFP, f.properties.NAME]));
        const data = d3.rollups(blockGroups, weightedAverage, d => d.county)
            .map(([fips, avg]) => ({ name: nameByFips.get(fips), avg }))
            .sort((a, b) => b.avg - a.avg);   // lowest on the left

        // Where the card goes. The SVG is wider than its 900 x 900 viewBox, and the extra
        // width is on the left (xMaxYMid), so its left edge is at a negative x.
        const rect = svg.node().getBoundingClientRect();
        const visibleLeft = Math.min(0, WIDTH - HEIGHT * rect.width / rect.height);
        const CARD = { left: visibleLeft + 20, bottom: HEIGHT - 20, height: 390 };
        CARD.right = CARD.left + COUNTY_CARD_WIDTH;
        CARD.top = CARD.bottom - CARD.height;

                // Inside the card: title and key at the top, county names on the left, bars to their right
        const PAD = 16;
        const plot = {
            left: CARD.left + PAD + 130,         // room for the county names
            right: CARD.right - PAD - 20,
            top: CARD.top + 115,                 // room for the title, the key and the average's label
            bottom: CARD.bottom - 40,            // room for the PM2.5 numbers (the card title gives the units)
        };

        const y = d3.scaleBand()
            .domain(data.map(d => d.name))
            .range([plot.top, plot.bottom])
            .padding(0.25);
        const x = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.avg) * 1.05])
            .nice()
            .range([plot.left, plot.right]);

        const chart = svg.append("g").attr("class", "legend county-chart");

        chart.append("rect")
            .attr("class", "legend-card")
            .attr("rx", 6)
            .attr("x", CARD.left)
            .attr("y", CARD.top)
            .attr("width", CARD.right - CARD.left)
            .attr("height", CARD.height);

        chart.append("text")
            .attr("class", "legend-title")
            .attr("x", CARD.left + PAD)
            .attr("y", CARD.top + PAD)
            .attr("dy", "0.8em")
            .text("Population-weighted Average PM2.5 (µg/m³)");

        // Key: one coloured square per bar colour
        const key = chart.append("g")
            .attr("transform", `translate(${CARD.left + PAD}, ${CARD.top + PAD + 42})`);
        const keyItems = key.selectAll("g")
        .data([
            { label: "Below Bay Area avg.", color: BELOW_COLOR },
            { label: "Above Bay Area avg.", color: ABOVE_COLOR },
        ])
        .join("g");
        keyItems.append("rect")
            .attr("y", -7)
            .attr("width", 14)
            .attr("height", 14)
            .attr("fill", d => d.color);
        keyItems.append("text")
            .attr("x", 20)
            .attr("dy", "0.35em")
            .text(d => d.label);
        // Place the second item right after the first
        const firstWidth = keyItems.nodes()[0].getBBox().width;
        keyItems.attr("transform", (d, i) => `translate(${i * (firstWidth + 24)}, 0)`);

                // Bars
        chart.selectAll("rect.bar")
        .data(data)
        .join("rect")
            .attr("class", "bar")
            .attr("x", x(0))
            .attr("y", d => y(d.name))
            .attr("width", d => x(d.avg) - x(0))
            .attr("height", y.bandwidth())
            .attr("fill", d => d.avg > bayAverage ? ABOVE_COLOR : BELOW_COLOR);

        // Axes: county names on the left, PM2.5 along the bottom
        chart.append("g")
            .attr("transform", `translate(${plot.left}, 0)`)
            .call(d3.axisLeft(y).tickSize(4));
        chart.append("g")
            .attr("transform", `translate(0, ${plot.bottom})`)
            .call(d3.axisBottom(x).ticks(4).tickFormat(d3.format(".2f")));

        // Bay Area average: a dashed line down the plot, labelled above it, ending at the line
        chart.append("line")
            .attr("class", "bay-average")
            .attr("x1", x(bayAverage))
            .attr("x2", x(bayAverage))
            .attr("y1", plot.top - 6)
            .attr("y2", plot.bottom);
        chart.append("text")
            .attr("x", x(bayAverage) + 4)
            .attr("y", plot.top - 12)
            .attr("text-anchor", "end")
            .text(`Bay Area avg. ${d3.format(".3f")(bayAverage)}`);
        
        // The race chart goes in a card right above this one
        drawRaceBars(blockGroups, bayAverage, chart.select(".legend-card").node());
    });
}

// Race/ethnicity bar chart: how much higher or lower each group's population-weighted
// PM2.5 is than the Bay Area average, in %. It sits right above the county chart, in the
// #overlay SVG that covers both maps, so it can stick out over the dot map if it needs to.
// The overlay has no viewBox, so its units are screen pixels.
const RACE_CARD_WIDTH = 430;
const RACE_CARD_HEIGHT = 330;

function drawRaceBars(blockGroups, bayAverage, countyCard) {
    // The groups from the dot map, plus everyone who isn't non-Latino White
    const groups = [
        ...RACE_GROUPS.map(g => ({ label: g.label, people: row => d3.sum(g.columns, c => +row[c]) })),
        { label: "People of color", people: row => +row.B03002_001E - +row.B03002_003E },
    ];

    // Each group's population-weighted average PM2.5, as % above (+) or below (-) the Bay Area's
    const data = groups.map(g => {
        const avg = d3.sum(blockGroups, d => g.people(d.row) * d.pm) / d3.sum(blockGroups, d => g.people(d.row));
        return { label: g.label, diff: (avg / bayAverage - 1) * 100 };
    }).sort((a, b) => b.diff - a.diff);   // highest at the top

    // Card: 16 px above the county card. Its left edge starts just right of the dot map's
    // land (the counties that reach up beside the card); the rest sticks out to the right,
    // over the water of the PM2.5 map.
    const mapsBox = document.querySelector(".maps").getBoundingClientRect();
    const countyBox = countyCard.getBoundingClientRect();
    const bottom = countyBox.top - 16;                         // card bottom, in screen pixels
    const landRight = d3.max(
        d3.selectAll("#dot-map .dot-land").nodes()
            .map(n => n.getBoundingClientRect())
            .filter(b => b.top < bottom),                      // only counties beside the card
        b => b.right
    );
    const CARD = {
        left: landRight - 7 - mapsBox.left,
        bottom: bottom - mapsBox.top,
    };
    CARD.right = CARD.left + RACE_CARD_WIDTH;
    CARD.top = CARD.bottom - RACE_CARD_HEIGHT;

    const PAD = 16;
    const plot = {
        left: CARD.left + PAD + 170,    // room for the group names
        right: CARD.right - PAD - 10,
        top: CARD.top + 60,             // room for the title
        bottom: CARD.bottom - 70,       // room for the % numbers and the caption
    };

    const y = d3.scaleBand()
        .domain(data.map(d => d.label))
        .range([plot.top, plot.bottom])
        .padding(0.25);
    const biggest = d3.max(data, d => Math.abs(d.diff));
    const x = d3.scaleLinear()
        .domain([-biggest, biggest])     // 0 in the middle
        .nice()
        .range([plot.left, plot.right]);

    const chart = d3.select("#overlay").append("g").attr("class", "legend county-chart");

    chart.append("rect")
        .attr("class", "legend-card")
        .attr("rx", 6)
        .attr("x", CARD.left)
        .attr("y", CARD.top)
        .attr("width", RACE_CARD_WIDTH)
        .attr("height", RACE_CARD_HEIGHT);

    chart.append("text")
        .attr("class", "legend-title")
        .attr("x", CARD.left + PAD)
        .attr("y", CARD.top + PAD)
        .attr("dy", "0.8em")
        .text("PM2.5 exposure by Race/Ethnicity");

    // Bars start at 0 and go right (above the average) or left (below it)
    chart.selectAll("rect.bar")
    .data(data)
    .join("rect")
        .attr("class", "bar")
        .attr("x", d => x(Math.min(0, d.diff)))
        .attr("y", d => y(d.label))
        .attr("width", d => Math.abs(x(d.diff) - x(0)))
        .attr("height", y.bandwidth())
        .attr("fill", d => d.diff > 0 ? ABOVE_COLOR : BELOW_COLOR);

    // Group names on the left, % along the bottom, and a line at 0
    chart.append("g")
        .attr("transform", `translate(${plot.left}, 0)`)
        .call(d3.axisLeft(y).tickSize(4));
    chart.append("g")
        .attr("transform", `translate(0, ${plot.bottom})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d}%`));
    chart.append("line")
        .attr("class", "zero-line")
        .attr("x1", x(0))
        .attr("x2", x(0))
        .attr("y1", plot.top)
        .attr("y2", plot.bottom);
    chart.append("text")
        .attr("x", CARD.left + RACE_CARD_WIDTH / 2)
        .attr("y", plot.bottom + 50)
        .attr("text-anchor", "middle")
        .text("% Difference from Bay Area avg.");
}
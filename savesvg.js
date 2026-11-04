// Press "s" to save everything on the screen (both maps and all the cards) as one SVG file.
// The three SVGs on the page are copied into one big SVG, at the same place and size as on
// the screen, together with the styles from style.css, since a saved SVG can't see style.css.

function saveScreenAsSvg() {
    const maps = document.querySelector(".maps");
    const mapsBox = maps.getBoundingClientRect();
    const NS = "http://www.w3.org/2000/svg";

    const out = document.createElementNS(NS, "svg");
    out.setAttribute("xmlns", NS);
    out.setAttribute("width", mapsBox.width);
    out.setAttribute("height", mapsBox.height);
    out.setAttribute("viewBox", `0 0 ${mapsBox.width} ${mapsBox.height}`);

    // The styles from style.css, minus the page-layout rules (body, .maps, #ids),
    // which only make sense on the web page
    const css = [...document.styleSheets]
        .flatMap(sheet => [...sheet.cssRules])
        .map(rule => rule.cssText)
        .filter(text => !/^(body|\.maps|#)/.test(text))
        .join("\n");
    const style = document.createElementNS(NS, "style");
    style.textContent = css;
    out.appendChild(style);

    // The water: on the page it is the body's background colour
    const water = document.createElementNS(NS, "rect");
    water.setAttribute("width", mapsBox.width);
    water.setAttribute("height", mapsBox.height);
    water.setAttribute("fill", getComputedStyle(document.body).backgroundColor);
    out.appendChild(water);

    // Each SVG, copied in at the spot where it sits on the screen (the overlay goes last, on top)
    for (const svg of maps.querySelectorAll("svg")) {
        const box = svg.getBoundingClientRect();
        const copy = svg.cloneNode(true);
        copy.removeAttribute("id");   // so the page-layout rules for #map etc. can't apply
        copy.setAttribute("x", box.left - mapsBox.left);
        copy.setAttribute("y", box.top - mapsBox.top);
        copy.setAttribute("width", box.width);
        copy.setAttribute("height", box.height);
        out.appendChild(copy);
    }

    // Download it
    const text = new XMLSerializer().serializeToString(out);
    const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "bay_area_pm25.svg";
    link.click();
    URL.revokeObjectURL(url);
}

window.addEventListener("keydown", event => {
    if (event.key === "s") saveScreenAsSvg();
});
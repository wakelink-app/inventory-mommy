import JsBarcode from "jsbarcode";

export function barcodeSvg(
  value: string,
  options?: {
    height?: number;
    width?: number;
  },
) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, {
    format: "CODE128",
    displayValue: false,
    margin: 10,
    height: options?.height ?? 72,
    width: options?.width ?? 2,
    lineColor: "#111111",
    background: "#ffffff",
  });
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.style.display = "block";
  svg.style.width = "100%";
  svg.style.height = "auto";
  return svg.outerHTML;
}

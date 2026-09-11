/** Zebra ZD410 max print width is 2.2 in; 1.25 in is common inventory stock. */
export const LABEL_WIDTH_IN = 2.2;
export const LABEL_HEIGHT_IN = 1.25;
export const LABEL_DPI = 203;

export const LABEL_WIDTH_DOTS = Math.round(LABEL_WIDTH_IN * LABEL_DPI);
export const LABEL_HEIGHT_DOTS = Math.round(LABEL_HEIGHT_IN * LABEL_DPI);

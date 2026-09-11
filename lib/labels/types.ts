export type LabelPayload = {
  name: string;
  sku: string;
  /** Model number shown on product labels when present. */
  model?: string;
  /** Encoded in the bars. Defaults to sku. Bin labels use a short B0001 code. */
  barcode?: string;
  /** Name only, no barcode. Used by Create a label. */
  textOnly?: boolean;
  bin?: boolean;
};


export async function toNodeBuffer(data: unknown): Promise<Buffer> {
  if (!data) throw new Error("Could not read the photo");
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  const maybe = data as { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof maybe.arrayBuffer === "function") {
    return Buffer.from(new Uint8Array(await maybe.arrayBuffer()));
  }
  throw new Error("Could not read the photo");
}

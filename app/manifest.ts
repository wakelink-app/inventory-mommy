import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inventory Mommy",
    short_name: "Inventory Mommy",
    description: "Identify, price, and catalog items by bin.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6fa",
    theme_color: "#5B5CEB",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}

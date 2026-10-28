// @ts-check

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	// Canonical y URLs absolutas para Open Graph
	site: "https://fexsi.cl",
	vite: {
		plugins: [tailwindcss()],
	},
});

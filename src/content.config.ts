import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const projectsCollection = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
	schema: z.object({
		title: z.string(),
		category: z.string(),
		description: z.string(),
		coverImage: z.string(),
		gallery: z.array(z.string()).optional(),
	}),
});

export const collections = {
	projects: projectsCollection,
};

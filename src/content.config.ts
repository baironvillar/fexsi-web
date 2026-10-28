import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const projectsCollection = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
	schema: ({ image }) =>
		z
			.object({
				title: z.string(),
				category: z.string(),
				description: z.string(),
				/** Foto de portada: se optimiza y sirve en webp con srcset. */
				coverImage: image(),
				/** Texto alternativo de la portada. */
				coverAlt: z.string(),
				/** Galería del proyecto: cada foto con su texto alternativo. */
				gallery: z
					.array(
						z.object({
							image: image(),
							alt: z.string(),
						}),
					)
					.optional(),
				/** Video de proceso (archivo estático en /projects). */
				video: z.string().optional(),
				/** Pista de subtítulos del video (WebVTT). */
				videoCaptions: z.string().optional(),
				/** Pista de descripción del video (WebVTT). */
				videoDescriptions: z.string().optional(),
			})
			// Un video sin subtítulos no es accesible: se exige la pista.
			.superRefine((proyecto, ctx) => {
				if (!proyecto.video) return;
				if (!proyecto.videoCaptions) {
					ctx.addIssue({
						code: "custom",
						message: "Un video debe incluir su pista de subtítulos (videoCaptions).",
						path: ["videoCaptions"],
					});
				}
				if (!proyecto.videoDescriptions) {
					ctx.addIssue({
						code: "custom",
						message: "Un video debe incluir su pista de descripción (videoDescriptions).",
						path: ["videoDescriptions"],
					});
				}
			}),
});

export const collections = {
	projects: projectsCollection,
};

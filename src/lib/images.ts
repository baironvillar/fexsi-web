import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";

export type FotoOptimizada = {
	src: string;
	srcset: string;
	sizes: string;
	width: number;
	height: number;
	loading: "lazy" | "eager";
	decoding: "sync" | "async";
	fetchpriority?: "high";
};

type Opciones = {
	/** Anchos en píxeles CSS que se generan. Se ajustan al ancho real del archivo. */
	anchos: number[];
	/** Descriptor `sizes`: le dice al navegador cuánto ocupa la foto en pantalla. */
	sizes: string;
	/** Carga inmediata, para la portada de la ficha de proyecto. */
	priority?: boolean;
};

/**
 * Convierte una foto local a webp y arma el `srcset`.
 *
 * No recorta: se conserva la proporción original y el encuadre final lo resuelve
 * el CSS (`object-cover`), igual que antes de integrar el pipeline de imágenes.
 */
export async function optimizarFoto(
	foto: ImageMetadata,
	opciones: Opciones,
): Promise<FotoOptimizada> {
	// El ancho final es el mayor pedido, recortado al ancho real del archivo
	// para no ampliar una foto más chica que lo solicitado.
	const anchoMaximo = Math.min(Math.max(...opciones.anchos), foto.width);
	const anchos = [
		...new Set([...opciones.anchos.filter((a) => a <= anchoMaximo), anchoMaximo]),
	].sort((a, b) => a - b);

	const imagen = await getImage({
		src: foto,
		width: anchoMaximo,
		widths: anchos,
		sizes: opciones.sizes,
		priority: opciones.priority,
	});

	const atributos = imagen.attributes as Record<string, unknown>;

	return {
		src: imagen.src,
		srcset: imagen.srcSet.attribute,
		sizes: opciones.sizes,
		width: Number(atributos.width),
		height: Number(atributos.height),
		loading: (atributos.loading as "lazy" | "eager") ?? "lazy",
		decoding: (atributos.decoding as "sync" | "async") ?? "async",
		fetchpriority: atributos.fetchpriority as "high" | undefined,
	};
}

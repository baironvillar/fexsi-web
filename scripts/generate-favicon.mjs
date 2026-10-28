/**
 * Genera los iconos del sitio a partir de `public/images/logo-fexsi.webp`.
 *
 * El logo es un PNG cuadrado de 80×80 sobre fondo blanco, sin canal alfa.
 * Para usarlo como favicon hay que quitarle el fondo: se calcula la
 * cobertura por píxel (cuánto se aleja del blanco) y se deja el color
 * intacto, con una rampa suave en la franja antialiaseada.
 *
 * Salidas:
 *   public/favicon.png       180×180 con alfa (apple-touch-icon y fallback)
 *   public/favicon-32.png    32×32 con alfa (pestaña del navegador)
 *   public/favicon.ico       16/32/48 px con alfa (navegadores antiguos)
 *
 * Uso: node scripts/generate-favicon.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "public", "images", "logo-fexsi.webp");

/** Quita el fondo blanco devolviendo un PNG con canal alfa. */
async function sinFondoBlanco(destino, size) {
	const { data, info } = await sharp(SOURCE)
		.ensureAlpha()
		.resize(size, size, { fit: "fill", kernel: "lanczos3" })
		.raw()
		.toBuffer({ resolveWithObject: true });

	const { width, height, channels } = info;
	for (let i = 0; i < width * height; i++) {
		const p = i * channels;
		const min = Math.min(data[p], data[p + 1], data[p + 2]);
		// 235+ es fondo; 215..235 es la franja antialiaseada.
		let alfa = 255;
		if (min >= 235) alfa = 0;
		else if (min > 215) alfa = Math.round(((235 - min) / 20) * 255);
		data[p + 3] = alfa;
	}

	await sharp(data, { raw: { width, height, channels } })
		.png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 })
		.toFile(destino);
}

/** Empaqueta varios PNG en un ICO (entradas con PNG: Windows Vista+). */
function empaquetarIco(entradas) {
	const cabecera = Buffer.alloc(6);
	cabecera.writeUInt16LE(0, 0); // reservado
	cabecera.writeUInt16LE(1, 2); // tipo 1 = icono
	cabecera.writeUInt16LE(entradas.length, 4);

	const directorio = Buffer.alloc(16 * entradas.length);
	let offset = 6 + directorio.length;
	const cuerpos = [];

	entradas.forEach((entrada, i) => {
		const p = i * 16;
		directorio.writeUInt8(entrada.size >= 256 ? 0 : entrada.size, p);
		directorio.writeUInt8(entrada.size >= 256 ? 0 : entrada.size, p + 1);
		directorio.writeUInt8(0, p + 2); // paleta
		directorio.writeUInt8(0, p + 3); // reservado
		directorio.writeUInt16LE(1, p + 4); // planos
		directorio.writeUInt16LE(32, p + 6); // bpp
		directorio.writeUInt32LE(entrada.datos.length, p + 8);
		directorio.writeUInt32LE(offset, p + 12);
		offset += entrada.datos.length;
		cuerpos.push(entrada.datos);
	});

	return Buffer.concat([cabecera, directorio, ...cuerpos]);
}

async function main() {
	const publicDir = join(root, "public");
	mkdirSync(publicDir, { recursive: true });

	await sinFondoBlanco(join(publicDir, "favicon.png"), 180);
	await sinFondoBlanco(join(publicDir, "favicon-32.png"), 32);

	const entradas = [];
	for (const size of [16, 32, 48]) {
		const buffer = await sharp(SOURCE)
			.ensureAlpha()
			.resize(size, size, { fit: "fill", kernel: "lanczos3" })
			.raw()
			.toBuffer({ resolveWithObject: true });
		const { data, info } = buffer;
		for (let i = 0; i < info.width * info.height; i++) {
			const p = i * info.channels;
			const min = Math.min(data[p], data[p + 1], data[p + 2]);
			let alfa = 255;
			if (min >= 235) alfa = 0;
			else if (min > 215) alfa = Math.round(((235 - min) / 20) * 255);
			data[p + 3] = alfa;
		}
		const png = await sharp(data, { raw: { ...info } })
			.png({ compressionLevel: 9 })
			.toBuffer();
		entradas.push({ size, datos: png });
	}

	writeFileSync(join(publicDir, "favicon.ico"), empaquetarIco(entradas));
	console.log("favicon.png, favicon-32.png y favicon.ico generados");
}

await main();

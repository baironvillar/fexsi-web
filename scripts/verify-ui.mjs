/**
 * Arnés de verificación funcional del frontend (Fexsi SpA).
 *
 * Levanta Edge/Chrome headless, se conecta por CDP con el `WebSocket` nativo de Node 22+
 * (sin dependencias) y comprueba el comportamiento real de la interfaz:
 *
 *   A. Layout de escritorio (1280x800)
 *   B. Scroll spy (aria-current en la sección activa)
 *   C. Formulario: envío exitoso (fetch simulado, sin salir a la red)
 *   D. Formulario: error de conexión (fetch simulado)
 *   D2. Formulario: respuesta 500 del servidor (fetch simulada)
 *   D3. Formulario: validación antes de enviar (no sale nada a la red)
 *   D4. Formulario: payload con los nombres reservados de Web3Forms
 *   E. Lightbox de galería
 *   E2. Galería: todas las fotos visibles (no carrusel)
 *   F. Menú móvil (390x844): apertura, cierre, Escape, clic en enlace
 *   G. Menú móvil sin JavaScript: la navegación sigue disponible
 *
 * La petición a Web3Forms NUNCA sale de la máquina: el `fetch` se sustituye por un stub
 * dentro de la página, sin tocar la lógica del formulario.
 *
 * Uso:
 *   node scripts/verify-ui.mjs                     # contra http://127.0.0.1:4321
 *   node scripts/verify-ui.mjs http://localhost:4322
 *
 * Requiere el sitio servido (`pnpm dev` o `pnpm preview`).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BROWSER_CANDIDATES = [
	process.env.CHROME_PATH,
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
].filter(Boolean);

const browserPath = BROWSER_CANDIDATES.find((p) => existsSync(p));
if (!browserPath) {
	console.error("No se encontró Chrome/Edge. Define CHROME_PATH con la ruta al ejecutable.");
	process.exit(1);
}

const PORT = Number(process.env.CDP_PORT || 9222);
const base = (process.argv[2] || "http://127.0.0.1:4321").replace(/\/$/, "");
const userDataDir = mkdtempSync(join(tmpdir(), "fexsi-cdp-"));

const browser = spawn(
	browserPath,
	[
		"--headless=new",
		`--remote-debugging-port=${PORT}`,
		`--user-data-dir=${userDataDir}`,
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-gpu",
		"--hide-scrollbars",
		"about:blank",
	],
	{ stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools() {
	for (let i = 0; i < 60; i++) {
		try {
			const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
			if (res.ok) return;
		} catch {
			/* aún no levanta */
		}
		await sleep(250);
	}
	throw new Error("El puerto de DevTools no respondió");
}

/** Cliente CDP mínimo sobre el WebSocket nativo de Node. */
class CDP {
	constructor(ws) {
		this.ws = ws;
		this.id = 0;
		this.pending = new Map();
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.id && this.pending.has(msg.id)) {
				const { resolve, reject } = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				if (msg.error) reject(new Error(msg.error.message));
				else resolve(msg.result);
			}
		});
	}
	send(method, params = {}) {
		const id = ++this.id;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.ws.send(JSON.stringify({ id, method, params }));
			setTimeout(() => {
				if (this.pending.has(id)) {
					this.pending.delete(id);
					reject(new Error(`timeout en ${method}`));
				}
			}, 20000);
		});
	}
	async evaluate(expression) {
		const r = await this.send("Runtime.evaluate", {
			expression,
			returnByValue: true,
			awaitPromise: true,
		});
		if (r.exceptionDetails) {
			throw new Error(
				`excepción en la página: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ""}`,
			);
		}
		return r.result.value;
	}
}

let failures = 0;
function assert(name, condition, detail = "") {
	const ok = Boolean(condition);
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`);
	if (!ok) {
		failures++;
		process.exitCode = 1;
	}
}

async function openTab(url, { width = 1280, height = 800, scripts = true } = {}) {
	const target = await (
		await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })
	).json();
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		ws.addEventListener("open", resolve, { once: true });
		ws.addEventListener("error", () => reject(new Error("no se pudo abrir el WebSocket")), {
			once: true,
		});
	});
	const cdp = new CDP(ws);
	await cdp.send("Page.enable");
	await cdp.send("Runtime.enable");
	if (!scripts) await cdp.send("Emulation.setScriptExecutionDisabled", { value: true });
	await cdp.send("Emulation.setDeviceMetricsOverride", {
		width,
		height,
		deviceScaleFactor: 1,
		mobile: width < 500,
	});
	await cdp.send("Page.navigate", { url });
	await sleep(2200);
	return { cdp, ws };
}

/** Rellena el formulario y lo envía con un `fetch` simulado según el guion indicado. */
const SUBMIT_FORM = (mode) => `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.includes('web3forms.com')) return originalFetch(input, init);
    window.__mockCalled = (window.__mockCalled || 0) + 1;
    if (${JSON.stringify(mode)} === 'error') throw new TypeError('Failed to fetch');
    if (${JSON.stringify(mode)} === 'http500') return new Response('{"message":"error"}', { status: 500 });
    return new Response(JSON.stringify({ success: true, message: 'OK simulado' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  const form = document.getElementById('contact-form');
  form.querySelector('#name').value = 'Prueba Local';
  form.querySelector('#email').value = 'prueba@example.cl';
  form.querySelector('#message').value = 'Mensaje de prueba simulado en local.';
  form.requestSubmit();
  await wait(2000);
  const status = document.getElementById('form-status');
  const cs = getComputedStyle(status);
  const out = {
    text: status.textContent.trim(),
    hiddenClass: status.classList.contains('hidden'),
    display: cs.display,
    color: cs.color,
    bg: cs.backgroundColor,
    buttonText: document.getElementById('button-text').textContent.trim(),
    buttonDisabled: document.getElementById('submit-button').disabled,
    spinnerHidden: document.getElementById('loading-spinner').classList.contains('hidden'),
    nameValue: form.querySelector('#name').value,
    mockCalls: window.__mockCalled || 0,
    role: status.getAttribute('role'),
    ariaLive: status.getAttribute('aria-live'),
  };
  window.fetch = originalFetch;
  return out;
})()`;

/** Envía el formulario vacío: no debe salir ninguna petición a la red. */
const SUBMIT_FORM_EMPTY = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.includes('web3forms.com')) return originalFetch(input, init);
    window.__mockCalled = (window.__mockCalled || 0) + 1;
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  const form = document.getElementById('contact-form');
  form.querySelector('#name').value = '';
  form.querySelector('#email').value = '';
  form.querySelector('#message').value = '';
  form.requestSubmit();
  await wait(1200);
  const status = document.getElementById('form-status');
  const out = {
    text: status.textContent.trim(),
    hiddenClass: status.classList.contains('hidden'),
    mockCalls: window.__mockCalled || 0,
    nameInvalid: form.querySelector('#name').getAttribute('aria-invalid'),
    emailInvalid: form.querySelector('#email').getAttribute('aria-invalid'),
    messageInvalid: form.querySelector('#message').getAttribute('aria-invalid'),
    focused: document.activeElement ? document.activeElement.id : null,
    buttonText: document.getElementById('button-text').textContent.trim(),
  };
  window.fetch = originalFetch;
  return out;
})()`;

/** Captura el payload real que se manda a Web3Forms. */
const SUBMIT_FORM_PAYLOAD = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const originalFetch = window.fetch;
  window.__payload = null;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.includes('web3forms.com')) return originalFetch(input, init);
    window.__payload = { url, body: init && init.body ? JSON.parse(init.body) : null };
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  const form = document.getElementById('contact-form');
  form.querySelector('#name').value = 'Prueba Local';
  form.querySelector('#company').value = 'Empresa de prueba';
  form.querySelector('#email').value = 'prueba@example.cl';
  form.querySelector('#message').value = 'Mensaje de prueba.';
  form.requestSubmit();
  await wait(1200);
  const out = { payload: window.__payload };
  window.fetch = originalFetch;
  return out;
})()`;

try {
	await waitForDevtools();

	// ---------- A. Layout de escritorio ----------
	console.log("\n== A. Escritorio (1280x800) ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/`);
		const layout = await cdp.evaluate(`(() => {
      const deskNav = document.querySelector('nav[aria-label="Principal"]');
      const btn = document.getElementById('mobile-menu-btn');
      const menu = document.getElementById('mobile-menu');
      const cs = (el) => (el ? getComputedStyle(el).display : null);
      return {
        deskNav: cs(deskNav),
        deskNavLinks: deskNav ? deskNav.querySelectorAll('a').length : 0,
        btn: cs(btn),
        menu: cs(menu),
      };
    })()`);
		console.log("layout:", JSON.stringify(layout));
		assert(
			"la navegación de escritorio es visible",
			layout.deskNav === "flex",
			`display=${layout.deskNav}`,
		);
		assert(
			"la navegación de escritorio tiene enlaces",
			layout.deskNavLinks >= 4,
			`enlaces=${layout.deskNavLinks}`,
		);
		assert(
			"el botón hamburguesa está oculto en escritorio",
			layout.btn === "none",
			`display=${layout.btn}`,
		);
		assert(
			"el panel móvil está oculto en escritorio",
			layout.menu === "none",
			`display=${layout.menu}`,
		);
		ws.close();
	}

	// ---------- B. Scroll spy ----------
	console.log("\n== B. Scroll spy ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/`);
		const spy = await cdp.evaluate(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const read = () => {
        const links = [...document.querySelectorAll('nav[aria-label="Principal"] a')];
        return {
          active: links.filter((l) => l.getAttribute('aria-current') === 'true').map((l) => l.getAttribute('href')),
          dataActive: links.filter((l) => l.dataset.active === 'true').length,
        };
      };
      const before = read();
      document.getElementById('servicios').scrollIntoView({ behavior: 'instant', block: 'start' });
      await wait(1200);
      return { before, after: read() };
    })()`);
		console.log("scroll spy:", JSON.stringify(spy));
		assert(
			"al inicio no hay sección activa",
			spy.before.active.length === 0,
			JSON.stringify(spy.before.active),
		);
		assert(
			"al llegar a Servicios se marca aria-current",
			spy.after.active.includes("/#servicios"),
			JSON.stringify(spy.after.active),
		);
		assert(
			"el enlace activo recibe data-active",
			spy.after.dataActive === 1,
			`data-active=${spy.after.dataActive}`,
		);
		ws.close();
	}

	// ---------- C. Formulario: éxito ----------
	console.log("\n== C. Formulario: envío exitoso (fetch simulado, sin red) ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/`);
		const result = await cdp.evaluate(SUBMIT_FORM("ok"));
		console.log("resultado:", JSON.stringify(result));
		assert(
			"la petición se simuló localmente",
			result.mockCalls === 1,
			`llamadas=${result.mockCalls}`,
		);
		assert(
			"se muestra el mensaje de éxito",
			result.text.includes("éxito"),
			`texto="${result.text}"`,
		);
		assert(
			"el mensaje es visible (no hidden)",
			result.hiddenClass === false && result.display !== "none",
			`hidden=${result.hiddenClass} display=${result.display}`,
		);
		assert(
			"el mensaje usa el tono de éxito",
			result.bg.includes("240, 249, 236") && result.color.includes("22, 101, 52"),
			`color=${result.color} bg=${result.bg}`,
		);
		assert(
			"el botón vuelve a su estado normal",
			result.buttonText === "Enviar mensaje" && result.buttonDisabled === false,
			`texto="${result.buttonText}"`,
		);
		assert("el spinner se oculta", result.spinnerHidden === true);
		assert(
			"el formulario se resetea tras el éxito",
			result.nameValue === "",
			`name="${result.nameValue}"`,
		);
		assert(
			"el mensaje se anuncia a lectores de pantalla",
			result.role === "status" && result.ariaLive === "polite",
			`role=${result.role} aria-live=${result.ariaLive}`,
		);
		ws.close();
	}

	// ---------- D. Formulario: error de conexión ----------
	console.log("\n== D. Formulario: error de conexión (simulado) ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/`);
		const result = await cdp.evaluate(SUBMIT_FORM("error"));
		console.log("resultado:", JSON.stringify(result));
		assert(
			"se muestra el mensaje de error de conexión",
			result.text.includes("Error de conexión"),
			`texto="${result.text}"`,
		);
		assert(
			"el mensaje de error es visible",
			result.hiddenClass === false && result.display !== "none",
			`hidden=${result.hiddenClass}`,
		);
		assert(
			"el botón se rehabilita tras el error",
			result.buttonText === "Enviar mensaje" && result.buttonDisabled === false,
			`texto="${result.buttonText}"`,
		);
		ws.close();
	}

	// ---------- D2. Formulario: error HTTP del servidor ----------
	console.log("\n== D2. Formulario: respuesta 500 del servidor (simulada) ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/`);
		const result = await cdp.evaluate(SUBMIT_FORM("http500"));
		console.log("resultado:", JSON.stringify(result));
		assert(
			"se muestra el mensaje de error del servidor",
			result.text.includes("Hubo un error"),
			`texto="${result.text}"`,
		);
		assert(
			"el mensaje de error es visible",
			result.hiddenClass === false && result.display !== "none",
			`hidden=${result.hiddenClass}`,
		);
		assert(
			"el mensaje usa el tono de error",
			result.bg.includes("254, 226, 226") && result.color.includes("153, 27, 27"),
			`color=${result.color} bg=${result.bg}`,
		);
		assert(
			"el formulario NO se resetea en error",
			result.nameValue === "Prueba Local",
			`name="${result.nameValue}"`,
		);
		ws.close();
	}

	// ---------- D3. Formulario: validación antes de enviar ----------
	console.log("\n== D3. Formulario: validación y payload real ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/`);
		const vacio = await cdp.evaluate(SUBMIT_FORM_EMPTY);
		console.log("formulario vacío:", JSON.stringify(vacio));
		assert(
			"el formulario vacío no manda nada a la red",
			vacio.mockCalls === 0,
			`peticiones=${vacio.mockCalls}`,
		);
		assert(
			"el formulario vacío avisa qué falta",
			vacio.text.includes("Complete") && vacio.hiddenClass === false,
			`texto="${vacio.text}"`,
		);
		assert(
			"los campos con problema quedan marcados",
			vacio.nameInvalid === "true" &&
				vacio.emailInvalid === "true" &&
				vacio.messageInvalid === "true",
			`name=${vacio.nameInvalid} email=${vacio.emailInvalid} message=${vacio.messageInvalid}`,
		);
		assert(
			"el foco va al primer campo con problema",
			vacio.focused === "name",
			`foco=${vacio.focused}`,
		);
		ws.close();
	}

	// ---------- D4. Formulario: payload con los nombres de Web3Forms ----------
	{
		const { cdp, ws } = await openTab(`${base}/`);
		const conDatos = await cdp.evaluate(SUBMIT_FORM_PAYLOAD);
		const body = conDatos.payload ? conDatos.payload.body : null;
		console.log("payload:", JSON.stringify(body));
		assert(
			"el envío usa los nombres reservados de Web3Forms",
			body?.name && body.email && body.message && body.access_key && body.subject && body.from_name,
			`claves=${body ? Object.keys(body).join(",") : "sin body"}`,
		);
		assert(
			"el correo del visitante va en 'email' (para poder responder)",
			body && body.email === "prueba@example.cl",
			`email=${body ? body.email : "-"}`,
		);
		assert(
			"la empresa se envía como campo propio",
			body && body.Empresa === "Empresa de prueba",
			`Empresa=${body ? body.Empresa : "-"}`,
		);
		assert(
			"la trampa para bots no viaja en el payload",
			body && body.botcheck === undefined,
			`botcheck=${body ? String(body.botcheck) : "-"}`,
		);
		ws.close();
	}

	// ---------- E. Lightbox ----------
	console.log("\n== E. Lightbox de galería ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/proyectos/fabricacion-tolvas/`);
		const lb = await cdp.evaluate(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const thumbs = [...document.querySelectorAll('.group[data-index]')];
      const lightbox = document.getElementById('lightbox');
      if (!thumbs.length) return { error: 'no hay miniaturas en la galería' };
      thumbs[0].click();
      await wait(2500);
      const img = lightbox.querySelector('img');
      const openState = {
        thumbs: thumbs.length,
        lightboxHidden: lightbox.classList.contains('hidden'),
        lightboxOpacity: getComputedStyle(lightbox).opacity,
        imgExists: !!img,
        imgHasSrc: img ? !!img.getAttribute('src') : false,
        imgNaturalWidth: img ? img.naturalWidth : 0,
        imgOpacity: img ? getComputedStyle(img).opacity : null,
        counter: document.getElementById('lightbox-counter').textContent.trim(),
        focusInside: lightbox.contains(document.activeElement),
        bodyOverflow: document.body.style.overflow,
      };
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(700);
      return {
        openState,
        closedState: {
          lightboxHidden: lightbox.classList.contains('hidden'),
          bodyOverflow: document.body.style.overflow,
        },
      };
    })()`);
		console.log("lightbox:", JSON.stringify(lb));
		assert(
			"hay miniaturas en la galería",
			lb.openState?.thumbs > 0,
			`miniaturas=${lb.openState?.thumbs}`,
		);
		assert(
			"el lightbox se abre",
			lb.openState?.lightboxHidden === false,
			`hidden=${lb.openState?.lightboxHidden}`,
		);
		assert("la imagen del lightbox tiene src real", lb.openState?.imgHasSrc === true);
		assert(
			"la imagen del lightbox carga (no rota)",
			lb.openState?.imgNaturalWidth > 0,
			`naturalWidth=${lb.openState?.imgNaturalWidth}`,
		);
		assert(
			"la imagen queda opaca",
			lb.openState?.imgOpacity === "1",
			`opacity=${lb.openState?.imgOpacity}`,
		);
		assert(
			"el contador refleja la galería",
			/\d+\s*\/\s*\d+/.test(lb.openState?.counter ?? ""),
			`contador="${lb.openState?.counter}"`,
		);
		assert("el foco entra al lightbox", lb.openState?.focusInside === true);
		assert("el scroll del body se bloquea al abrir", lb.openState?.bodyOverflow === "hidden");
		assert("Escape cierra el lightbox", lb.closedState?.lightboxHidden === true);
		assert("el scroll del body se restaura", lb.closedState?.bodyOverflow === "");
		ws.close();
	}

	// ---------- E2. La galería muestra todas las fotos ----------
	console.log("\n== E2. Galería: todas las fotos visibles (1280x900) ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/proyectos/montaje-industrial/`);
		const gal = await cdp.evaluate(`(() => {
      const thumbs = [...document.querySelectorAll('.group[data-index]')];
      const cont = thumbs[0] ? thumbs[0].parentElement : null;
      if (!cont) return { error: 'no hay contenedor de galería' };
      const cs = getComputedStyle(cont);
      const contRect = cont.getBoundingClientRect();
      // Una foto queda "escondida" si su caja se sale del contenedor: eso es
      // lo que pasaba con el carrusel horizontal (solo se veían 3 de 21).
      const fuera = thumbs.filter((t) => {
        const r = t.getBoundingClientRect();
        return r.right > contRect.right + 1 || r.left < contRect.left - 1;
      }).length;
      const sinAltura = thumbs.filter((t) => t.getBoundingClientRect().height < 40).length;
      const titulo = document.querySelector('h2 + p');
      return {
        thumbs: thumbs.length,
        overflowX: cont.scrollWidth - cont.clientWidth,
        columnCount: cs.columnCount,
        fuera,
        sinAltura,
        contador: titulo ? titulo.textContent.replace(/\\s+/g, ' ').trim() : '',
        distintos: new Set(thumbs.map((t) => t.dataset.full)).size,
      };
    })()`);
		console.log("galería:", JSON.stringify(gal));
		assert(
			"la galería trae todas las fotos del proyecto",
			gal.thumbs === 20 && gal.distintos === 20,
			`miniaturas=${gal.thumbs} distintas=${gal.distintos}`,
		);
		assert(
			"ninguna foto queda escondida fuera del contenedor",
			gal.fuera === 0,
			`fuera=${gal.fuera}`,
		);
		assert(
			"la galería no es un carrusel horizontal",
			gal.overflowX <= 1,
			`desborde=${gal.overflowX}px columnas=${gal.columnCount}`,
		);
		assert(
			"todas las miniaturas tienen altura visible",
			gal.sinAltura === 0,
			`sin altura=${gal.sinAltura}`,
		);
		assert(
			"el encabezado declara cuántas fotos hay",
			gal.contador.includes("20"),
			`contador="${gal.contador}"`,
		);
		ws.close();
	}

	// ---------- E3. La galería en móvil ----------
	console.log("\n== E3. Galería en móvil (390x844) ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/proyectos/montaje-industrial/`, {
			width: 390,
			height: 844,
		});
		const gal = await cdp.evaluate(`(() => {
      const thumbs = [...document.querySelectorAll('.group[data-index]')];
      const cont = thumbs[0] ? thumbs[0].parentElement : null;
      if (!cont) return { error: 'no hay contenedor de galería' };
      const cs = getComputedStyle(cont);
      const contRect = cont.getBoundingClientRect();
      const fuera = thumbs.filter((t) => {
        const r = t.getBoundingClientRect();
        return r.right > contRect.right + 1 || r.left < contRect.left - 1;
      }).length;
      const anchos = thumbs.map((t) => Math.round(t.getBoundingClientRect().width));
      return {
        thumbs: thumbs.length,
        columnCount: cs.columnCount,
        overflowX: cont.scrollWidth - cont.clientWidth,
        fuera,
        anchoMin: Math.min(...anchos),
        anchoMax: Math.max(...anchos),
        altoMin: Math.min(...thumbs.map((t) => Math.round(t.getBoundingClientRect().height))),
      };
    })()`);
		console.log("galería móvil:", JSON.stringify(gal));
		assert("en móvil se ven las 20 fotos", gal.thumbs === 20, `miniaturas=${gal.thumbs}`);
		assert(
			"en móvil la galería usa dos columnas",
			gal.columnCount === "2",
			`columnas=${gal.columnCount}`,
		);
		assert(
			"en móvil no hay desbordes horizontales",
			gal.overflowX <= 1 && gal.fuera === 0,
			`desborde=${gal.overflowX}px fuera=${gal.fuera}`,
		);
		assert(
			"en móvil las miniaturas tienen ancho legible",
			gal.anchoMin >= 120,
			`ancho=${gal.anchoMin}-${gal.anchoMax}px`,
		);
		ws.close();
	}

	// ---------- F. Menú móvil ----------
	console.log("\n== F. Menú móvil (390x844) ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/`, { width: 390, height: 844 });
		const menu = await cdp.evaluate(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const btn = document.getElementById('mobile-menu-btn');
      const panel = document.getElementById('mobile-menu');
      const initial = {
        visible: getComputedStyle(btn).display !== 'none',
        expanded: btn.getAttribute('aria-expanded'),
        ariaLabel: btn.getAttribute('aria-label'),
        controls: btn.getAttribute('aria-controls'),
        panelDisplay: getComputedStyle(panel).display,
        bound: btn.dataset.bound ?? null,
      };
      btn.click();
      await wait(400);
      const opened = {
        expanded: btn.getAttribute('aria-expanded'),
        ariaLabel: btn.getAttribute('aria-label'),
        panelDisplay: getComputedStyle(panel).display,
        linkVisible: (() => {
          const link = panel.querySelector('a');
          return link ? link.getBoundingClientRect().width > 0 : false;
        })(),
      };
      btn.click();
      await wait(200);
      const closed = {
        expanded: btn.getAttribute('aria-expanded'),
        ariaLabel: btn.getAttribute('aria-label'),
        panelDisplay: getComputedStyle(panel).display,
      };
      btn.click();
      await wait(200);
      panel.querySelector('.mobile-link').click();
      await wait(200);
      const afterLink = { expanded: btn.getAttribute('aria-expanded') };
      btn.click();
      const openedBeforeEsc = btn.getAttribute('aria-expanded');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(200);
      const afterEsc = { expanded: btn.getAttribute('aria-expanded') };
      return { initial, opened, closed, afterLink, openedBeforeEsc, afterEsc };
    })()`);
		console.log("menú móvil:", JSON.stringify(menu));
		assert("el botón de menú móvil existe y es visible", menu.initial.visible === true);
		assert(
			'aria-expanded arranca en "false"',
			menu.initial.expanded === "false",
			`valor=${menu.initial.expanded}`,
		);
		assert(
			"el panel arranca oculto",
			menu.initial.panelDisplay === "none",
			`display=${menu.initial.panelDisplay}`,
		);
		assert("aria-controls apunta al panel", menu.initial.controls === "mobile-menu");
		assert("el script se enlazó (data-bound)", menu.initial.bound === "true");
		assert(
			"el primer clic abre el menú",
			menu.opened.expanded === "true",
			`valor=${menu.opened.expanded}`,
		);
		assert(
			"el panel se muestra",
			menu.opened.panelDisplay !== "none",
			`display=${menu.opened.panelDisplay}`,
		);
		assert("el enlace del menú es visible", menu.opened.linkVisible === true);
		assert(
			"el segundo clic cierra el menú",
			menu.closed.expanded === "false",
			`valor=${menu.closed.expanded}`,
		);
		assert(
			"el panel se oculta de nuevo",
			menu.closed.panelDisplay === "none",
			`display=${menu.closed.panelDisplay}`,
		);
		assert('aria-label vuelve a "Abrir menú"', menu.closed.ariaLabel === "Abrir menú");
		assert("el menú se cierra al navegar", menu.afterLink.expanded === "false");
		assert(
			"Escape cierra el menú abierto",
			menu.openedBeforeEsc === "true" && menu.afterEsc.expanded === "false",
			JSON.stringify(menu.afterEsc),
		);
		ws.close();
	}

	// ---------- G. Sin JavaScript ----------
	console.log("\n== G. Sin JavaScript (390x844) ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/`, { width: 390, height: 844, scripts: false });
		const noJs = await cdp.evaluate(`(() => {
      const panel = document.getElementById('mobile-menu');
      const btn = document.getElementById('mobile-menu-btn');
      const h1 = document.querySelector('h1');
      const link = panel ? panel.querySelector('.mobile-link') : null;
      return {
        htmlClass: document.documentElement.className,
        panelDisplay: panel ? getComputedStyle(panel).display : null,
        panelLinks: panel ? panel.querySelectorAll('a').length : 0,
        linkVisible: link ? link.getBoundingClientRect().width > 0 : null,
        btnDisplay: btn ? getComputedStyle(btn).display : null,
        h1Opacity: h1 ? getComputedStyle(h1).opacity : null,
        h1Text: h1 ? h1.innerText.slice(0, 40) : null,
      };
    })()`);
		console.log("sin JS:", JSON.stringify(noJs));
		assert(
			"la navegación sigue visible sin JS",
			noJs.panelDisplay !== "none",
			`display=${noJs.panelDisplay}`,
		);
		assert(
			"los enlaces son visibles sin JS",
			noJs.linkVisible === true && noJs.panelLinks >= 4,
			`enlaces=${noJs.panelLinks}`,
		);
		assert(
			"el botón hamburguesa se oculta sin JS",
			noJs.btnDisplay === "none",
			`display=${noJs.btnDisplay}`,
		);
		assert("el contenido principal es visible sin JS", noJs.h1Opacity === "1" && !!noJs.h1Text);
		assert(
			"no se marca la clase html.js sin JS",
			!String(noJs.htmlClass).includes("js"),
			`class="${noJs.htmlClass}"`,
		);
		ws.close();
	}

	// ---------- H. Grid de "Proyectos destacados" ----------
	console.log("\n== H. Grid de proyectos destacados (1280x900) ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/`);
		const geo = await cdp.evaluate(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.getElementById('proyectos').scrollIntoView({ behavior: 'instant', block: 'start' });
      await wait(1000);
      const cards = [...document.querySelectorAll('#proyectos a[href^="/proyectos/"]')];
      return cards.map((c) => {
        const r = c.getBoundingClientRect();
        return {
          title: c.querySelector('h3')?.textContent.trim(),
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height),
          bottom: Math.round(r.bottom),
        };
      });
    })()`);
		console.log("cajas:", JSON.stringify(geo));
		const [lead, ...tiles] = geo;
		const maxBottom = Math.max(...geo.map((b) => b.bottom));
		const hole = maxBottom - lead.bottom;
		assert(
			"el proyecto principal es el más ancho",
			lead.w > tiles[0].w,
			`lead=${lead.w} tile=${tiles[0].w}`,
		);
		assert("no queda hueco bajo el proyecto principal", hole <= 12, `hueco=${hole}px`);
		assert(
			"las fichas laterales comparten columna y ancho",
			tiles[0].x === tiles[1].x && tiles[0].w === tiles[1].w,
			`x=${tiles[0].x}/${tiles[1].x} w=${tiles[0].w}/${tiles[1].w}`,
		);
		assert(
			"las fichas laterales están apiladas",
			tiles[1].y > tiles[0].bottom,
			`y=${tiles[1].y} bottom=${tiles[0].bottom}`,
		);
		ws.close();
	}

	// ---------- I. Navegación entre páginas: sin scroll animado ----------
	console.log("\n== I. Navegación entre páginas (anclas y botón atrás) ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/proyectos/fabricacion-tolvas/`);
		const nav = await cdp.evaluate(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const samples = [];
      const sampler = setInterval(() => samples.push(Math.round(window.scrollY)), 50);
      const link = [...document.querySelectorAll('a')].find((a) => a.textContent.includes('Volver a proyectos'));
      link.click();
      await wait(3000);
      clearInterval(sampler);
      const target = document.getElementById('proyectos');
      return {
        distinct: [...new Set(samples)].length,
        url: location.href,
        targetTop: target ? Math.round(target.getBoundingClientRect().top) : null,
      };
    })()`);
		console.log("volver a proyectos:", JSON.stringify(nav));
		assert("llega al ancla #proyectos", nav.url.includes("#proyectos"), nav.url);
		assert(
			"el salto es instantáneo, no una recorrida desde arriba",
			nav.distinct <= 3,
			`posiciones distintas=${nav.distinct}`,
		);
		assert(
			"la sección queda bajo el header",
			nav.targetTop !== null && Math.abs(nav.targetTop - 88) < 40,
			`top=${nav.targetTop}`,
		);
		ws.close();
	}
	{
		const { cdp, ws } = await openTab(`${base}/`);
		const back = await cdp.evaluate(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.getElementById('proyectos').scrollIntoView({ behavior: 'instant', block: 'start' });
      await wait(800);
      const before = Math.round(window.scrollY);
      document.querySelector('#proyectos a[href^="/proyectos/"]').click();
      await wait(2500);
      const samples = [];
      const sampler = setInterval(() => samples.push(Math.round(window.scrollY)), 50);
      history.back();
      await wait(3000);
      clearInterval(sampler);
      return {
        before,
        distinct: [...new Set(samples)].length,
        finalY: Math.round(window.scrollY),
        path: location.pathname,
      };
    })()`);
		console.log("botón atrás:", JSON.stringify(back));
		assert("el botón atrás regresa al inicio", back.path === "/", back.path);
		assert(
			"la restauración del scroll es instantánea",
			back.distinct <= 3,
			`posiciones distintas=${back.distinct}`,
		);
		assert(
			"vuelve a la posición anterior",
			Math.abs(back.finalY - back.before) <= 8,
			`antes=${back.before} después=${back.finalY}`,
		);
		ws.close();
	}
	{
		const { cdp, ws } = await openTab(`${base}/`);
		const anchor = await cdp.evaluate(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const samples = [];
      const sampler = setInterval(() => samples.push(Math.round(window.scrollY)), 40);
      const link = [...document.querySelectorAll('header nav a')].find((a) => a.getAttribute('href') === '/#servicios');
      link.click();
      await wait(2200);
      clearInterval(sampler);
      const target = document.getElementById('servicios');
      return {
        distinct: [...new Set(samples)].length,
        url: location.href,
        targetTop: target ? Math.round(target.getBoundingClientRect().top) : null,
      };
    })()`);
		console.log("ancla interna:", JSON.stringify(anchor));
		assert("el ancla interna se aplica", anchor.url.includes("#servicios"), anchor.url);
		assert(
			"el ancla interna se desplaza de forma suave",
			anchor.distinct > 8,
			`posiciones distintas=${anchor.distinct}`,
		);
		ws.close();
	}

	// ---------- J. Transición de vista de "Proyectos destacados" ----------
	console.log("\n== J. Transición de vista (proyecto destacado) ==\n");
	{
		const { cdp, ws } = await openTab(`${base}/`);
		const vt = await cdp.evaluate(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.getElementById('proyectos').scrollIntoView({ behavior: 'instant', block: 'start' });
      await wait(600);
      const link = document.querySelector('#proyectos a[href^="/proyectos/"]');
      const slug = link.getAttribute('href').split('/').pop();
      const probes = [];
      const original = document.startViewTransition.bind(document);
      document.startViewTransition = (cb) => {
        const t = original(cb);
        t.ready.then(() => {
          const el = document.documentElement;
          const style = (sel) => getComputedStyle(el, sel);
          const name = 'proyecto-' + slug;
          probes.push({
            pseudo: document.getAnimations()
              .map((a) => a.effect && a.effect.pseudoElement)
              .filter(Boolean),
            rootOldBlend: style('::view-transition-old(root)').mixBlendMode,
            rootNewBlend: style('::view-transition-new(root)').mixBlendMode,
            rootName: style('::view-transition-old(root)').animationName,
            sharedOld: style('::view-transition-old(' + name + ')').opacity,
            sharedBlend: style('::view-transition-old(' + name + ')').mixBlendMode,
            groupDuration: style('::view-transition-group(' + name + ')').animationDuration,
            groupEasing: style('::view-transition-group(' + name + ')').animationTimingFunction,
          });
        });
        return t;
      };
      link.click();
      await wait(2200);
      history.back();
      await wait(2500);
      return { slug, probes };
    })()`);
		console.log("transición:", JSON.stringify(vt));
		const grupo = `::view-transition-group(proyecto-${vt.slug})`;
		const ida = vt.probes[0] ?? {};
		const vuelta = vt.probes[1] ?? {};
		assert(
			"la foto de la ficha es el elemento compartido",
			(ida.pseudo ?? []).includes(grupo),
			(ida.pseudo ?? []).filter((p) => p.includes(vt.slug)).join(" "),
		);
		assert(
			"el degradado de la ficha viaja con la foto",
			(ida.pseudo ?? []).some((p) => p.includes(`proyecto-${vt.slug}-capa`)),
			(ida.pseudo ?? []).filter((p) => p.includes("capa")).join(" "),
		);
		assert(
			"la página vieja y la nueva no se mezclan con plus-lighter",
			ida.rootOldBlend === "normal" && ida.rootNewBlend === "normal",
			`old=${ida.rootOldBlend} new=${ida.rootNewBlend}`,
		);
		assert(
			"la raíz usa el fundido plano del sitio",
			ida.rootName === "fexsi-fade-out",
			ida.rootName,
		);
		assert(
			"la foto no se dibuja dos veces (sin imagen fantasma)",
			ida.sharedOld === "0" && ida.sharedBlend === "normal",
			`opacidad=${ida.sharedOld} blend=${ida.sharedBlend}`,
		);
		assert(
			"la foto se interpola con la curva del morph",
			ida.groupDuration === "0.48s" && (ida.groupEasing ?? "").includes("0.32, 0.72, 0, 1"),
			`${ida.groupDuration} ${ida.groupEasing}`,
		);
		assert(
			"la vuelta al inicio también interpola la foto",
			(vuelta.pseudo ?? []).includes(grupo),
			(vuelta.pseudo ?? []).filter((p) => p.includes(vt.slug)).join(" "),
		);
		ws.close();
	}

	console.log(`\n${failures === 0 ? "TODO EN VERDE" : `${failures} FALLO(S)`}\n`);
} catch (err) {
	console.error("ERROR:", err.message);
	process.exitCode = 1;
} finally {
	browser.kill();
	await sleep(400);
	try {
		rmSync(userDataDir, { recursive: true, force: true });
	} catch {
		/* perfil temporal */
	}
}

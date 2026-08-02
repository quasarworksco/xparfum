/* ═══════════════════════════════════════════════════════════════
   XParfum · Tienda pública
   Búsqueda · filtros · mayor/detal · destacados · carrito · pedidos
   ═══════════════════════════════════════════════════════════════ */

import { firebaseConfig, WHATSAPP_NUMERO } from "./firebase-config.js?v=10";
import { CATALOGO_LOCAL, DETAL_MARKUP } from "./data.js?v=10";

/* ── Firebase (carga perezosa; la tienda funciona sin él) ── */
let db = null;
async function initFirebase() {
  try {
    const { initializeApp } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"
    );
    const fs = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );
    const app = initializeApp(firebaseConfig);
    // Auto long-polling: evita cuelgues en redes con proxys intermedios
    db = fs.initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      useFetchStreams: false,
    });
  } catch (e) {
    console.warn("Firebase no disponible, se usa el catálogo local.", e);
  }
}

/* ── Estado ── */
const PER_PAGE = 24;
const state = {
  productos: [],
  modo: "mayor",           // "mayor" | "detal"
  busqueda: "",
  casa: "",
  orden: "casa",
  pagina: 1,
  tasas: { propia: null, bcv: null },
  carrito: JSON.parse(localStorage.getItem("xparfum_carrito") || "[]"),
};

/* ── Helpers ── */
const $ = (id) => document.getElementById(id);
const norm = (s) =>
  (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const money = (n) => `$${(+n || 0) % 1 === 0 ? (+n || 0) : (+n || 0).toFixed(2)}`;
const bs = (n) =>
  new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 }).format(+n || 0);

function precioDetalDe(p) {
  return p.precioDetal != null && p.precioDetal !== "" ? +p.precioDetal : +p.precioMayor + DETAL_MARKUP;
}
function precioActivo(p) {
  const base = state.modo === "mayor" ? +p.precioMayor : precioDetalDe(p);
  const oferta = p.precioOferta != null && p.precioOferta !== "" ? +p.precioOferta : null;
  return oferta != null && oferta > 0 && oferta < base ? { precio: oferta, antes: base } : { precio: base, antes: null };
}

/* ── Carga del catálogo ── */
async function cargarCatalogo() {
  if (db) {
    try {
      const { collection, getDocs } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
      );
      const snap = await Promise.race([
        getDocs(collection(db, "perfumes")),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
      ]);
      if (!snap.empty) {
        state.productos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return;
      }
    } catch (e) {
      console.warn("No se pudo leer Firestore; catálogo local.", e);
    }
  }
  state.productos = [...CATALOGO_LOCAL];
}

async function cargarTasas() {
  if (!db) return;
  try {
    const { doc, getDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );
    const snap = await getDoc(doc(db, "config", "moneda"));
    if (snap.exists()) {
      const d = snap.data();
      state.tasas.propia = +d.tasaPropia || null;
      state.tasas.bcv = +d.tasaBcv || null;
    }
  } catch (e) {
    /* silencioso: la tienda funciona sin tasas */
  }
}

/* ── Filtro + orden ── */
function productosFiltrados() {
  const q = norm(state.busqueda);
  let list = state.productos.filter((p) => {
    if (state.casa && p.casa !== state.casa) return false;
    if (q && !norm(`${p.casa} ${p.nombre}`).includes(q)) return false;
    return true;
  });
  const val = (p) => precioActivo(p).precio;
  switch (state.orden) {
    case "nombre":      list.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es")); break;
    case "precio-asc":  list.sort((a, b) => val(a) - val(b)); break;
    case "precio-desc": list.sort((a, b) => val(b) - val(a)); break;
    default:            list.sort((a, b) => (a.casa || "").localeCompare(b.casa || "", "es") || (a.nombre || "").localeCompare(b.nombre || "", "es"));
  }
  return list;
}

/* ── Render: tarjeta ── */
function cardHTML(p) {
  const { precio, antes } = precioActivo(p);
  const sinStock = p.stock != null && +p.stock <= 0;
  const inicial = (p.nombre || "?").trim().charAt(0).toUpperCase();
  const bsLinea =
    state.tasas.propia
      ? `<span class="precio-bs">Bs <strong>${bs(precio * state.tasas.propia)}</strong>${
          state.tasas.bcv
            ? ` · ref. BCV ${money((precio * state.tasas.propia) / state.tasas.bcv)}`
            : ""
        }</span>`
      : "";
  return `
  <article class="card" data-id="${p.id}">
    <div class="card-img"${p.imagen ? ` style="background-image:url('${p.imagen}')"` : ""}>
      ${p.imagen
        ? `<img src="${p.imagen}" alt="${p.casa} ${p.nombre}" loading="lazy"
             onerror="this.closest('.card-img').classList.add('img-error'); this.remove();" />`
        : `<span class="placeholder">${inicial}</span>`}
      ${antes ? `<span class="card-badge">Oferta</span>` : ""}
    </div>
    <div class="card-body">
      <span class="card-casa">${p.casa}</span>
      <h3 class="card-nombre">${p.nombre}</h3>
      <div class="card-precios">
        <div class="precio-principal">
          <span class="precio-activo">${money(precio)}</span>
          ${antes ? `<span class="precio-tachado">${money(antes)}</span>` : ""}
        </div>
        ${bsLinea}
        <div class="precio-duo">
          <div class="duo-cell ${state.modo === "mayor" ? "is-active" : ""}">
            <span class="duo-label">Al mayor</span>
            <span class="duo-valor">${money(p.precioMayor)}</span>
          </div>
          <div class="duo-cell ${state.modo === "detal" ? "is-active" : ""}">
            <span class="duo-label">Al detal</span>
            <span class="duo-valor">${money(precioDetalDe(p))}</span>
          </div>
        </div>
      </div>
      ${
        sinStock
          ? `<span class="card-agotado">Agotado</span>`
          : `<button type="button" class="card-add" data-add="${p.id}">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
               Agregar al pedido
             </button>`
      }
    </div>
  </article>`;
}

/* ── Render: grid + paginación ── */
function render() {
  const list = productosFiltrados();
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  state.pagina = Math.min(state.pagina, pages);
  const slice = list.slice((state.pagina - 1) * PER_PAGE, state.pagina * PER_PAGE);

  $("product-grid").innerHTML = slice.map(cardHTML).join("");
  $("results-count").textContent = total
    ? `${total} perfume${total !== 1 ? "s" : ""}`
    : "";
  $("empty-state").hidden = total > 0;
  $("product-grid").hidden = total === 0;

  // Paginación
  const nav = $("pagination");
  if (pages <= 1) { nav.hidden = true; nav.innerHTML = ""; }
  else {
    nav.hidden = false;
    let btns = `<button class="page-btn" data-page="${state.pagina - 1}" ${state.pagina === 1 ? "disabled" : ""}>‹</button>`;
    const around = new Set([1, pages, state.pagina - 1, state.pagina, state.pagina + 1]);
    let last = 0;
    for (let i = 1; i <= pages; i++) {
      if (!around.has(i)) continue;
      if (i - last > 1) btns += `<span class="page-dots">…</span>`;
      btns += `<button class="page-btn ${i === state.pagina ? "is-active" : ""}" data-page="${i}">${i}</button>`;
      last = i;
    }
    btns += `<button class="page-btn" data-page="${state.pagina + 1}" ${state.pagina === pages ? "disabled" : ""}>›</button>`;
    nav.innerHTML = btns;
  }
  renderDestacados();
}

function renderDestacados() {
  const feats = state.productos.filter((p) => p.destacado);
  $("featured-section").hidden = feats.length === 0;
  $("featured-track").innerHTML = feats.map(cardHTML).join("");
}

/* ── Filtros: selector de casas + chips ── */
function montarFiltros() {
  const casas = [...new Set(state.productos.map((p) => p.casa))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
  $("brand-select").innerHTML =
    `<option value="">Todas las casas</option>` +
    casas.map((c) => `<option value="${c}">${c}</option>`).join("");

  // Chips: las casas con más productos
  const conteo = {};
  state.productos.forEach((p) => (conteo[p.casa] = (conteo[p.casa] || 0) + 1));
  const top = casas
    .sort((a, b) => conteo[b] - conteo[a])
    .slice(0, 8)
    .sort((a, b) => a.localeCompare(b, "es"));
  $("brand-chips").innerHTML = top
    .map((c) => `<button type="button" class="chip" data-casa="${c}">${c}</button>`)
    .join("");
}

function syncChips() {
  document.querySelectorAll(".chip").forEach((ch) =>
    ch.classList.toggle("is-active", ch.dataset.casa === state.casa)
  );
}

/* ── Carrito ── */
function guardarCarrito() {
  localStorage.setItem("xparfum_carrito", JSON.stringify(state.carrito));
}
function totalCarrito() {
  return state.carrito.reduce((s, it) => s + it.precio * it.cantidad, 0);
}
function agregarAlCarrito(id) {
  const p = state.productos.find((x) => String(x.id) === String(id));
  if (!p) return;
  const { precio } = precioActivo(p);
  const existente = state.carrito.find((it) => String(it.id) === String(id));
  if (existente) existente.cantidad += 1;
  else state.carrito.push({ id: p.id, casa: p.casa, nombre: p.nombre, precio, cantidad: 1, modo: state.modo });
  guardarCarrito();
  renderCarrito();
  // Pulso del botón flotante como feedback
  const fab = $("cart-fab");
  fab.classList.remove("pulso");
  void fab.offsetWidth; // reinicia la animación
  fab.classList.add("pulso");
}

function renderCarrito() {
  const n = state.carrito.reduce((s, it) => s + it.cantidad, 0);
  $("cart-count").hidden = n === 0;
  $("cart-count").textContent = n;
  $("cart-empty").hidden = n > 0;
  $("cart-foot").hidden = n === 0;
  $("cart-items").innerHTML = state.carrito
    .map(
      (it, i) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-casa">${it.casa}</div>
        <div class="cart-item-nombre">${it.nombre}</div>
        <div class="cart-item-precio">${money(it.precio)} c/u</div>
      </div>
      <div class="cart-qty">
        <button type="button" data-qty="-1" data-i="${i}" aria-label="Menos">−</button>
        <span>${it.cantidad}</span>
        <button type="button" data-qty="1" data-i="${i}" aria-label="Más">+</button>
      </div>
      <span class="cart-item-total">${money(it.precio * it.cantidad)}</span>
      <button type="button" class="cart-item-remove" data-remove="${i}" aria-label="Quitar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`
    )
    .join("");
  $("cart-total").textContent = money(totalCarrito());
}

function abrirCarrito() {
  $("cart-overlay").hidden = false;
  $("cart-drawer").hidden = false;
}
function cerrarCarrito() {
  $("cart-overlay").hidden = true;
  $("cart-drawer").hidden = true;
}

function textoPedido(nombre, telefono) {
  const lineas = state.carrito.map(
    (it) => `• ${it.cantidad} × ${it.casa} — ${it.nombre} (${money(it.precio)} c/u) = ${money(it.precio * it.cantidad)}`
  );
  return [
    `*Pedido XParfum*`,
    ``,
    `Cliente: ${nombre}`,
    `Teléfono: ${telefono}`,
    ``,
    ...lineas,
    ``,
    `*Total: ${money(totalCarrito())}*`,
  ].join("\n");
}

function validarDatos() {
  const nombre = $("cart-nombre").value.trim();
  const telefono = $("cart-telefono").value.trim();
  const ok = nombre.length >= 2 && telefono.length >= 6;
  $("cart-datos-error").hidden = ok;
  return ok ? { nombre, telefono } : null;
}

async function registrarPedido(nombre, telefono) {
  if (!db) return;
  try {
    const { collection, addDoc, serverTimestamp } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );
    await addDoc(collection(db, "pedidos"), {
      nombre,
      telefono,
      items: state.carrito.map(({ id, casa, nombre: n, precio, cantidad, modo }) => ({
        id, casa, nombre: n, precio, cantidad, modo,
      })),
      total: totalCarrito(),
      estado: "pendiente",
      creado: serverTimestamp(),
    });
  } catch (e) {
    console.warn("No se pudo registrar el pedido en Firestore.", e);
  }
}

/* ── Eventos ── */
function montarEventos() {
  // Modo de precio
  document.querySelectorAll(".price-toggle-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.modo = btn.dataset.mode;
      document.querySelectorAll(".price-toggle-btn").forEach((b) => {
        const activo = b === btn;
        b.classList.toggle("is-active", activo);
        b.setAttribute("aria-checked", activo);
      });
      render();
    })
  );

  // Búsqueda
  $("search-input").addEventListener("input", (e) => {
    state.busqueda = e.target.value;
    state.pagina = 1;
    $("search-clear").hidden = !e.target.value;
    render();
  });
  $("search-clear").addEventListener("click", () => {
    $("search-input").value = "";
    state.busqueda = "";
    $("search-clear").hidden = true;
    render();
  });

  // Filtros
  $("brand-select").addEventListener("change", (e) => {
    state.casa = e.target.value;
    state.pagina = 1;
    syncChips();
    render();
  });
  $("sort-select").addEventListener("change", (e) => {
    state.orden = e.target.value;
    render();
  });
  $("brand-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.casa = state.casa === chip.dataset.casa ? "" : chip.dataset.casa;
    $("brand-select").value = state.casa;
    state.pagina = 1;
    syncChips();
    render();
  });
  $("reset-filters").addEventListener("click", () => {
    state.busqueda = ""; state.casa = ""; state.pagina = 1;
    $("search-input").value = ""; $("brand-select").value = "";
    $("search-clear").hidden = true;
    syncChips(); render();
  });

  // Paginación + agregar al carrito (delegado)
  document.addEventListener("click", (e) => {
    const pageBtn = e.target.closest("[data-page]");
    if (pageBtn && !pageBtn.disabled) {
      state.pagina = +pageBtn.dataset.page;
      render();
      $("top").scrollIntoView({ behavior: "smooth" });
      return;
    }
    const addBtn = e.target.closest("[data-add]");
    if (addBtn) agregarAlCarrito(addBtn.dataset.add);
  });

  // Carrito
  $("cart-fab").addEventListener("click", abrirCarrito);
  $("cart-close").addEventListener("click", cerrarCarrito);
  $("cart-overlay").addEventListener("click", cerrarCarrito);
  $("cart-items").addEventListener("click", (e) => {
    const qty = e.target.closest("[data-qty]");
    if (qty) {
      const it = state.carrito[+qty.dataset.i];
      it.cantidad += +qty.dataset.qty;
      if (it.cantidad <= 0) state.carrito.splice(+qty.dataset.i, 1);
      guardarCarrito(); renderCarrito();
      return;
    }
    const rm = e.target.closest("[data-remove]");
    if (rm) {
      state.carrito.splice(+rm.dataset.remove, 1);
      guardarCarrito(); renderCarrito();
    }
  });
  $("cart-clear").addEventListener("click", () => {
    state.carrito = [];
    guardarCarrito(); renderCarrito();
  });

  $("cart-whatsapp").addEventListener("click", async () => {
    const datos = validarDatos();
    if (!datos || !state.carrito.length) return;
    await registrarPedido(datos.nombre, datos.telefono);
    const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(
      textoPedido(datos.nombre, datos.telefono)
    )}`;
    window.open(url, "_blank");
  });

  $("cart-copy").addEventListener("click", async () => {
    const datos = validarDatos();
    if (!datos || !state.carrito.length) return;
    try {
      await navigator.clipboard.writeText(textoPedido(datos.nombre, datos.telefono));
      $("cart-copy").textContent = "¡Lista copiada!";
      setTimeout(() => location.reload(), 900);
    } catch {
      alert(textoPedido(datos.nombre, datos.telefono));
    }
  });
}

/* ── Init ── */
(async function init() {
  $("year").textContent = new Date().getFullYear();
  montarEventos();
  await initFirebase();
  await Promise.all([cargarCatalogo(), cargarTasas()]);
  montarFiltros();
  renderCarrito();
  render();
})();

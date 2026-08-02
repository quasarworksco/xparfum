/* ═══════════════════════════════════════════════════════════════
   XParfum · Panel de administración
   Login interno · productos · pedidos · ventas · deudores ·
   proveedores · moneda
   ═══════════════════════════════════════════════════════════════ */

import { firebaseConfig, CLOUDINARY_CONFIG } from "./firebase-config.js?v=11";
import { CATALOGO_LOCAL, DETAL_MARKUP } from "./data.js?v=11";

/* ── Credenciales de acceso (uso interno, fijas en el código) ── */
const ADMIN_USER = "admin";
const ADMIN_PASS = "xparfum123.";

/* ── Firebase (solo Firestore; carga tolerante a fallos) ── */
let db = null, firebaseOK = false;
let collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc,
  deleteDoc, serverTimestamp, query, orderBy, limit;
try {
  const { initializeApp } = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const fs = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  ({ collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc,
     deleteDoc, serverTimestamp, query, orderBy, limit } = fs);
  const app = initializeApp(firebaseConfig);
  // Auto long-polling: evita que la conexión se cuelgue en redes con
  // proxys o ISP que bloquean los streams del canal en tiempo real.
  db = fs.initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    useFetchStreams: false,
  });
  firebaseOK = true;
} catch (e) {
  console.warn("Firebase no disponible; el panel funciona sin guardar.", e);
}

/* ── Estado ── */
const state = {
  productos: [],   // perfumes + costo fusionado
  costos: {},      // id → {costo, proveedorId}
  pedidos: [],
  ventas: [],
  proveedores: [],
  movimientos: [],
  moneda: { tasaPropia: null, tasaBcv: null, bcvActualizado: null },
};

/* ── Helpers ── */
const $ = (id) => document.getElementById(id);
const money = (n) => `$${(+n || 0) % 1 === 0 ? (+n || 0) : (+n || 0).toFixed(2)}`;
const bsFmt = (n) => new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 }).format(+n || 0);
const fechaCorta = (ts) => {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  return d ? d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }) : "—";
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg, tipo = "") {
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

/* ═══════ LOGIN (interno) ═══════ */
function mostrarPanel() {
  $("login-screen").style.display = "none";
  $("admin-app").hidden = false;
  $("user-email").textContent = ADMIN_USER;
  cargarTodo();
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const u = $("login-email").value.trim().toLowerCase();
  const p = $("login-password").value;
  const err = $("login-error");
  err.hidden = true;

  if (u !== ADMIN_USER || p !== ADMIN_PASS) {
    err.textContent = "Usuario o contraseña incorrectos.";
    err.hidden = false;
    return;
  }
  sessionStorage.setItem("xparfum_admin", "1");
  if (!firebaseOK) {
    toast("Sin conexión con Firebase: el panel abre pero no podrá guardar datos.", "error");
  }
  mostrarPanel();
});

$("logout-btn").addEventListener("click", () => {
  sessionStorage.removeItem("xparfum_admin");
  location.reload();
});

if (sessionStorage.getItem("xparfum_admin") === "1") {
  mostrarPanel();
}

/* ═══════ NAVEGACIÓN ═══════ */
document.querySelectorAll(".nav-item[data-sec]").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item[data-sec]").forEach((b) =>
      b.classList.toggle("is-active", b === btn));
    document.querySelectorAll(".section").forEach((s) =>
      (s.hidden = s.id !== `sec-${btn.dataset.sec}`));
  })
);

/* ═══════ CARGA DE DATOS ═══════ */
function estadoCarga(msg, tipo = "") {
  let el = document.getElementById("estado-carga");
  if (!msg) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("div");
    el.id = "estado-carga";
    document.querySelector(".main").prepend(el);
  }
  el.className = `estado-carga ${tipo}`;
  el.innerHTML = tipo === "error"
    ? `${esc(msg)} <button type="button" class="btn btn-ghost" id="btn-reintentar">Reintentar</button>`
    : `<span class="spinner"></span> ${esc(msg)}`;
  document.getElementById("btn-reintentar")?.addEventListener("click", () => cargarTodo());
}

async function cargarTodo() {
  if (!firebaseOK) {
    estadoCarga("Sin conexión con Firebase: los datos no se pueden cargar.", "error");
    renderTodo();
    return;
  }
  estadoCarga("Cargando datos de Firestore…");
  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error("timeout")), 20000));
  try {
    await Promise.race([
      Promise.all([
        cargarProductos(), cargarPedidos(), cargarVentas(),
        cargarProveedores(), cargarMovimientos(), cargarMoneda(),
      ]),
      timeout,
    ]);
    estadoCarga(null);
  } catch (e) {
    estadoCarga(
      e.message === "timeout"
        ? "Firestore no responde (20 s). Puede ser tu red o un bloqueo del proveedor de internet."
        : "Error al cargar: " + (e.message || e), "error");
  }
  renderTodo();
  refrescarBCV(false);
}

async function cargarProductos() {
  try {
    const [perfSnap, costSnap] = await Promise.all([
      getDocs(collection(db, "perfumes")),
      getDocs(collection(db, "costos")).catch(() => ({ docs: [] })),
    ]);
    state.costos = {};
    costSnap.docs.forEach((d) => (state.costos[d.id] = d.data()));
    state.productos = perfSnap.docs.map((d) => ({
      id: d.id, ...d.data(), ...(state.costos[d.id] || {}),
    }));
  } catch (e) {
    console.warn(e);
    state.productos = [];
    toast("No se pudieron leer los productos de Firestore: " + (e.message || e) +
      ". Revisa que las reglas estén publicadas.", "error");
  }
}
const cargarPedidos = () =>
  getDocs(query(collection(db, "pedidos"), orderBy("creado", "desc")))
    .then((s) => (state.pedidos = s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    .catch(() => (state.pedidos = []));
const cargarVentas = () =>
  getDocs(query(collection(db, "ventas"), orderBy("fecha", "desc")))
    .then((s) => (state.ventas = s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    .catch(() => (state.ventas = []));
const cargarProveedores = () =>
  getDocs(collection(db, "proveedores"))
    .then((s) => (state.proveedores = s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    .catch(() => (state.proveedores = []));
const cargarMovimientos = () =>
  getDocs(query(collection(db, "movimientos"), orderBy("fecha", "desc"), limit(25)))
    .then((s) => (state.movimientos = s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    .catch(() => (state.movimientos = []));
const cargarMoneda = () =>
  getDoc(doc(db, "config", "moneda"))
    .then((s) => { if (s.exists()) state.moneda = { ...state.moneda, ...s.data() }; })
    .catch(() => {});

function renderTodo() {
  renderDashboard(); renderProductos(); renderPedidos();
  renderVentas(); renderDeudores(); renderProveedores(); renderMoneda();
}

/* ═══════ DASHBOARD ═══════ */
function renderDashboard() {
  $("dash-fecha").textContent = new Date().toLocaleDateString("es-VE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const unidades = state.productos.reduce((s, p) => s + (+p.stock || 0), 0);
  const valorInv = state.productos.reduce((s, p) => s + (+p.costo || 0) * (+p.stock || 0), 0);

  const ahora = new Date();
  const esDelMes = (v) => {
    const d = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
    return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
  };
  const ventasMes = state.ventas.filter(esDelMes);
  const totalMes = ventasMes.reduce((s, v) => s + (+v.total || 0), 0);
  const costoMes = ventasMes.reduce(
    (s, v) => s + (v.items || []).reduce((c, it) => c + (+it.costo || 0) * (+it.cantidad || 0), 0), 0);
  const porCobrar = state.ventas.reduce((s, v) => s + Math.max(0, (+v.total || 0) - (+v.pagado || 0)), 0);

  $("dash-stats").innerHTML = `
    <div class="stat"><div class="stat-label">Productos</div>
      <div class="stat-value">${state.productos.length}</div>
      <div class="stat-sub">${unidades} unidades en stock</div></div>
    <div class="stat"><div class="stat-label">Inventario (a costo)</div>
      <div class="stat-value">${money(valorInv)}</div></div>
    <div class="stat"><div class="stat-label">Ventas del mes</div>
      <div class="stat-value ok">${money(totalMes)}</div>
      <div class="stat-sub">${ventasMes.length} venta${ventasMes.length !== 1 ? "s" : ""}</div></div>
    <div class="stat"><div class="stat-label">Ganancia est. del mes</div>
      <div class="stat-value ok">${money(totalMes - costoMes)}</div></div>
    <div class="stat"><div class="stat-label">Por cobrar</div>
      <div class="stat-value ${porCobrar > 0 ? "warn" : ""}">${money(porCobrar)}</div></div>`;

  $("dash-ventas").innerHTML = state.ventas.slice(0, 6).map((v) => `
    <div class="linea-item">
      <div><div class="titulo">${esc(v.cliente || "Cliente")}</div>
        <div class="detalle">${fechaCorta(v.fecha)} · ${(v.items || []).length} producto(s)</div></div>
      <span class="monto">${money(v.total)}</span>
    </div>`).join("") || `<p class="empty-note">Sin ventas aún.</p>`;

  const bajos = state.productos.filter((p) => (+p.stock || 0) <= 3)
    .sort((a, b) => (+a.stock || 0) - (+b.stock || 0)).slice(0, 8);
  $("dash-stock").innerHTML = bajos.map((p) => `
    <div class="linea-item">
      <div><div class="titulo">${esc(p.nombre)}</div><div class="detalle">${esc(p.casa)}</div></div>
      <span class="stock-pill ${(+p.stock || 0) === 0 ? "cero" : "bajo"}">${p.stock ?? 0}</span>
    </div>`).join("") || `<p class="empty-note">Todo el stock está sano.</p>`;
}

/* ═══════ PRODUCTOS ═══════ */
function precioDetalDe(p) {
  return p.precioDetal != null && p.precioDetal !== "" ? +p.precioDetal : +p.precioMayor + DETAL_MARKUP;
}

function renderProductos() {
  const q = ($("prod-search").value || "").toLowerCase();
  const list = state.productos
    .filter((p) => !q || `${p.casa} ${p.nombre}`.toLowerCase().includes(q))
    .sort((a, b) => (a.casa || "").localeCompare(b.casa || "", "es") || (a.nombre || "").localeCompare(b.nombre || "", "es"));

  $("prod-empty").hidden = state.productos.length > 0;
  $("prod-table").querySelector("tbody").innerHTML = list.map((p) => {
    const st = +p.stock || 0;
    return `<tr>
      <td class="casa">${esc(p.casa)}</td>
      <td>${esc(p.nombre)}${p.destacado ? ' <svg class="icono-star" viewBox="0 0 24 24" fill="currentColor" aria-label="Destacado"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' : ""}</td>
      <td class="num">${p.costo != null ? money(p.costo) : "—"}</td>
      <td class="num">${money(p.precioMayor)}</td>
      <td class="num">${money(precioDetalDe(p))}</td>
      <td class="num">${p.precioOferta ? money(p.precioOferta) : "—"}</td>
      <td class="num"><span class="stock-pill ${st === 0 ? "cero" : st <= 3 ? "bajo" : ""}">${st}</span></td>
      <td class="acciones">
        <button class="accion-btn" data-mov="${p.id}" title="Entrada/salida de stock">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg></button>
        <button class="accion-btn" data-edit="${p.id}" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>
        <button class="accion-btn rojo" data-del="${p.id}" title="Eliminar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </td></tr>`;
  }).join("");

  $("prod-movimientos").innerHTML = state.movimientos.slice(0, 10).map((m) => `
    <div class="linea-item">
      <div><div class="titulo">${esc(m.producto)}</div>
        <div class="detalle">${fechaCorta(m.fecha)} · ${esc(m.motivo || "")}</div></div>
      <span class="monto ${m.cantidad > 0 ? "verde" : "rojo"}">${m.cantidad > 0 ? "+" : ""}${m.cantidad}</span>
    </div>`).join("") || `<p class="empty-note">Sin movimientos registrados.</p>`;
}

$("prod-search").addEventListener("input", renderProductos);
$("prod-nuevo").addEventListener("click", () => modalProducto());
$("prod-seed").addEventListener("click", importarCatalogo);

async function importarCatalogo() {
  if (!firebaseOK) { toast("Sin conexión con Firebase: no se puede importar.", "error"); return; }
  // Nunca duplica: solo importa los productos que aún no existen (por casa+nombre)
  await cargarProductos();
  const existentes = new Set(state.productos.map((p) => `${p.casa}|${p.nombre}`.toLowerCase()));
  const nuevos = CATALOGO_LOCAL.filter((p) => !existentes.has(`${p.casa}|${p.nombre}`.toLowerCase()));
  if (nuevos.length === 0) {
    toast(`El catálogo ya está completo en Firestore (${state.productos.length} productos). Nada que importar.`, "ok");
    renderTodo();
    return;
  }
  if (!confirm(`¿Importar ${nuevos.length} productos del catálogo local a Firestore?`)) return;
  try {
    // Lotes de 20 en paralelo para que no tarde minutos
    for (let i = 0; i < nuevos.length; i += 20) {
      await Promise.all(nuevos.slice(i, i + 20).map((p) => {
        const { id, ...data } = p;
        return addDoc(collection(db, "perfumes"), data);
      }));
    }
    toast(`${nuevos.length} productos importados.`, "ok");
    await cargarProductos(); renderTodo();
  } catch (e) { toast("Error al importar: " + e.message, "error"); }
}

function modalProducto(p = null) {
  const provOpts = state.proveedores.map((pr) =>
    `<option value="${pr.id}" ${p?.proveedorId === pr.id ? "selected" : ""}>${esc(pr.nombre)}</option>`).join("");
  abrirModal(`
    <h3>${p ? "Editar producto" : "Nuevo producto"}</h3>
    <form id="form-prod">
      <div class="modal-grid">
        <label class="field"><span>Casa / marca</span>
          <input name="casa" required value="${esc(p?.casa || "")}" /></label>
        <label class="field"><span>Nombre</span>
          <input name="nombre" required value="${esc(p?.nombre || "")}" /></label>
        <label class="field"><span>Mi costo ($) <span class="hint">privado</span></span>
          <input name="costo" type="number" step="0.01" min="0" value="${p?.costo ?? ""}" /></label>
        <label class="field"><span>Precio al mayor ($)</span>
          <input name="precioMayor" type="number" step="0.01" min="0" required value="${p?.precioMayor ?? ""}" /></label>
        <label class="field"><span>Precio al detal ($) <span class="hint">vacío = mayor + ${DETAL_MARKUP}</span></span>
          <input name="precioDetal" type="number" step="0.01" min="0" value="${p?.precioDetal ?? ""}" /></label>
        <label class="field"><span>Precio de oferta ($) <span class="hint">opcional</span></span>
          <input name="precioOferta" type="number" step="0.01" min="0" value="${p?.precioOferta ?? ""}" /></label>
        <label class="field"><span>Stock</span>
          <input name="stock" type="number" min="0" value="${p?.stock ?? 0}" /></label>
        <label class="field"><span>Proveedor</span>
          <select name="proveedorId"><option value="">— Ninguno —</option>${provOpts}</select></label>
        <label class="field span-2"><span>Imagen (URL)</span>
          <input name="imagen" type="url" placeholder="https://…" value="${esc(p?.imagen || "")}" /></label>
        <label class="field span-2" style="display:flex;align-items:center;gap:.5rem">
          <input type="checkbox" name="destacado" style="width:auto" ${p?.destacado ? "checked" : ""} />
          <span style="margin:0">Mostrar en Destacados</span></label>
      </div>
      ${CLOUDINARY_CONFIG.cloudName ? `
      <div class="head-actions" style="margin-bottom:.6rem">
        <button type="button" class="btn btn-ghost" id="btn-foto">Subir foto</button>
        <span class="hint" id="foto-estado"></span>
      </div>` : ""}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">${p ? "Guardar cambios" : "Crear producto"}</button>
      </div>
    </form>`);

  if (CLOUDINARY_CONFIG.cloudName) {
    $("btn-foto")?.addEventListener("click", () => subirFoto());
  }

  document.getElementById("form-prod").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const publico = {
      casa: f.get("casa").trim(),
      nombre: f.get("nombre").trim(),
      precioMayor: +f.get("precioMayor"),
      precioDetal: f.get("precioDetal") ? +f.get("precioDetal") : null,
      precioOferta: f.get("precioOferta") ? +f.get("precioOferta") : null,
      stock: +f.get("stock") || 0,
      imagen: f.get("imagen").trim(),
      destacado: !!f.get("destacado"),
    };
    const privado = {
      costo: f.get("costo") ? +f.get("costo") : null,
      proveedorId: f.get("proveedorId") || null,
    };
    try {
      let id = p?.id;
      if (id) await updateDoc(doc(db, "perfumes", id), publico);
      else id = (await addDoc(collection(db, "perfumes"), publico)).id;
      await setDoc(doc(db, "costos", id), privado, { merge: true });
      toast(p ? "Producto actualizado." : "Producto creado.", "ok");
      cerrarModal();
      await cargarProductos(); renderTodo();
    } catch (err) { toast("Error al guardar: " + err.message, "error"); }
  });
}

function subirFoto() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    $("foto-estado").textContent = "Subiendo…";
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
      fd.append("folder", CLOUDINARY_CONFIG.folder || "perfumes");
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
        { method: "POST", body: fd });
      const data = await res.json();
      if (!data.secure_url) throw new Error(data.error?.message || "sin URL");
      const url = data.secure_url.replace("/upload/", "/upload/f_auto,q_auto,w_800/");
      document.querySelector('#form-prod [name="imagen"]').value = url;
      $("foto-estado").textContent = "Foto lista";
    } catch (e) {
      $("foto-estado").textContent = "Error al subir: " + e.message;
    }
  };
  input.click();
}

function modalMovimiento(p) {
  abrirModal(`
    <h3>Inventario · ${esc(p.nombre)}</h3>
    <p class="hint" style="margin-bottom:1rem">Stock actual: <strong>${p.stock ?? 0}</strong></p>
    <form id="form-mov">
      <div class="modal-grid">
        <label class="field"><span>Tipo</span>
          <select name="tipo"><option value="entrada">Entrada (+)</option><option value="salida">Salida (−)</option></select></label>
        <label class="field"><span>Cantidad</span>
          <input name="cantidad" type="number" min="1" required value="1" /></label>
        <label class="field span-2"><span>Motivo</span>
          <input name="motivo" placeholder="Compra, ajuste, daño…" /></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Registrar</button>
      </div>
    </form>`);
  document.getElementById("form-mov").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const dir = f.get("tipo") === "salida" ? -1 : 1;
    const cant = dir * Math.abs(+f.get("cantidad"));
    const nuevo = Math.max(0, (+p.stock || 0) + cant);
    try {
      await updateDoc(doc(db, "perfumes", p.id), { stock: nuevo });
      await addDoc(collection(db, "movimientos"), {
        productoId: p.id, producto: `${p.casa} — ${p.nombre}`,
        cantidad: cant, motivo: f.get("motivo").trim() || f.get("tipo"),
        fecha: serverTimestamp(),
      });
      toast("Movimiento registrado.", "ok");
      cerrarModal();
      await Promise.all([cargarProductos(), cargarMovimientos()]);
      renderTodo();
    } catch (err) { toast("Error: " + err.message, "error"); }
  });
}

$("prod-table").addEventListener("click", async (e) => {
  const edit = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-del]");
  const mov = e.target.closest("[data-mov]");
  if (edit) modalProducto(state.productos.find((p) => p.id === edit.dataset.edit));
  if (mov) modalMovimiento(state.productos.find((p) => p.id === mov.dataset.mov));
  if (del) {
    const p = state.productos.find((x) => x.id === del.dataset.del);
    if (!confirm(`¿Eliminar "${p.nombre}"?`)) return;
    try {
      await deleteDoc(doc(db, "perfumes", p.id));
      await deleteDoc(doc(db, "costos", p.id)).catch(() => {});
      toast("Producto eliminado.", "ok");
      await cargarProductos(); renderTodo();
    } catch (err) { toast("Error: " + err.message, "error"); }
  }
});

/* ═══════ PEDIDOS ═══════ */
function renderPedidos() {
  const pendientes = state.pedidos.filter((p) => p.estado === "pendiente");
  $("nav-pedidos").hidden = pendientes.length === 0;
  $("nav-pedidos").textContent = pendientes.length;
  $("pedidos-empty").hidden = state.pedidos.length > 0;

  $("pedidos-lista").innerHTML = state.pedidos.map((pd) => `
    <div class="pedido-card">
      <div class="pedido-head">
        <h4>${esc(pd.nombre || "Cliente")} · ${esc(pd.telefono || "")}</h4>
        <span class="badge-estado ${pd.estado}">${pd.estado}</span>
      </div>
      <p class="pedido-fecha">${fechaCorta(pd.creado)}</p>
      <div class="pedido-items">
        ${(pd.items || []).map((it) =>
          `<strong>${it.cantidad}×</strong> ${esc(it.casa)} — ${esc(it.nombre)} (${money(it.precio)})`).join("<br/>")}
      </div>
      <p class="pedido-total">Total: ${money(pd.total)}</p>
      ${pd.estado === "pendiente" ? `
      <div class="pedido-actions">
        <button class="btn btn-primary" data-confirmar="${pd.id}">Confirmar (descuenta stock)</button>
        <button class="btn btn-danger" data-rechazar="${pd.id}">Rechazar</button>
      </div>` : ""}
    </div>`).join("");
}

$("pedidos-lista").addEventListener("click", async (e) => {
  const conf = e.target.closest("[data-confirmar]");
  const rech = e.target.closest("[data-rechazar]");
  if (conf) {
    const pd = state.pedidos.find((x) => x.id === conf.dataset.confirmar);
    try {
      for (const it of pd.items || []) {
        const prod = state.productos.find((p) => String(p.id) === String(it.id));
        if (prod) {
          await updateDoc(doc(db, "perfumes", prod.id), {
            stock: Math.max(0, (+prod.stock || 0) - (+it.cantidad || 0)),
          });
        }
      }
      await updateDoc(doc(db, "pedidos", pd.id), { estado: "confirmado" });
      toast("Pedido confirmado y stock actualizado.", "ok");
      await Promise.all([cargarProductos(), cargarPedidos()]);
      renderTodo();
    } catch (err) { toast("Error: " + err.message, "error"); }
  }
  if (rech) {
    try {
      await updateDoc(doc(db, "pedidos", rech.dataset.rechazar), { estado: "rechazado" });
      await cargarPedidos(); renderTodo();
    } catch (err) { toast("Error: " + err.message, "error"); }
  }
});

/* ═══════ VENTAS ═══════ */
function renderVentas() {
  const total = state.ventas.reduce((s, v) => s + (+v.total || 0), 0);
  const pagado = state.ventas.reduce((s, v) => s + (+v.pagado || 0), 0);
  $("ventas-stats").innerHTML = `
    <div class="stat"><div class="stat-label">Ventas</div>
      <div class="stat-value">${state.ventas.length}</div></div>
    <div class="stat"><div class="stat-label">Total vendido</div>
      <div class="stat-value ok">${money(total)}</div></div>
    <div class="stat"><div class="stat-label">Cobrado</div>
      <div class="stat-value">${money(pagado)}</div></div>
    <div class="stat"><div class="stat-label">Pendiente</div>
      <div class="stat-value ${total - pagado > 0 ? "warn" : ""}">${money(total - pagado)}</div></div>`;

  $("ventas-empty").hidden = state.ventas.length > 0;
  $("ventas-table").querySelector("tbody").innerHTML = state.ventas.map((v) => {
    const saldo = Math.max(0, (+v.total || 0) - (+v.pagado || 0));
    return `<tr>
      <td>${fechaCorta(v.fecha)}</td>
      <td>${esc(v.cliente || "—")}</td>
      <td>${(v.items || []).map((it) => `${it.cantidad}× ${esc(it.nombre)}`).join(", ")}</td>
      <td class="num">${money(v.total)}</td>
      <td class="num">${money(v.pagado)}</td>
      <td class="num">${saldo ? money(saldo) : "—"}</td>
      <td><span class="badge-estado ${saldo ? "credito" : "pagada"}">${saldo ? "crédito" : "pagada"}</span></td>
      <td class="acciones">
        <button class="accion-btn rojo" data-delventa="${v.id}" title="Eliminar (restaura stock)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </td></tr>`;
  }).join("");
}

$("venta-nueva").addEventListener("click", modalVenta);

function modalVenta() {
  const opciones = state.productos
    .slice().sort((a, b) => (a.casa || "").localeCompare(b.casa || "", "es") || (a.nombre || "").localeCompare(b.nombre || "", "es"))
    .map((p) => `<option value="${p.id}">${esc(p.casa)} — ${esc(p.nombre)} (stock ${p.stock ?? 0})</option>`)
    .join("");

  abrirModal(`
    <h3>Registrar venta</h3>
    <form id="form-venta">
      <div class="modal-grid">
        <label class="field"><span>Cliente</span><input name="cliente" required /></label>
        <label class="field"><span>Teléfono</span><input name="telefono" /></label>
        <label class="field"><span>Tipo de precio</span>
          <select name="tipoPrecio" id="venta-tipo"><option value="mayor">Al mayor</option><option value="detal">Al detal</option></select></label>
        <label class="field"><span>Monto pagado ($)</span>
          <input name="pagado" type="number" step="0.01" min="0" value="0" /></label>
      </div>
      <div id="venta-lineas"></div>
      <button type="button" class="btn btn-ghost" id="venta-add-linea">+ Agregar producto</button>
      <div class="venta-resumen"><span>Total</span><strong id="venta-total">$0</strong></div>
      <label class="field" style="margin-top:.8rem"><span>Notas</span><input name="notas" /></label>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar venta</button>
      </div>
    </form>`);

  const lineas = $("venta-lineas");
  const nuevaLinea = () => {
    const div = document.createElement("div");
    div.className = "venta-linea";
    div.innerHTML = `
      <select class="input l-prod"><option value="">— Producto —</option>${opciones}</select>
      <input class="input l-cant" type="number" min="1" value="1" title="Cantidad" />
      <input class="input l-precio" type="number" step="0.01" min="0" title="Precio unit." />
      <button type="button" class="accion-btn rojo l-quitar" title="Quitar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    lineas.appendChild(div);
  };
  nuevaLinea();
  $("venta-add-linea").addEventListener("click", nuevaLinea);

  const precioSegunTipo = (p) =>
    $("venta-tipo").value === "mayor" ? +p.precioMayor : precioDetalDe(p);

  const recalcular = () => {
    let total = 0;
    lineas.querySelectorAll(".venta-linea").forEach((l) => {
      total += (+l.querySelector(".l-precio").value || 0) * (+l.querySelector(".l-cant").value || 0);
    });
    $("venta-total").textContent = money(total);
    return total;
  };

  lineas.addEventListener("change", (e) => {
    if (e.target.classList.contains("l-prod")) {
      const p = state.productos.find((x) => x.id === e.target.value);
      if (p) e.target.closest(".venta-linea").querySelector(".l-precio").value = precioSegunTipo(p);
    }
    recalcular();
  });
  lineas.addEventListener("input", recalcular);
  lineas.addEventListener("click", (e) => {
    if (e.target.closest(".l-quitar")) { e.target.closest(".venta-linea").remove(); recalcular(); }
  });
  $("venta-tipo").addEventListener("change", () => {
    lineas.querySelectorAll(".venta-linea").forEach((l) => {
      const p = state.productos.find((x) => x.id === l.querySelector(".l-prod").value);
      if (p) l.querySelector(".l-precio").value = precioSegunTipo(p);
    });
    recalcular();
  });

  document.getElementById("form-venta").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const items = [];
    lineas.querySelectorAll(".venta-linea").forEach((l) => {
      const p = state.productos.find((x) => x.id === l.querySelector(".l-prod").value);
      const cantidad = +l.querySelector(".l-cant").value || 0;
      const precio = +l.querySelector(".l-precio").value || 0;
      if (p && cantidad > 0)
        items.push({ id: p.id, casa: p.casa, nombre: p.nombre, cantidad, precio, costo: +p.costo || 0 });
    });
    if (!items.length) { toast("Agrega al menos un producto.", "error"); return; }
    const total = items.reduce((s, it) => s + it.precio * it.cantidad, 0);
    const pagado = Math.min(total, +f.get("pagado") || 0);
    try {
      await addDoc(collection(db, "ventas"), {
        cliente: f.get("cliente").trim(),
        telefono: f.get("telefono").trim(),
        tipoPrecio: f.get("tipoPrecio"),
        items, total, pagado,
        abonos: pagado ? [{ monto: pagado, fecha: new Date().toISOString() }] : [],
        credito: pagado < total,
        notas: f.get("notas").trim(),
        fecha: serverTimestamp(),
      });
      // Descontar stock + registrar cliente
      for (const it of items) {
        const p = state.productos.find((x) => x.id === it.id);
        await updateDoc(doc(db, "perfumes", it.id), {
          stock: Math.max(0, (+p.stock || 0) - it.cantidad),
        });
      }
      const tel = f.get("telefono").trim();
      if (f.get("cliente").trim()) {
        await setDoc(doc(db, "clientes", (tel || f.get("cliente").trim()).replace(/\W/g, "_")), {
          nombre: f.get("cliente").trim(), telefono: tel,
        }, { merge: true }).catch(() => {});
      }
      toast("Venta registrada.", "ok");
      cerrarModal();
      await Promise.all([cargarProductos(), cargarVentas()]);
      renderTodo();
    } catch (err) { toast("Error: " + err.message, "error"); }
  });
}

$("ventas-table").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-delventa]");
  if (!del) return;
  const v = state.ventas.find((x) => x.id === del.dataset.delventa);
  if (!confirm("¿Eliminar esta venta? El stock de sus productos será restaurado.")) return;
  try {
    for (const it of v.items || []) {
      const p = state.productos.find((x) => String(x.id) === String(it.id));
      if (p) await updateDoc(doc(db, "perfumes", p.id), { stock: (+p.stock || 0) + (+it.cantidad || 0) });
    }
    await deleteDoc(doc(db, "ventas", v.id));
    toast("Venta eliminada y stock restaurado.", "ok");
    await Promise.all([cargarProductos(), cargarVentas()]);
    renderTodo();
  } catch (err) { toast("Error: " + err.message, "error"); }
});

/* ═══════ DEUDORES ═══════ */
function renderDeudores() {
  const conSaldo = state.ventas.filter((v) => (+v.total || 0) - (+v.pagado || 0) > 0);
  const porCliente = {};
  conSaldo.forEach((v) => {
    const k = v.cliente || "Sin nombre";
    (porCliente[k] = porCliente[k] || { telefono: v.telefono, ventas: [] }).ventas.push(v);
  });
  const totalDeuda = conSaldo.reduce((s, v) => s + (+v.total - +v.pagado), 0);

  $("deuda-stats").innerHTML = `
    <div class="stat"><div class="stat-label">Deudores</div>
      <div class="stat-value">${Object.keys(porCliente).length}</div></div>
    <div class="stat"><div class="stat-label">Total por cobrar</div>
      <div class="stat-value ${totalDeuda ? "warn" : "ok"}">${money(totalDeuda)}</div></div>`;

  $("deuda-empty").hidden = conSaldo.length > 0;
  $("deuda-lista").innerHTML = Object.entries(porCliente).map(([cliente, d]) => {
    const deuda = d.ventas.reduce((s, v) => s + (+v.total - +v.pagado), 0);
    const detalle = d.ventas.map((v) =>
      `<div class="linea-item"><span class="detalle">${fechaCorta(v.fecha)} · ${money(v.total)} (pagado ${money(v.pagado)})</span>
       <button class="btn btn-ghost" data-abono="${v.id}" style="padding:.3rem .8rem;font-size:.78rem">Abonar</button></div>`).join("");
    const wa = d.telefono
      ? `https://wa.me/${String(d.telefono).replace(/\D/g, "")}?text=${encodeURIComponent(
          `Hola ${cliente}. Te recordamos que tienes un saldo pendiente de ${money(deuda)} en XParfum. Gracias.`)}`
      : null;
    return `<div class="deudor-card">
      <div class="deudor-head"><h4>${esc(cliente)}</h4><span class="monto" style="color:var(--warn);font-weight:500">${money(deuda)}</span></div>
      ${detalle}
      <div class="deudor-actions" style="margin-top:.7rem">
        ${wa ? `<a class="btn btn-primary" target="_blank" href="${wa}">Recordar por WhatsApp</a>` : ""}
      </div></div>`;
  }).join("");
}

$("deuda-lista").addEventListener("click", async (e) => {
  const ab = e.target.closest("[data-abono]");
  if (!ab) return;
  const v = state.ventas.find((x) => x.id === ab.dataset.abono);
  const saldo = (+v.total || 0) - (+v.pagado || 0);
  const monto = parseFloat(prompt(`Saldo pendiente: ${money(saldo)}\n¿Monto del abono?`, saldo));
  if (!monto || monto <= 0) return;
  try {
    await updateDoc(doc(db, "ventas", v.id), {
      pagado: Math.min(+v.total, (+v.pagado || 0) + monto),
      abonos: [...(v.abonos || []), { monto, fecha: new Date().toISOString() }],
    });
    toast("Abono registrado.", "ok");
    await cargarVentas(); renderTodo();
  } catch (err) { toast("Error: " + err.message, "error"); }
});

/* ═══════ PROVEEDORES ═══════ */
function renderProveedores() {
  $("prov-empty").hidden = state.proveedores.length > 0;
  $("prov-table").querySelector("tbody").innerHTML = state.proveedores.map((p) => `
    <tr><td>${esc(p.nombre)}</td><td>${esc(p.telefono || "—")}</td>
    <td>${esc(p.correo || "—")}</td><td>${esc(p.notas || "—")}</td>
    <td class="acciones">
      <button class="accion-btn" data-editprov="${p.id}" title="Editar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>
      <button class="accion-btn rojo" data-delprov="${p.id}" title="Eliminar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
    </td></tr>`).join("");
}

$("prov-nuevo").addEventListener("click", () => modalProveedor());

function modalProveedor(p = null) {
  abrirModal(`
    <h3>${p ? "Editar proveedor" : "Nuevo proveedor"}</h3>
    <form id="form-prov">
      <div class="modal-grid">
        <label class="field"><span>Nombre</span><input name="nombre" required value="${esc(p?.nombre || "")}" /></label>
        <label class="field"><span>Teléfono</span><input name="telefono" value="${esc(p?.telefono || "")}" /></label>
        <label class="field"><span>Correo</span><input name="correo" type="email" value="${esc(p?.correo || "")}" /></label>
        <label class="field"><span>Notas</span><input name="notas" value="${esc(p?.notas || "")}" /></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>`);
  document.getElementById("form-prov").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = {
      nombre: f.get("nombre").trim(), telefono: f.get("telefono").trim(),
      correo: f.get("correo").trim(), notas: f.get("notas").trim(),
    };
    try {
      if (p) await updateDoc(doc(db, "proveedores", p.id), data);
      else await addDoc(collection(db, "proveedores"), data);
      toast("Proveedor guardado.", "ok");
      cerrarModal();
      await cargarProveedores(); renderTodo();
    } catch (err) { toast("Error: " + err.message, "error"); }
  });
}

$("prov-table").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-editprov]");
  const del = e.target.closest("[data-delprov]");
  if (ed) modalProveedor(state.proveedores.find((p) => p.id === ed.dataset.editprov));
  if (del && confirm("¿Eliminar este proveedor?")) {
    try {
      await deleteDoc(doc(db, "proveedores", del.dataset.delprov));
      await cargarProveedores(); renderTodo();
    } catch (err) { toast("Error: " + err.message, "error"); }
  }
});

/* ═══════ MONEDA / BCV ═══════ */
function renderMoneda() {
  $("moneda-propia").value = state.moneda.tasaPropia ?? "";
  $("moneda-bcv").value = state.moneda.tasaBcv ?? "";
  $("moneda-actualizado").textContent = state.moneda.bcvActualizado
    ? `BCV actualizado: ${fechaCorta(state.moneda.bcvActualizado)}`
    : "";
  const ejemplo = state.productos[0];
  if (ejemplo && state.moneda.tasaPropia) {
    const precio = +ejemplo.precioMayor;
    const enBs = precio * +state.moneda.tasaPropia;
    const base = state.moneda.tasaBcv ? enBs / +state.moneda.tasaBcv : null;
    $("moneda-preview").innerHTML = `
      <div class="linea-item"><span class="detalle">${esc(ejemplo.nombre)} (mayor)</span><span class="monto">${money(precio)}</span></div>
      <div class="linea-item"><span class="detalle">En bolívares (tu tasa)</span><span class="monto">Bs ${bsFmt(enBs)}</span></div>
      ${base ? `<div class="linea-item"><span class="detalle">Costo base (Bs ÷ BCV)</span><span class="monto">${money(base)}</span></div>` : ""}`;
  } else {
    $("moneda-preview").innerHTML = `<p class="empty-note">Define tu tasa para ver el ejemplo.</p>`;
  }
}

async function refrescarBCV(forzar = true) {
  const est = $("moneda-bcv-estado");
  const cache = JSON.parse(localStorage.getItem("xparfum_bcv") || "null");
  const fresco = cache && Date.now() - cache.t < 24 * 60 * 60 * 1000;
  if (fresco && !forzar) {
    state.moneda.tasaBcv = cache.v;
    renderMoneda();
    return;
  }
  est.textContent = "Consultando…";
  try {
    const res = await fetch("https://ve.dolarapi.com/v1/dolares/oficial");
    const data = await res.json();
    const v = +data.promedio;
    if (!v) throw new Error("sin dato");
    state.moneda.tasaBcv = v;
    localStorage.setItem("xparfum_bcv", JSON.stringify({ v, t: Date.now() }));
    est.textContent = `BCV: ${v}`;
    renderMoneda();
  } catch {
    est.textContent = cache ? `Sin conexión · último BCV: ${cache.v}` : "No se pudo obtener la tasa.";
    if (cache) { state.moneda.tasaBcv = cache.v; renderMoneda(); }
  }
}

$("moneda-refrescar").addEventListener("click", () => refrescarBCV(true));

$("form-moneda").addEventListener("submit", async (e) => {
  e.preventDefault();
  const tasaPropia = +$("moneda-propia").value || null;
  try {
    await setDoc(doc(db, "config", "moneda"), {
      tasaPropia,
      tasaBcv: state.moneda.tasaBcv || null,
      bcvActualizado: new Date().toISOString(),
    }, { merge: true });
    state.moneda.tasaPropia = tasaPropia;
    toast("Tasas guardadas.", "ok");
    renderMoneda();
  } catch (err) { toast("Error: " + err.message, "error"); }
});

/* ═══════ MODAL genérico ═══════ */
function abrirModal(html) {
  $("modal").innerHTML = html;
  $("modal-overlay").hidden = false;
}
function cerrarModal() {
  $("modal-overlay").hidden = true;
  $("modal").innerHTML = "";
}
$("modal-overlay").addEventListener("click", (e) => {
  if (e.target === $("modal-overlay") || e.target.closest("[data-cerrar]")) cerrarModal();
});

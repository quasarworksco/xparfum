# XParfum

Sitio web de comercio electrónico para venta de perfumes, con catálogo, carrito de pedidos por WhatsApp y panel de administración completo.

**Identidad visual:** fondo marrón humo con detalles dorados. Tipografías Cormorant Garamond + Jost.

## Tecnología

- **HTML5 + CSS3 + JavaScript** puro (módulos ES, sin frameworks ni build).
- Diseño elegante estilo "humo y oro", totalmente responsive.
- **Firestore** (proyecto `xparfum-38673`) como base de datos, con fallback a datos locales.

## Funcionalidades de la tienda (`index.html`)

- **Búsqueda en tiempo real** por nombre de perfume o casa (ignora acentos).
- **Filtro por casa/marca** mediante selector y chips de casas destacadas.
- **Precios al mayor y al detal** con selector en el encabezado.
- **Ordenamiento** por casa, nombre o precio; **paginación** automática.
- **Sección de destacados** (carrusel) con los productos marcados en el admin.
- **Precios en bolívares** si hay tasas configuradas en el admin (tu tasa + referencia BCV).
- **Carrito de pedido**: el cliente agrega perfumes, deja nombre y teléfono, y envía el pedido por **WhatsApp** (número en `WHATSAPP_NUMERO`, `js/firebase-config.js`). El pedido también se registra en Firestore (colección `pedidos`) para gestionarlo desde el admin. El carrito persiste en el navegador.

## Panel de administración (`admin.html`)

- **Resumen**: productos, unidades y valor del inventario a costo, ventas y ganancia estimada del mes, por cobrar, últimas ventas y stock bajo.
- **Productos**: crear, editar, eliminar; costo privado, precios mayor/detal/oferta, stock, proveedor, imagen y destacado. Entradas/salidas de inventario con bitácora. Botón para importar el catálogo local la primera vez.
- **Pedidos web**: los pedidos de la tienda llegan como *pendientes*; al confirmarlos el stock baja automáticamente.
- **Ventas**: registro con varios productos, tipo mayor/detal, monto pagado y notas. Descuenta stock; eliminar una venta lo restaura.
- **Deudores**: ventas con saldo pendiente agrupadas por cliente, con abonos y recordatorio por WhatsApp.
- **Proveedores**: registro, edición y eliminación.
- **Moneda / Bs**: tu tasa propia + tasa BCV automática vía [DolarAPI](https://ve.dolarapi.com/v1/dolares/oficial) (caché de 24 h).

### Acceso al panel (uso interno)

El ingreso es con **usuario y contraseña fijos definidos en el código** (`js/admin.js`, constantes `ADMIN_USER` / `ADMIN_PASS`):

- Usuario: `admin`
- Contraseña: la definida en `ADMIN_PASS`

No se usa Firebase Authentication: el login es 100% local. Para cambiar la clave, edita `ADMIN_PASS` en `js/admin.js`.

> ⚠️ Al no haber autenticación en Firebase, las reglas de Firestore deben permitir escritura abierta (ver abajo). Esto significa que la protección real del panel es la URL privada + el login del código. No compartas `admin.html` públicamente.

### Reglas de Firestore

Publícalas en [Firestore → Reglas](https://console.firebase.google.com/project/xparfum-38673/firestore/rules):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Sin Firebase Auth: el acceso al panel se controla en el código
    // (login local). Estas reglas abren lectura/escritura a las
    // colecciones que usa la aplicación.
    match /perfumes/{id}    { allow read, write: if true; }
    match /pedidos/{id}     { allow read, write: if true; }
    match /config/{id}      { allow read, write: if true; }
    match /costos/{id}      { allow read, write: if true; }
    match /ventas/{id}      { allow read, write: if true; }
    match /proveedores/{id} { allow read, write: if true; }
    match /clientes/{id}    { allow read, write: if true; }
    match /movimientos/{id} { allow read, write: if true; }
  }
}
```

Las reglas están abiertas porque el panel no usa Firebase Authentication (el login es local, en el código). Los costos se guardan en la colección `costos`, separada del catálogo público `perfumes`.

### Colecciones en Firestore

| Colección | Contenido | Acceso |
|---|---|---|
| `perfumes` | casa, nombre, precioMayor, precioDetal, precioOferta, stock, imagen, destacado | lectura pública |
| `costos` | costo (mi costo), proveedorId — por producto | solo admin |
| `pedidos` | pedidos de la tienda (pendiente/confirmado/rechazado) | crear: público · gestionar: admin |
| `ventas` | fecha, cliente, telefono, items, total, pagado, abonos, notas | solo admin |
| `proveedores` | nombre, teléfono, correo, notas | solo admin |
| `clientes` | nombre, telefono (registro automático al vender) | solo admin |
| `movimientos` | bitácora de entradas/salidas de inventario | solo admin |
| `config/moneda` | tasaPropia (tu tasa) y tasaBcv (respaldo) | lectura pública · escritura admin |

### Fotos de productos (Cloudinary)

Las fotos se suben desde el modal de producto del admin (botón **"Subir foto"**) a Cloudinary; la URL optimizada (`f_auto,q_auto,w_800`) se guarda en Firestore.

Configuración en `js/firebase-config.js` (`CLOUDINARY_CONFIG`): `cloudName` y `uploadPreset`. El preset debe ser **Unsigned** (Cloudinary → Settings → Upload → Upload presets). Las fotos quedan en la carpeta `perfumes`.

## Catálogo local y precios al detal

`js/data.js` trae un **catálogo de muestra** (edítalo o impórtalo y ajusta desde el admin). Los precios al detal por defecto son **precio al mayor + $5** (constante `DETAL_MARKUP`); puedes definir un `precioDetal` propio por producto.

## Cómo ejecutarlo

Es un sitio estático: basta con servir la carpeta.

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Estructura

```
index.html            Tienda pública
admin.html            Panel de administración (login interno)
propuesta.html        Propuesta comercial
css/styles.css        Estilos de la tienda
css/admin.css         Estilos del panel admin
css/propuesta.css     Estilos de la propuesta
js/data.js            Catálogo local (fallback) y DETAL_MARKUP
js/firebase-config.js Config de Firebase, WhatsApp y Cloudinary
js/app.js             Tienda: búsqueda, filtros, carrito, pedidos
js/admin.js           Admin: login, productos, pedidos, ventas, deudores, proveedores, moneda
```

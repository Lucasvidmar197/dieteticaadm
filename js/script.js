import { onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getCatalogCollections } from "./catalog-store.js";

// ─── ESTADO GLOBAL ───
let productos = [];
let categoriasDB = [];
let carrito = {};
let cantidades = {};
let currentFilter = 'todos';
let searchTerm = '';
const DEFAULT_PRODUCT_IMAGE = 'img/product-placeholder.svg';

function getProductCategories(producto) {
    if (Array.isArray(producto.categorias) && producto.categorias.length > 0) {
        return producto.categorias;
    }

    if (producto.categoria) {
        return [producto.categoria];
    }

    return [];
}

function getPrimaryCategory(producto) {
    return producto.categoriaPrincipal || producto.categoria || 'Sin categoría';
}

function getProductImage(producto) {
    return producto.imagenUrl || DEFAULT_PRODUCT_IMAGE;
}

// ─── RENDER PRODUCTOS ───
function renderProductos(lista) {
    const grid = document.getElementById('productos-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    if(lista.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #666; font-size: 1.1rem; padding: 40px;">No se encontraron productos.</p>';
        return;
    }

    lista.forEach(p => {
        const enCarrito = carrito[p.id];
        if (!cantidades[p.id]) cantidades[p.id] = 1;

        grid.innerHTML += `
        <div class="producto-card" data-id="${p.id}" data-cat="${getProductCategories(p).join('|')}">
            <div class="producto-img" style="padding: 0;">
                <img src="${getProductImage(p)}" alt="${p.nombre}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius: 12px 12px 0 0;">
                ${p.promo ? '<span class="badge-promo">🔥 Promo</span>' : ''}
            </div>
            <div class="producto-body">
                <div class="producto-categoria-tag">${getPrimaryCategory(p)}</div>
                <div class="producto-nombre">${p.nombre}</div>
                <div class="producto-desc">${p.desc || ''}</div>
                <div class="producto-precio-row">
                    <span class="precio-actual">$${p.precio.toLocaleString('es-AR')}</span>
                    ${p.precioAntes ? `<span class="precio-tachado">$${p.precioAntes.toLocaleString('es-AR')}</span>` : ''}
                </div>
                <div class="cantidad-control">
                    <button class="cantidad-btn" data-action="decrease">−</button>
                    <span class="cantidad-num" id="qty-${p.id}">${cantidades[p.id]}</span>
                    <button class="cantidad-btn" data-action="increase">+</button>
                </div>
                <button class="btn-agregar ${enCarrito ? 'agregado' : ''}" data-action="add">
                    <i class="fas ${enCarrito ? 'fa-check' : 'fa-cart-plus'}"></i>
                    ${enCarrito ? '¡Agregado!' : 'Agregar al carrito'}
                </button>
            </div>
        </div>`;
    });
}

// ─── PDP MODAL (Product Detail Page) ───
function openPDP(productId) {
    const p = productos.find(x => x.id === productId);
    if (!p) return;

    const modal = document.getElementById('pdpModal');
    const overlay = document.getElementById('pdpOverlay');
    if (!modal || !overlay) return;

    document.getElementById('pdpImage').src = getProductImage(p);
    document.getElementById('pdpCategoria').textContent = getPrimaryCategory(p);
    document.getElementById('pdpNombre').textContent = p.nombre;
    document.getElementById('pdpPrecio').textContent = `$${p.precio.toLocaleString('es-AR')}`;
    document.getElementById('pdpPrecioAntes').textContent = p.precioAntes ? `$${p.precioAntes.toLocaleString('es-AR')}` : '';
    document.getElementById('pdpDesc').textContent = p.desc || 'Sin descripción disponible.';
    document.getElementById('pdpQty').textContent = cantidades[p.id] || 1;

    // Guardar ID actual en el botón de agregar del modal
    document.getElementById('pdpAddBtn').onclick = () => agregarAlCarrito(p.id);
    
    // Controles de cantidad en el modal
    document.getElementById('pdpPlus').onclick = () => {
        cambiarCantidad(p.id, 1);
        document.getElementById('pdpQty').textContent = cantidades[p.id];
    };
    document.getElementById('pdpMinus').onclick = () => {
        cambiarCantidad(p.id, -1);
        document.getElementById('pdpQty').textContent = cantidades[p.id];
    };

    modal.classList.add('activo');
    overlay.classList.add('activo');
    document.body.style.overflow = 'hidden';
}

function closePDP() {
    const modal = document.getElementById('pdpModal');
    const overlay = document.getElementById('pdpOverlay');
    if (modal) modal.classList.remove('activo');
    if (overlay) overlay.classList.remove('activo');
    document.body.style.overflow = 'auto';
}

// ─── FILTROS Y BÚSQUEDA ───
function generarFiltros() {
    const filtrosBar = document.getElementById('filtros');
    const dropdown = document.getElementById('categorias-dropdown');
    const sidebar = document.getElementById('sidebar-categorias');

    const htmlFiltros = `<button class="filtro-btn ${currentFilter === 'todos' ? 'activo' : ''}" data-filter="todos">Todos</button>` + 
        categoriasDB.map(cat => `<button class="filtro-btn ${currentFilter === cat.nombre ? 'activo' : ''}" data-filter="${cat.nombre}">${cat.icono || '✨'} ${cat.nombre}</button>`).join('');

    const htmlListItems = `<li><a href="javascript:void(0)" class="filtro-link ${currentFilter === 'todos' ? 'activo' : ''}" data-filter="todos">Todos</a></li>` +
        categoriasDB.map(cat => `<li><a href="javascript:void(0)" class="filtro-link ${currentFilter === cat.nombre ? 'activo' : ''}" data-filter="${cat.nombre}">${cat.icono || '✨'} ${cat.nombre}</a></li>`).join('');

    if (filtrosBar) filtrosBar.innerHTML = htmlFiltros;
    if (dropdown) dropdown.innerHTML = htmlListItems;
    if (sidebar) sidebar.innerHTML = htmlListItems;

    // Re-attach event listeners
    document.querySelectorAll('.filtro-btn, .filtro-link').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            filtrarProductos(el.dataset.filter, el.classList.contains('filtro-btn') ? el : null);
        });
    });
}

function generarGridCategorias() {
    const grid = document.getElementById('categorias-grid');
    if (!grid) return;
    
    if (categoriasDB.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #666;">No hay categorías disponibles.</p>';
        return;
    }

    grid.innerHTML = categoriasDB.map(cat => `
        <div class="categoria-card" data-category="${cat.nombre}">
            <span class="icono">${cat.icono || '✨'}</span>
            <h3>${cat.nombre}</h3>
        </div>
    `).join('');

    // Attach event listeners
    document.querySelectorAll('.categoria-card').forEach(card => {
        card.addEventListener('click', () => {
            filtrarCategoria(card.dataset.category);
        });
    });
}

function filtrarProductos(cat, btn) {
    if (btn) {
        document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('activo'));
        btn.classList.add('activo');
        currentFilter = cat;
    } else {
        currentFilter = cat || currentFilter;
    }

    let filtrados = productos;
    
    if (currentFilter !== 'todos') {
        filtrados = filtrados.filter(p => getProductCategories(p).includes(currentFilter));
    }
    
    if (searchTerm) {
        filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    
    renderProductos(filtrados);
}

function filtrarCategoria(cat) {
    document.getElementById('promos').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
        const btnToActivate = document.querySelector(`.filtro-btn[data-filter="${cat}"]`);
        if(btnToActivate) filtrarProductos(cat, btnToActivate);
    }, 400);
}

// ─── CANTIDAD ───
function cambiarCantidad(id, delta) {
    cantidades[id] = Math.max(1, (cantidades[id] || 1) + delta);
    const el = document.getElementById('qty-' + id);
    if (el) el.textContent = cantidades[id];
    if (carrito[id]) {
        carrito[id].cantidad = cantidades[id];
        renderCarrito();
    }
}

// ─── CARRITO ───
function agregarAlCarrito(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;

    const qty = cantidades[id] || 1;
    if (carrito[id]) {
        carrito[id].cantidad += qty;
    } else {
        carrito[id] = { ...p, cantidad: qty };
    }
    renderCarrito();
    const card = document.querySelector(`.producto-card[data-id="${id}"]`);
    const btn = card ? card.querySelector('.btn-agregar') : null;
    if (btn) {
        btn.classList.add('agregado');
        btn.innerHTML = '<i class="fas fa-check"></i> ¡Agregado!';
    }
    showToast(`✅ ${p.nombre} agregado`);
    actualizarBadge();
}

function quitarDelCarrito(id) {
    delete carrito[id];
    renderCarrito();
    const card = document.querySelector(`.producto-card[data-id="${id}"]`);
    const btn = card ? card.querySelector('.btn-agregar') : null;
    if (btn) {
        btn.classList.remove('agregado');
        btn.innerHTML = '<i class="fas fa-cart-plus"></i> Agregar al carrito';
    }
    actualizarBadge();
}

function renderCarrito() {
    const items = Object.values(carrito);
    const container = document.getElementById('carritoItems');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `
            <div class="carrito-vacio" id="carritoVacio">
                <i class="fas fa-shopping-basket"></i>
                <p>Tu carrito está vacío</p>
            </div>`;
    } else {
        container.innerHTML = items.map(item => `
            <div class="carrito-item" data-id="${item.id}">
                <img src="${getProductImage(item)}" alt="${item.nombre}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">
                <div class="carrito-item-info">
                    <div class="carrito-item-nombre">${item.nombre}</div>
                    <div class="carrito-item-precio">$${(item.precio * item.cantidad).toLocaleString('es-AR')}</div>
                    <div class="carrito-item-qty">Cantidad: ${item.cantidad}</div>
                </div>
                <button class="carrito-item-remove"><i class="fas fa-trash-alt"></i></button>
            </div>
        `).join('');
    }
    
    const total = items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

    const totalEl = document.getElementById('carritoTotal');
    if (totalEl) {
        totalEl.innerHTML = `
            <div style="text-align: right;">
                <div>$${total.toLocaleString('es-AR')}</div>
            </div>
        `;
    }
    actualizarBadge();
}

function actualizarBadge() {
    const total = Object.values(carrito).reduce((s, i) => s + i.cantidad, 0);
    const badge = document.getElementById('badge');
    if (badge) badge.textContent = total;
}

function toggleCarrito() {
    const panel = document.getElementById('carritoPanel');
    const overlay = document.getElementById('carritoOverlay');
    if (panel) panel.classList.toggle('abierto');
    if (overlay) overlay.style.display = panel && panel.classList.contains('abierto') ? 'block' : 'none';
}

// ─── COMPRAR POR WHATSAPP (Checkout Placeholder) ───
function comprarPorWhatsapp() {
    const items = Object.values(carrito);
    if (items.length === 0) {
        showToast('⚠️ Tu carrito está vacío');
        return;
    }
    let lineas = items.map(i => `• ${i.nombre} (x${i.cantidad}) — $${(i.precio * i.cantidad).toLocaleString('es-AR')}`).join('\n');
    
    const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);

    const msg = `Hola buenas! 😊 Quiero comprar los siguientes productos:\n\n${lineas}\n\n💰 *Total final: $${total.toLocaleString('es-AR')}*\n\n¿Podría confirmar disponibilidad y coordinar la entrega? ¡Muchas gracias!`;
    const url = `https://wa.me/5491144468486?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

// ─── TOAST ───
window.showToast = function(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
}

// ─── INIT & EVENT LISTENERS ───
document.addEventListener('DOMContentLoaded', () => {
    inicializarCatalogo().catch(err => {
        console.error("Error crítico inicializando catálogo:", err);
        const grid = document.getElementById('productos-grid');
        if (grid) grid.innerHTML = '<p style="text-align:center; padding:20px; color:red;">Error al conectar con la base de datos. Por favor, recargá la página.</p>';
    });
});

async function inicializarCatalogo() {
    const grid = document.getElementById('productos-grid');
    if (grid) grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Cargando productos...</p></div>';

    const { productsCollection, categoriesCollection } = await getCatalogCollections();

    // Fetch Categorias
    onSnapshot(categoriesCollection, (snapshot) => {
        categoriasDB = [];
        snapshot.forEach((doc) => {
            const categoria = { id: doc.id, ...doc.data() };
            if (categoria.activa === false) return;
            categoriasDB.push(categoria);
        });
        generarFiltros();
        generarGridCategorias();
        // Si los productos ya cargaron, re-renderizamos para que se vean los filtros
        if (productos.length > 0) {
            filtrarProductos(currentFilter, null);
        }
    }, (error) => {
        console.error("Error obteniendo categorias: ", error);
    });

    // Fetch Firebase
    onSnapshot(productsCollection, (snapshot) => {
        productos = [];
        snapshot.forEach((doc) => {
            const producto = { id: doc.id, ...doc.data() };
            if (producto.activo === false) return;
            productos.push(producto);
        });
        
        generarFiltros();
        if (typeof filtrarProductos === 'function') filtrarProductos(currentFilter, null);
    }, (error) => {
        console.error("Error obteniendo productos: ", error);
        if (grid) grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: red;">Error al cargar los productos.</p>';
    });

    // Buscador
    const buscador = document.getElementById('buscador-header') || document.getElementById('buscador');
    if(buscador) {
        buscador.addEventListener('input', (e) => {
            searchTerm = e.target.value;
            filtrarProductos(currentFilter, null);
        });
    }

    // FAQ Scroll
    const faqBtn = document.getElementById('btn-faq-nav');
    if (faqBtn) {
        faqBtn.addEventListener('click', () => {
            const faqSection = document.getElementById('faq');
            if (faqSection) faqSection.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Carrito toggles
    const cartBtn = document.querySelector('.nav-carrito-btn');
    const cartOverlay = document.getElementById('carritoOverlay');
    const cartClose = document.querySelector('.carrito-close');
    
    if (cartBtn) cartBtn.addEventListener('click', toggleCarrito);
    if (cartOverlay) cartOverlay.addEventListener('click', toggleCarrito);
    if (cartClose) cartClose.addEventListener('click', toggleCarrito);

    // Product grid actions
    if (grid) {
        grid.addEventListener('click', (e) => {
            const card = e.target.closest('.producto-card');
            if (!card) return;

            const id = card.dataset.id;
            const action = e.target.dataset.action;

            if (action === 'increase') {
                cambiarCantidad(id, 1);
            } else if (action === 'decrease') {
                cambiarCantidad(id, -1);
            } else if (action === 'add' || e.target.closest('.btn-agregar')) {
                agregarAlCarrito(id);
            } else {
                // Si hace click en cualquier otro lado de la card (imagen, nombre, etc)
                openPDP(id);
            }
        });
    }

    // PDP Modal Close
    const closeBtn = document.querySelector('.pdp-close');
    const pdpOverlay = document.getElementById('pdpOverlay');
    if (closeBtn) closeBtn.addEventListener('click', closePDP);
    if (pdpOverlay) pdpOverlay.addEventListener('click', closePDP);

    // Cart items actions
    const cartItems = document.getElementById('carritoItems');
    if (cartItems) {
        cartItems.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.carrito-item-remove');
            if (removeBtn) {
                const id = removeBtn.closest('.carrito-item').dataset.id;
                quitarDelCarrito(id);
            }
        });
    }

    // Buy button
    const buyBtn = document.querySelector('.btn-comprar-todo');
    if (buyBtn) buyBtn.addEventListener('click', comprarPorWhatsapp);
}

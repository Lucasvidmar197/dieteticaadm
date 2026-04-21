import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ─── CONFIGURACIÓN FIREBASE ───
const firebaseConfig = {
    apiKey: "AIzaSyALovDYcyU5nr5bNGalRaCPTdnejns_avg",
    authDomain: "vitamita-d.firebaseapp.com",
    projectId: "vitamita-d",
    storageBucket: "vitamita-d.firebasestorage.app",
    messagingSenderId: "1055676055964",
    appId: "1:1055676055964:web:37ed8d6c3cfac62ccd0859"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── ESTADO GLOBAL ───
let productos = [];
let categoriasDB = [];
let carrito = {};
let cantidades = {};
let currentFilter = 'todos';
let searchTerm = '';
let productosFiltrados = [];
let productosMostrados = 0;
let currentPDPId = null;
const PRODUCTOS_POR_PAGINA = 24;

// ─── RENDER PRODUCTOS ───
function renderProductos(lista, append = false) {
    const grid = document.getElementById('productos-grid');
    const loadMoreContainer = document.getElementById('load-more-container');
    
    if (!append) {
        grid.innerHTML = '';
        productosMostrados = 0;
    }
    
    if (lista.length === 0 && !append) {
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #666; font-size: 1.1rem; padding: 40px;">No se encontraron productos.</p>';
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        return;
    }

    const productosARenderizar = lista.slice(productosMostrados, productosMostrados + PRODUCTOS_POR_PAGINA);
    let html = '';

    productosARenderizar.forEach(p => {
        const enCarrito = carrito[p.id];
        if (!cantidades[p.id]) cantidades[p.id] = 1;

        let catsToRender = p.categorias || (p.categoria ? [p.categoria] : ['Varios']);
        let catsHtml = catsToRender.map(c => `<div class="producto-categoria-tag" style="display:inline-block; margin-right:5px; margin-bottom:5px;">${c}</div>`).join('');

        html += `
        <div class="producto-card" data-id="${p.id}" data-cat="${p.categoria}">
            <div class="producto-img" style="padding: 0;">
                <img src="${p.imagenUrl || 'https://via.placeholder.com/300x200?text=Sin+Imagen'}" alt="${p.nombre}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius: 12px 12px 0 0;">
                ${p.promo ? '<span class="badge-promo">🔥 Promo</span>' : ''}
            </div>
            <div class="producto-body">
                <div style="display:flex; flex-wrap:wrap;">${catsHtml}</div>
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

    if (append) {
        grid.insertAdjacentHTML('beforeend', html);
    } else {
        grid.innerHTML = html;
    }

    productosMostrados += productosARenderizar.length;

    if (loadMoreContainer) {
        if (productosMostrados < lista.length) {
            loadMoreContainer.style.display = 'block';
        } else {
            loadMoreContainer.style.display = 'none';
        }
    }
}

// ─── FILTROS Y BÚSQUEDA ───
function generarFiltros() {
    const filtrosBar = document.getElementById('filtros');
    
    let html = `<button class="filtro-btn ${currentFilter === 'todos' ? 'activo' : ''}" data-filter="todos">Todos</button>`;
    categoriasDB.forEach(cat => {
        html += `<button class="filtro-btn ${currentFilter === cat.nombre ? 'activo' : ''}" data-filter="${cat.nombre}">${cat.icono || '✨'} ${cat.nombre}</button>`;
    });
    filtrosBar.innerHTML = html;

    // Re-attach event listeners
    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            filtrarProductos(btn.dataset.filter, btn);
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

    productosFiltrados = productos;
    
    if (currentFilter !== 'todos') {
        productosFiltrados = productosFiltrados.filter(p => {
            const cats = p.categorias || (p.categoria ? [p.categoria] : []);
            return cats.includes(currentFilter);
        });
    }
    
    if (searchTerm) {
        productosFiltrados = productosFiltrados.filter(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    
    renderProductos(productosFiltrados, false);
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
    if (items.length === 0) {
        container.innerHTML = `
            <div class="carrito-vacio" id="carritoVacio">
                <i class="fas fa-shopping-basket"></i>
                <p>Tu carrito está vacío</p>
            </div>`;
    } else {
        container.innerHTML = items.map(item => `
            <div class="carrito-item" data-id="${item.id}">
                <img src="${item.imagenUrl}" alt="${item.nombre}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">
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

    document.getElementById('carritoTotal').innerHTML = `
        <div style="text-align: right;">
            <div>$${total.toLocaleString('es-AR')}</div>
        </div>
    `;
    actualizarBadge();
}

function actualizarBadge() {
    const total = Object.values(carrito).reduce((s, i) => s + i.cantidad, 0);
    document.getElementById('badge').textContent = total;
}

function toggleCarrito() {
    const panel = document.getElementById('carritoPanel');
    const overlay = document.getElementById('carritoOverlay');
    panel.classList.toggle('abierto');
    overlay.style.display = panel.classList.contains('abierto') ? 'block' : 'none';
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

// ─── PRODUCT DETAIL MODAL (PDP) ───
function openProductDetail(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;

    currentPDPId = id;
    const modal = document.getElementById('pdpModal');
    const overlay = document.getElementById('pdpOverlay');
    
    // Fill data
    document.getElementById('pdpImage').src = p.imagenUrl || 'https://via.placeholder.com/300x200?text=Sin+Imagen';
    
    let catsToRender = p.categorias || (p.categoria ? [p.categoria] : ['Varios']);
    document.getElementById('pdpCategoria').textContent = catsToRender.join(', ');
    
    document.getElementById('pdpNombre').textContent = p.nombre;
    document.getElementById('pdpPrecio').textContent = `$${p.precio.toLocaleString('es-AR')}`;
    document.getElementById('pdpPrecioAntes').textContent = p.precioAntes ? `$${p.precioAntes.toLocaleString('es-AR')}` : '';
    document.getElementById('pdpDesc').textContent = p.desc || 'Sin descripción disponible.';
    
    // Quantity
    if (!cantidades[id]) cantidades[id] = 1;
    document.getElementById('pdpQty').textContent = cantidades[id];

    // Button state
    const btn = document.getElementById('pdpAddBtn');
    const enCarrito = carrito[id];
    if (enCarrito) {
        btn.classList.add('agregado');
        btn.innerHTML = '<i class="fas fa-check"></i> ¡Agregado!';
    } else {
        btn.classList.remove('agregado');
        btn.innerHTML = '<i class="fas fa-cart-plus"></i> Agregar al carrito';
    }

    // Show modal
    modal.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent scroll

    // Initialize zoom
    initZoom('pdpImage', 'pdpZoomResult', 'pdpZoomLens');
}

function closeProductDetail() {
    const modal = document.getElementById('pdpModal');
    const overlay = document.getElementById('pdpOverlay');
    modal.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = ''; // Restore scroll
    currentPDPId = null;
}

function initZoom(imgID, resultID, lensID) {
    const img = document.getElementById(imgID);
    const result = document.getElementById(resultID);
    const lens = document.getElementById(lensID);
    const container = img.parentElement;

    if (!img || !result || !lens) return;

    // Reset styles
    result.style.backgroundImage = `url('${img.src}')`;
    
    container.onmousemove = (e) => {
        if (window.innerWidth <= 850) return; // No zoom on mobile

        lens.style.display = 'block';
        result.style.display = 'block';

        const rect = container.getBoundingClientRect();
        let x = e.pageX - rect.left - window.scrollX;
        let y = e.pageY - rect.top - window.scrollY;

        // Lens bounds
        if (x > img.width - (lens.offsetWidth / 2)) x = img.width - (lens.offsetWidth / 2);
        if (x < lens.offsetWidth / 2) x = lens.offsetWidth / 2;
        if (y > img.height - (lens.offsetHeight / 2)) y = img.height - (lens.offsetHeight / 2);
        if (y < lens.offsetHeight / 2) y = lens.offsetHeight / 2;

        lens.style.left = (x - lens.offsetWidth / 2) + "px";
        lens.style.top = (y - lens.offsetHeight / 2) + "px";

        // Zoom calculation
        const cx = result.offsetWidth / lens.offsetWidth;
        const cy = result.offsetHeight / lens.offsetHeight;

        result.style.backgroundSize = (img.width * cx) + "px " + (img.height * cy) + "px";
        result.style.backgroundPosition = "-" + ((x - lens.offsetWidth / 2) * cx) + "px -" + ((y - lens.offsetHeight / 2) * cy) + "px";
    };

    container.onmouseleave = () => {
        lens.style.display = 'none';
        result.style.display = 'none';
    };
}

// ─── INIT & EVENT LISTENERS ───
document.addEventListener('DOMContentLoaded', () => {
    
    const grid = document.getElementById('productos-grid');
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Cargando productos...</p></div>';

    // Fetch Categorias
    onSnapshot(collection(db, "categorias"), (snapshot) => {
        categoriasDB = [];
        snapshot.forEach((doc) => {
            categoriasDB.push({ id: doc.id, ...doc.data() });
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
    onSnapshot(collection(db, "productos"), (snapshot) => {
        productos = [];
        snapshot.forEach((doc) => {
            productos.push({ id: doc.id, ...doc.data() });
        });
        
        generarFiltros();
        filtrarProductos(currentFilter, null);
    }, (error) => {
        console.error("Error obteniendo productos: ", error);
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: red;">Error al cargar los productos.</p>';
    });

    // Buscador
    const buscador = document.getElementById('buscador');
    if(buscador) {
        buscador.addEventListener('input', (e) => {
            searchTerm = e.target.value;
            filtrarProductos(currentFilter, null);
        });
    }
    
    // Boton Cargar Más
    const btnLoadMore = document.getElementById('btn-load-more');
    if (btnLoadMore) {
        btnLoadMore.addEventListener('click', () => {
            renderProductos(productosFiltrados, true);
        });
    }

    // Carrito toggles
    document.querySelector('.nav-carrito-btn').addEventListener('click', toggleCarrito);
    document.getElementById('carritoOverlay').addEventListener('click', toggleCarrito);
    document.querySelector('.carrito-close').addEventListener('click', toggleCarrito);

    // PDP toggles
    document.querySelector('.pdp-close').addEventListener('click', closeProductDetail);
    document.getElementById('pdpOverlay').addEventListener('click', closeProductDetail);

    // Product grid actions
    document.getElementById('productos-grid').addEventListener('click', (e) => {
        const card = e.target.closest('.producto-card');
        if (!card) return;

        const id = card.dataset.id;
        const action = e.target.dataset.action;

        if (action === 'increase') {
            cambiarCantidad(id, 1);
            return;
        }
        if (action === 'decrease') {
            cambiarCantidad(id, -1);
            return;
        }
        if (action === 'add' || e.target.closest('.btn-agregar')) {
            agregarAlCarrito(id);
            return;
        }

        // If no action clicked, open PDP
        openProductDetail(id);
    });

    // PDP actions
    document.getElementById('pdpPlus').addEventListener('click', () => {
        if (currentPDPId) {
            cambiarCantidad(currentPDPId, 1);
            document.getElementById('pdpQty').textContent = cantidades[currentPDPId];
        }
    });
    document.getElementById('pdpMinus').addEventListener('click', () => {
        if (currentPDPId) {
            cambiarCantidad(currentPDPId, -1);
            document.getElementById('pdpQty').textContent = cantidades[currentPDPId];
        }
    });
    document.getElementById('pdpAddBtn').addEventListener('click', () => {
        if (currentPDPId) {
            agregarAlCarrito(currentPDPId);
            const btn = document.getElementById('pdpAddBtn');
            btn.classList.add('agregado');
            btn.innerHTML = '<i class="fas fa-check"></i> ¡Agregado!';
        }
    });

    // Cart items actions
    document.getElementById('carritoItems').addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.carrito-item-remove');
        if (removeBtn) {
            const id = removeBtn.closest('.carrito-item').dataset.id;
            quitarDelCarrito(id);
        }
    });

    // Buy button
    document.querySelector('.btn-comprar-todo').addEventListener('click', comprarPorWhatsapp);
});
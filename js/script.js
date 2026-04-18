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
let carrito = {};
let cantidades = {};
let currentFilter = 'todos';
let searchTerm = '';

// ─── RENDER PRODUCTOS ───
function renderProductos(lista) {
    const grid = document.getElementById('productos-grid');
    grid.innerHTML = '';
    
    if(lista.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #666; font-size: 1.1rem; padding: 40px;">No se encontraron productos.</p>';
        return;
    }

    lista.forEach(p => {
        const enCarrito = carrito[p.id];
        if (!cantidades[p.id]) cantidades[p.id] = 1;

        grid.innerHTML += `
        <div class="producto-card" data-id="${p.id}" data-cat="${p.categoria}">
            <div class="producto-img" style="padding: 0;">
                <img src="${p.imagenUrl}" alt="${p.nombre}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius: 12px 12px 0 0;">
                ${p.promo ? '<span class="badge-promo">🔥 Promo</span>' : ''}
            </div>
            <div class="producto-body">
                <div class="producto-categoria-tag">${p.categoria}</div>
                <div class="producto-nombre">${p.nombre}</div>
                <div class="producto-desc">${p.desc}</div>
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

// ─── FILTROS Y BÚSQUEDA ───
function generarFiltros() {
    const filtrosBar = document.getElementById('filtros');
    const categorias = [...new Set(productos.map(p => p.categoria))].filter(Boolean); // Remover undefined/null
    
    let html = `<button class="filtro-btn ${currentFilter === 'todos' ? 'activo' : ''}" data-filter="todos">Todos</button>`;
    categorias.forEach(cat => {
        const icon = getCategoryIcon(cat);
        html += `<button class="filtro-btn ${currentFilter === cat ? 'activo' : ''}" data-filter="${cat}">${icon} ${cat}</button>`;
    });
    filtrosBar.innerHTML = html;

    // Re-attach event listeners
    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            filtrarProductos(btn.dataset.filter, btn);
        });
    });
}

function getCategoryIcon(cat) {
    const icons = {
        'Frutos Secos': '🥜',
        'Cereales': '🌾',
        'Suplementos': '💊',
        'Sin TACC': '🌿',
        'Infusiones': '🍵',
        'Snacks': '🍫'
    };
    return icons[cat] || '✨';
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
        filtrados = filtrados.filter(p => p.categoria === currentFilter);
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

// ─── INIT & EVENT LISTENERS ───
document.addEventListener('DOMContentLoaded', () => {
    
    const grid = document.getElementById('productos-grid');
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Cargando productos...</p></div>';

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

    // Carrito toggles
    document.querySelector('.nav-carrito-btn').addEventListener('click', toggleCarrito);
    document.getElementById('carritoOverlay').addEventListener('click', toggleCarrito);
    document.querySelector('.carrito-close').addEventListener('click', toggleCarrito);

    // Category cards filter
    document.querySelectorAll('.categoria-card').forEach(card => {
        card.addEventListener('click', () => {
            filtrarCategoria(card.dataset.category);
        });
    });

    // Product grid actions
    document.getElementById('productos-grid').addEventListener('click', (e) => {
        const card = e.target.closest('.producto-card');
        if (!card) return;

        const id = card.dataset.id;
        const action = e.target.dataset.action;

        if (action === 'increase') cambiarCantidad(id, 1);
        if (action === 'decrease') cambiarCantidad(id, -1);
        if (action === 'add' || e.target.closest('.btn-agregar')) agregarAlCarrito(id);
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
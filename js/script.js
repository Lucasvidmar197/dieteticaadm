import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getCatalogCollections } from "./catalog-store.js";

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
let currentPage = 1;
const PRODUCTOS_POR_PAGINA = 6;

// ─── UTILIDADES ───
function normalizarTexto(texto) {
    if (!texto) return "";
    return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// ─── RENDER PRODUCTOS ───
function renderProductos(lista) {
    const grid = document.getElementById('productos-grid');
    const paginationContainer = document.getElementById('pagination-container');
    
    grid.innerHTML = '';
    
    if (lista.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #666; font-size: 1.1rem; padding: 40px;">No se encontraron productos.</p>';
        if (paginationContainer) paginationContainer.style.display = 'none';
        return;
    }

    if (paginationContainer) paginationContainer.style.display = 'flex';

    const totalPages = Math.ceil(lista.length / PRODUCTOS_POR_PAGINA);
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const inicio = (currentPage - 1) * PRODUCTOS_POR_PAGINA;
    const fin = inicio + PRODUCTOS_POR_PAGINA;
    const productosARenderizar = lista.slice(inicio, fin);
    
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

    grid.innerHTML = html;
    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const pageNumbersContainer = document.getElementById('page-numbers');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (!pageNumbersContainer || !prevBtn || !nextBtn) return;

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;

    let pages = [];
    const maxVisible = 10;

    if (totalPages <= maxVisible) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        // Lógica de paginación dinámica con saltos y puntos suspensivos
        if (currentPage <= 6) {
            // Caso 1: Cerca del principio (muestra 1 al 10)
            for (let i = 1; i <= 10; i++) pages.push(i);
            pages.push('...');
            pages.push(totalPages);
        } else if (currentPage > totalPages - 6) {
            // Caso 2: Cerca del final
            pages.push(1);
            pages.push('...');
            for (let i = totalPages - 9; i <= totalPages; i++) pages.push(i);
        } else {
            // Caso 3: En el medio (muestra ventana deslizante)
            pages.push(1);
            pages.push('...');
            // Mostrar del actual-2 al actual+2 (o lo que quepa para mantener consistencia)
            for (let i = currentPage - 4; i <= currentPage + 5; i++) {
                if (i > 1 && i < totalPages) pages.push(i);
            }
            pages.push('...');
            pages.push(totalPages);
        }
    }

    let html = '';
    pages.forEach(p => {
        if (p === '...') {
            html += `<span class="pagination-dots">...</span>`;
        } else {
            html += `<div class="page-num ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</div>`;
        }
    });
    pageNumbersContainer.innerHTML = html;

    // Listeners para números de página
    document.querySelectorAll('.page-num').forEach(el => {
        el.addEventListener('click', () => {
            currentPage = parseInt(el.dataset.page);
            renderProductos(productosFiltrados);
            window.scrollTo({ top: document.getElementById('promos').offsetTop - 100, behavior: 'smooth' });
        });
    });
}

// ─── FILTROS Y BÚSQUEDA ───
function generarFiltros() {
    const sidebarCatList = document.getElementById('sidebar-categorias');
    if (!sidebarCatList) return;
    
    let html = `<li><a href="javascript:void(0)" class="sidebar-cat-link ${currentFilter === 'todos' ? 'activo' : ''}" data-filter="todos">Todas</a></li>`;
    categoriasDB.forEach(cat => {
        html += `<li><a href="javascript:void(0)" class="sidebar-cat-link ${currentFilter === cat.nombre ? 'activo' : ''}" data-filter="${cat.nombre}">${cat.nombre}</a></li>`;
    });
    sidebarCatList.innerHTML = html;

    // Re-attach event listeners
    document.querySelectorAll('.sidebar-cat-link').forEach(link => {
        link.addEventListener('click', () => {
            filtrarProductos(link.dataset.filter, link);
        });
    });
}

function generarGridCategorias() {
    const grid = document.getElementById('categorias-dropdown');
    if (!grid) return;
    
    if (categoriasDB.length === 0) {
        grid.innerHTML = '<span style="padding: 10px 20px; color: #888; font-size: 0.9rem;">No hay categorías</span>';
        return;
    }

    grid.innerHTML = categoriasDB.map(cat => `
        <a href="#promos" class="dropdown-categoria" data-category="${cat.nombre}">
            ${cat.nombre}
        </a>
    `).join('');

    // Attach event listeners
    document.querySelectorAll('.dropdown-categoria').forEach(link => {
        link.addEventListener('click', (e) => {
            filtrarCategoria(link.dataset.category);
            
            // Cerrar el dropdown en mobile (opcional)
            const dropdown = document.getElementById('categorias-dropdown');
            if (dropdown) dropdown.style.display = 'none';
            setTimeout(() => {
                if (dropdown) dropdown.style.display = '';
            }, 500);
        });
    });
}

function filtrarProductos(cat, btn) {
    currentPage = 1; // Resetear a la primera página al filtrar
    if (btn) {
        document.querySelectorAll('.sidebar-cat-link').forEach(b => b.classList.remove('activo'));
        btn.classList.add('activo');
        currentFilter = cat;
    } else {
        currentFilter = cat || currentFilter;
        document.querySelectorAll('.sidebar-cat-link').forEach(b => {
            if (b.dataset.filter === currentFilter) b.classList.add('activo');
            else b.classList.remove('activo');
        });
    }

    productosFiltrados = productos;
    
    if (currentFilter !== 'todos') {
        productosFiltrados = productosFiltrados.filter(p => {
            const cats = p.categorias || (p.categoria ? [p.categoria] : []);
            return cats.includes(currentFilter);
        });
    }
    
    if (searchTerm) {
        const normalizedSearch = normalizarTexto(searchTerm);
        productosFiltrados = productosFiltrados.filter(p => {
            const normalizedName = normalizarTexto(p.nombre || '');
            return normalizedName.includes(normalizedSearch);
        });
    }

    // Apply price filter
    const precioDesde = parseFloat(document.getElementById('precio-desde')?.value) || 0;
    const precioHasta = parseFloat(document.getElementById('precio-hasta')?.value) || Infinity;
    
    if (precioDesde > 0 || precioHasta !== Infinity) {
        productosFiltrados = productosFiltrados.filter(p => {
            return p.precio >= precioDesde && p.precio <= precioHasta;
        });
    }
    
    renderProductos(productosFiltrados);
}

function filtrarCategoria(cat) {
    document.getElementById('promos').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
        const btnToActivate = document.querySelector(`.sidebar-cat-link[data-filter="${cat}"]`);
        if(btnToActivate) filtrarProductos(cat, btnToActivate);
        else filtrarProductos(cat, null);
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
    document.documentElement.style.overflow = 'hidden'; // Lock scroll on html
    document.body.style.overflow = 'hidden'; // Lock scroll on body

    // Initialize zoom
    initZoom('pdpImage', 'pdpZoomResult', 'pdpZoomLens');
}

function closeProductDetail() {
    const modal = document.getElementById('pdpModal');
    const overlay = document.getElementById('pdpOverlay');
    modal.classList.remove('active');
    overlay.classList.remove('active');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
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
function initFAQ() {
    const faqOverlay = document.getElementById('faqOverlay');
    const faqModal = document.getElementById('faqModal');
    const faqClose = document.querySelector('.faq-modal-close');
    const faqNavBtn = document.getElementById('btn-faq-nav');
    const faqFooterBtn = document.getElementById('btn-faq-footer');

    const toggleFAQ = () => {
        const isActive = faqModal.classList.contains('active');
        if (isActive) {
            faqModal.classList.remove('active');
            faqOverlay.style.display = 'none';
            document.body.style.overflow = '';
        } else {
            faqModal.classList.add('active');
            faqOverlay.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
    };

    if (faqNavBtn) faqNavBtn.addEventListener('click', toggleFAQ);
    if (faqFooterBtn) faqFooterBtn.addEventListener('click', toggleFAQ);
    if (faqClose) faqClose.addEventListener('click', toggleFAQ);
    if (faqOverlay) faqOverlay.addEventListener('click', toggleFAQ);

    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            faqItems.forEach(otherItem => {
                otherItem.classList.remove('active');
            });

            if (!isActive) {
                item.classList.add('active');
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    
    const grid = document.getElementById('productos-grid');
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Cargando productos...</p></div>';

    // Inicializar FAQ
    initFAQ();

    try {
        const { productsCollection, categoriesCollection } = await getCatalogCollections();

        // Fetch Categorias
        onSnapshot(categoriesCollection, (snapshot) => {
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
        onSnapshot(productsCollection, (snapshot) => {
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
    } catch (err) {
        console.error("Error al obtener las colecciones dinámicas:", err);
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: red;">Error de conexión con el catálogo.</p>';
    }

    // Buscador
    const buscador = document.getElementById('buscador');
    const buscadorHeader = document.getElementById('buscador-header');

    const handleSearch = (e) => {
        searchTerm = e.target.value;
        if (buscador && e.target !== buscador) buscador.value = searchTerm;
        if (buscadorHeader && e.target !== buscadorHeader) buscadorHeader.value = searchTerm;
        filtrarProductos(currentFilter, null);
        
        // Hacer scroll a la sección de productos si el usuario busca desde el header
        if (e.target === buscadorHeader && searchTerm.length > 0) {
            const promosSection = document.getElementById('promos');
            if (promosSection) promosSection.scrollIntoView({ behavior: 'smooth' });
        }
    };

    if(buscador) {
        buscador.addEventListener('input', handleSearch);
    }
    
    if(buscadorHeader) {
        buscadorHeader.addEventListener('input', handleSearch);
    }
    
    // Boton Cargar Más (Eliminado o Reemplazado por listeners de paginación)
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');

    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderProductos(productosFiltrados);
                window.scrollTo({ top: document.getElementById('promos').offsetTop - 100, behavior: 'smooth' });
            }
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(productosFiltrados.length / PRODUCTOS_POR_PAGINA);
            if (currentPage < totalPages) {
                currentPage++;
                renderProductos(productosFiltrados);
                window.scrollTo({ top: document.getElementById('promos').offsetTop - 100, behavior: 'smooth' });
            }
        });
    }

    // Filtrar por precio
    const btnFiltrarPrecio = document.getElementById('btn-filtrar-precio');
    if (btnFiltrarPrecio) {
        btnFiltrarPrecio.addEventListener('click', () => {
            filtrarProductos(currentFilter, null);
        });
    }

    const precioDesdeInput = document.getElementById('precio-desde');
    const precioHastaInput = document.getElementById('precio-hasta');
    
    if (precioDesdeInput) {
        precioDesdeInput.addEventListener('keyup', (e) => {
            if(e.key === 'Enter') filtrarProductos(currentFilter, null);
        });
    }
    if (precioHastaInput) {
        precioHastaInput.addEventListener('keyup', (e) => {
            if(e.key === 'Enter') filtrarProductos(currentFilter, null);
        });
    }

    // Carrito toggles
    document.querySelector('.nav-carrito-btn').addEventListener('click', toggleCarrito);
    document.getElementById('carritoOverlay').addEventListener('click', toggleCarrito);
    document.querySelector('.carrito-close').addEventListener('click', toggleCarrito);

    // Dropdown Mobile Fix
    const btnProductosDropdown = document.getElementById('btn-productos-dropdown');
    const dropdownMenu = document.getElementById('categorias-dropdown');
    
    if (btnProductosDropdown && dropdownMenu) {
        btnProductosDropdown.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                e.preventDefault(); // Evitar salto en móvil
                const isVisible = dropdownMenu.style.display === 'grid';
                dropdownMenu.style.display = isVisible ? 'none' : 'grid';
            }
        });
        
        // Cerrar al hacer clic afuera
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                if (!e.target.closest('.dropdown-container')) {
                    dropdownMenu.style.display = ''; // Restaurar a CSS (none por defecto)
                }
            }
        });
    }

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
            
            // Feedback visual abriendo el carrito (opcional pero muy útil en móvil)
            const panel = document.getElementById('carritoPanel');
            const overlay = document.getElementById('carritoOverlay');
            if (!panel.classList.contains('abierto')) {
                panel.classList.add('abierto');
                overlay.style.display = 'block';
            }
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
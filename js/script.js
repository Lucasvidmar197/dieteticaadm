import { db, onSnapshot } from "./firebase-config.js";
import { getCatalogCollections } from "./catalog-store.js";

// ─── ESTADO GLOBAL ───
let productos = [];
let categoriasDB = [];
let carrito = {};
let cantidades = {};
let currentFilter = 'todos';
let searchTerm = '';
let categoriasExpanded = false;
let productosFiltrados = [];
let productosMostrados = 0;
let currentPDPId = null;
let currentPDPVariantId = null; // Para saber qué variante está seleccionada
let currentPage = 1;
const PRODUCTOS_POR_PAGINA = 10;

// ─── UTILIDADES ───
function normalizarTexto(texto) {
    if (!texto) return "";
    return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function centrarSeccionProductos() {
    const promosSection = document.getElementById('promos');
    if (!promosSection) return;

    const headerSpacer = document.querySelector('.header-spacer');
    // La altura del header cambia en móvil. offsetHeight obtendrá la altura correcta actual.
    const headerHeight = headerSpacer ? headerSpacer.offsetHeight : 172; // Fallback a la altura de escritorio

    // Se calcula la posición superior de la sección relativa al documento
    const sectionTop = promosSection.getBoundingClientRect().top + window.scrollY;

    // Se calcula la posición de scroll objetivo: el tope de la sección menos la altura del header, con un poco de espacio.
    const targetScrollY = sectionTop - headerHeight - 20; // 20px de espacio extra

    window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
}

function ejecutarBusqueda(termino) {
    searchTerm = termino.trim();
    
    // Sincronizar los campos de búsqueda
    const buscador = document.getElementById('buscador');
    const buscadorHeader = document.getElementById('buscador-header');
    if (buscador) buscador.value = searchTerm;
    if (buscadorHeader) buscadorHeader.value = searchTerm;

    categoriasExpanded = false;
    filtrarProductos('todos');
    
    // Hacer scroll a la sección de productos si hay un término de búsqueda
    if (searchTerm.length > 0) {
        setTimeout(() => {
            centrarSeccionProductos();
        }, 100); 
    }
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
        const tieneVariantes = p.variantes && p.variantes.length > 1;
        // Revisar si ALGUNA variante de este producto está en el carrito
        const enCarrito = tieneVariantes 
            ? Object.values(carrito).some(item => item.baseId === p.id)
            : carrito[p.id];
            
        if (!cantidades[p.id]) cantidades[p.id] = 1;

        const finalImageUrl = (p.imagenUrl && p.imagenUrl !== "img/product-placeholder.svg") 
            ? p.imagenUrl 
            : 'https://via.placeholder.com/300x200?text=Sin+Imagen';

        const precioText = tieneVariantes ? `Desde $${p.precio.toLocaleString('es-AR')}` : `$${p.precio.toLocaleString('es-AR')}`;

        html += `
        <div class="producto-card" data-id="${p.id}" data-cat="${p.categoria}">
            <div class="producto-img" style="padding: 0;">
                <img src="${finalImageUrl}" alt="${p.nombre}" loading="lazy" style="width:100%; height:100%; object-fit:contain; border-radius: 12px 12px 0 0;">
                ${p.promo ? '<span class="badge-promo">🔥 Promo</span>' : ''}
            </div>
            <div class="producto-body">
                <div class="producto-nombre">${p.nombre}</div>
                <div class="producto-desc">${p.desc || ''}</div>
                <div class="producto-precio-row">
                    <span class="precio-actual">${precioText}</span>
                    ${p.precioAntes ? `<span class="precio-tachado">$${p.precioAntes.toLocaleString('es-AR')}</span>` : ''}
                </div>
                <div class="cantidad-control" style="${tieneVariantes ? 'visibility: hidden;' : ''}">
                    <button class="cantidad-btn" data-action="decrease">−</button>
                    <span class="cantidad-num" id="qty-${p.id}">${cantidades[p.id]}</span>
                    <button class="cantidad-btn" data-action="increase">+</button>
                </div>
                <button class="btn-agregar ${enCarrito && !tieneVariantes ? 'agregado' : ''}" data-action="${tieneVariantes ? 'view' : 'add'}">
                    <i class="fas ${enCarrito && !tieneVariantes ? 'fa-check' : (tieneVariantes ? 'fa-eye' : 'fa-cart-plus')}"></i>
                    ${tieneVariantes ? 'Ver opciones' : (enCarrito ? '¡Agregado!' : 'Agregar al carrito')}
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
            centrarSeccionProductos();
        });
    });
}

// ─── FILTROS Y BÚSQUEDA ───
function generarFiltros(categoriasAMostrar = categoriasDB) {
    const sidebarCatList = document.getElementById('sidebar-categorias');
    if (!sidebarCatList) return;

    // Sort categories alphabetically, but put Keto and Proteicos first
    categoriasAMostrar.sort((a, b) => {
        const priority = { "Keto": 1, "Proteicos": 2 };
        const pA = priority[a.nombre] || 99;
        const pB = priority[b.nombre] || 99;
        if (pA !== pB) return pA - pB;
        return a.nombre.localeCompare(b.nombre);
    });

    let htmlItems = [];
    let todasIndex = 0; // Default to first

    const shouldCollapse = categoriasAMostrar.length > 10 && !categoriasExpanded;
    const listToRender = shouldCollapse ? categoriasAMostrar.slice(0, 10) : categoriasAMostrar;

    listToRender.forEach(cat => {
        let nameHtml = cat.nombre;
        if (cat.nombre.toLowerCase() === 'keto') {
            nameHtml = '<b>KETO</b>';
            todasIndex = Math.max(todasIndex, htmlItems.length + 1);
        } else if (cat.nombre.toLowerCase() === 'proteicos') {
            nameHtml = '<b>PROTEICOS</b>';
            todasIndex = Math.max(todasIndex, htmlItems.length + 1);
        }
        htmlItems.push(`<li><a href="javascript:void(0)" class="sidebar-cat-link" data-filter="${cat.nombre}">${nameHtml}</a></li>`);
    });

    htmlItems.splice(todasIndex, 0, `<li><a href="javascript:void(0)" class="sidebar-cat-link" data-filter="todos">Todas</a></li>`);
    let html = htmlItems.join('');

    sidebarCatList.innerHTML = html;

    if (shouldCollapse) {
        const verTodosLi = document.createElement('li');
        verTodosLi.innerHTML = `<a href="javascript:void(0)" class="sidebar-cat-link-toggle">Ver todas (${categoriasAMostrar.length})</a>`;
        sidebarCatList.appendChild(verTodosLi);
    } else if (categoriasAMostrar.length > 10) {
        const verMenosLi = document.createElement('li');
        verMenosLi.innerHTML = `<a href="javascript:void(0)" class="sidebar-cat-link-toggle">Ver menos</a>`;
        sidebarCatList.appendChild(verMenosLi);
    } else {
        document.querySelectorAll('.sidebar-cat-link').forEach(b => {
            if (normalizarTexto(b.dataset.filter) === normalizarTexto(currentFilter)) b.classList.add('activo');
            else b.classList.remove('activo');
        });
    }
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

function filtrarProductos(cat) {
    currentPage = 1;
    currentFilter = cat;

    // Actualizar título de la categoría seleccionada
    const tituloElement = document.getElementById('categoria-titulo');
    if (tituloElement) {
        if (cat === 'todos') {
            tituloElement.textContent = "Todos los productos";
        } else {
            const categoriaInfo = (categoriasDB || []).find(c => c.nombre.toLowerCase() === cat.toLowerCase());
            if (categoriaInfo) {
                tituloElement.textContent = `${categoriaInfo.icono} ${categoriaInfo.nombre}`;
            } else {
                tituloElement.textContent = cat;
            }
        }
    }

    // 1. Filter products by search, price, and active status
    let productosPotenciales = productos.filter(p => p.activo !== false);
    if (searchTerm) {
        const normalizedSearch = normalizarTexto(searchTerm);
        productosPotenciales = productosPotenciales.filter(p => normalizarTexto(p.nombre || '').includes(normalizedSearch));
    }
    const precioDesde = parseFloat(document.getElementById('precio-desde')?.value) || 0;
    const precioHasta = parseFloat(document.getElementById('precio-hasta')?.value) || Infinity;
    if (precioDesde > 0 || precioHasta !== Infinity) {
        productosPotenciales = productosPotenciales.filter(p => p.precio >= precioDesde && p.precio <= precioHasta);
    }

    // 2. Determine categories for sidebar
    let categoriasParaSidebar;
    if (searchTerm) {
        const categoriasDeResultados = new Set();
        productosPotenciales.forEach(p => {
            const cats = p.categorias || (p.categoria ? [p.categoria] : []);
            cats.forEach(c => categoriasDeResultados.add(c));
        });
        categoriasParaSidebar = Array.from(categoriasDeResultados).map(nombreCat => {
            return categoriasDB.find(c => c.nombre === nombreCat) || { nombre: nombreCat };
        }).filter(Boolean);
    } else {
        categoriasParaSidebar = categoriasDB;
    }
    
    // 3. Render sidebar
    generarFiltros(categoriasParaSidebar);

    // 4. Apply category filter
    productosFiltrados = productosPotenciales;
    if (currentFilter !== 'todos') {
        const normalizedFilter = normalizarTexto(currentFilter);
        productosFiltrados = productosFiltrados.filter(p => {
            const cats = p.categorias || (p.categoria ? [p.categoria] : []);
            return cats.some(c => normalizarTexto(c) === normalizedFilter);
        });
    }

    // 5. Render products
    renderProductos(productosFiltrados);
    
    // 6. Update active button in sidebar
    document.querySelectorAll('.sidebar-cat-link').forEach(b => {
        b.classList.remove('activo');
        if (normalizarTexto(b.dataset.filter) === normalizarTexto(currentFilter)) {
            b.classList.add('activo');
        }
    });
}

function filtrarCategoria(cat) {
    searchTerm = ''; // Clear search
    document.getElementById('buscador-header').value = ''; // Clear search input
    categoriasExpanded = false; // Reset expansion
    centrarSeccionProductos();
    setTimeout(() => {
        filtrarProductos(cat);
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
function agregarAlCarrito(id, variantId = null) {
    const p = productos.find(x => x.id === id);
    if (!p) return;

    let cartId = id;
    let finalProduct = { ...p };

    if (variantId) {
        cartId = `${id}-${variantId}`;
        const variante = p.variantes.find(v => v.id === variantId);
        if (variante) {
            finalProduct.precio = variante.precio;
            finalProduct.nombre = `${p.nombre} (${variante.nombre})`;
            finalProduct.baseId = id;
        }
    }

    const qty = cantidades[id] || 1;
    if (carrito[cartId]) {
        carrito[cartId].cantidad += qty;
    } else {
        carrito[cartId] = { ...finalProduct, cantidad: qty, cartId };
    }
    
    renderCarrito();
    
    // Si estamos agregando desde la grid y no tiene variantes
    if (!variantId) {
        const card = document.querySelector(`.producto-card[data-id="${id}"]`);
        const btn = card ? card.querySelector('.btn-agregar') : null;
        if (btn && !btn.dataset.action.includes('view')) {
            btn.classList.add('agregado');
            btn.innerHTML = '<i class="fas fa-check"></i> ¡Agregado!';
        }
    }
    
    showToast(`✅ ${finalProduct.nombre} agregado`);
    actualizarBadge();
}

function quitarDelCarrito(cartId) {
    const item = carrito[cartId];
    if (!item) return;
    
    const baseId = item.baseId || cartId;
    delete carrito[cartId];
    renderCarrito();
    
    // Restaurar botón de la grid si ya no queda ninguna variante de este producto en el carrito
    const todaviaEnCarrito = Object.values(carrito).some(x => x.baseId === baseId || x.id === baseId);
    if (!todaviaEnCarrito) {
        const card = document.querySelector(`.producto-card[data-id="${baseId}"]`);
        const btn = card ? card.querySelector('.btn-agregar') : null;
        if (btn && !btn.dataset.action.includes('view')) {
            btn.classList.remove('agregado');
            btn.innerHTML = '<i class="fas fa-cart-plus"></i> Agregar al carrito';
        }
    }
    
    actualizarBadge();
}

function renderCarrito() {
    const items = Object.values(carrito);
    const container = document.getElementById('carritoItems');
    const shippingInfoContainer = document.getElementById('shipping-info');

    if (items.length === 0) {
        container.innerHTML = `
            <div class="carrito-vacio" id="carritoVacio">
                <i class="fas fa-shopping-basket"></i>
                <p>Tu carrito está vacío</p>
            </div>`;
    } else {
        container.innerHTML = items.map(item => `
            <div class="carrito-item" data-cart-id="${item.cartId || item.id}">
                <img src="${item.imagenUrl || 'https://via.placeholder.com/40'}" alt="${item.nombre}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">
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

    // Lógica del mensaje de envío
    const freeShippingThreshold = 40000;
    if (shippingInfoContainer) {
        if (items.length > 0) {
            shippingInfoContainer.style.display = 'block';
            if (total >= freeShippingThreshold) {
                shippingInfoContainer.innerHTML = `🎉 ¡Tenés <strong>envíos a todo el país</strong>!`;
                shippingInfoContainer.classList.add('gratis');
            } else {
                const faltante = freeShippingThreshold - total;
                shippingInfoContainer.innerHTML = `Te faltan <strong>$${faltante.toLocaleString('es-AR')}</strong> para el envío gratis.`;
                shippingInfoContainer.classList.remove('gratis');
            }
        } else {
            shippingInfoContainer.style.display = 'none';
        }
    }

    document.getElementById('carritoTotal').textContent = `$${total.toLocaleString('es-AR')}`;
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
    const finalImageUrl = (p.imagenUrl && p.imagenUrl !== "img/product-placeholder.svg") 
        ? p.imagenUrl 
        : 'https://via.placeholder.com/300x200?text=Sin+Imagen';
    document.getElementById('pdpImage').src = finalImageUrl;
    
    let catsToRender = p.categorias || (p.categoria ? [p.categoria] : ['Varios']);
    document.getElementById('pdpCategoria').textContent = catsToRender.join(', ');
    
    document.getElementById('pdpNombre').textContent = p.nombre;
    document.getElementById('pdpDesc').textContent = p.desc || 'Sin descripción disponible.';

    const variantesContainer = document.getElementById('pdpVariantesContainer');
    const variantesSelect = document.getElementById('pdpVariantesSelect');
    
    if (p.variantes && p.variantes.length > 1) {
        variantesContainer.style.display = 'block';
        variantesSelect.innerHTML = p.variantes.map(v => 
            `<option value="${v.id}" data-precio="${v.precio}" data-img="${v.imagenUrl || ''}" data-desc="${v.desc || ''}">${v.nombre} - $${v.precio.toLocaleString('es-AR')}</option>`
        ).join('');
        
        // Seleccionar el primero por defecto
        currentPDPVariantId = p.variantes[0].id;
        document.getElementById('pdpPrecio').textContent = `$${p.variantes[0].precio.toLocaleString('es-AR')}`;
        
        // Cargar imagen de la variante por defecto si tiene
        if (p.variantes[0].imagenUrl) {
            document.getElementById('pdpImage').src = p.variantes[0].imagenUrl;
        }
        if (p.variantes[0].desc) {
            document.getElementById('pdpDesc').textContent = p.variantes[0].desc;
        }
        
        // Listener para cambiar precio, imagen y desc
        variantesSelect.onchange = (e) => {
            currentPDPVariantId = e.target.value;
            const selectedOption = e.target.options[e.target.selectedIndex];
            const newPrice = parseFloat(selectedOption.dataset.precio);
            document.getElementById('pdpPrecio').textContent = `$${newPrice.toLocaleString('es-AR')}`;
            
            if (selectedOption.dataset.img) {
                document.getElementById('pdpImage').src = selectedOption.dataset.img;
                initZoom('pdpImage', 'pdpZoomResult', 'pdpZoomLens');
            } else {
                document.getElementById('pdpImage').src = finalImageUrl;
            }
            
            if (selectedOption.dataset.desc) {
                document.getElementById('pdpDesc').textContent = selectedOption.dataset.desc;
            } else {
                document.getElementById('pdpDesc').textContent = p.desc || 'Sin descripción disponible.';
            }
            
            updatePDPButtonState(p.id, currentPDPVariantId);
        };
    } else {
        variantesContainer.style.display = 'none';
        currentPDPVariantId = p.variantes && p.variantes.length === 1 ? p.variantes[0].id : null;
        document.getElementById('pdpPrecio').textContent = `$${p.precio.toLocaleString('es-AR')}`;
    }

    document.getElementById('pdpPrecioAntes').textContent = p.precioAntes ? `$${p.precioAntes.toLocaleString('es-AR')}` : '';
    
    // Quantity
    if (!cantidades[id]) cantidades[id] = 1;
    document.getElementById('pdpQty').textContent = cantidades[id];

    // Button state
    updatePDPButtonState(id, currentPDPVariantId);

    // Show modal
    modal.classList.add('active');
    overlay.classList.add('active');
    document.documentElement.style.overflow = 'hidden'; // Lock scroll on html
    document.body.style.overflow = 'hidden'; // Lock scroll on body

    // Initialize zoom
    initZoom('pdpImage', 'pdpZoomResult', 'pdpZoomLens');
}

function updatePDPButtonState(baseId, variantId) {
    const btn = document.getElementById('pdpAddBtn');
    const cartId = variantId ? `${baseId}-${variantId}` : baseId;
    const enCarrito = carrito[cartId];
    
    if (enCarrito) {
        btn.classList.add('agregado');
        btn.innerHTML = '<i class="fas fa-check"></i> ¡Agregado!';
    } else {
        btn.classList.remove('agregado');
        btn.innerHTML = '<i class="fas fa-cart-plus"></i> Agregar al carrito';
    }
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

    if (!img || !result || !lens) return;

    const container = img.parentElement;

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
    const faqClose = document.querySelector('#faqModal .faq-modal-close');
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

function initMapaEnvios() {
    const mapaOverlay = document.getElementById('mapaEnviosOverlay');
    const mapaModal = document.getElementById('mapaEnviosModal');
    const mapaClose = document.getElementById('mapaEnviosClose');

    if (!mapaOverlay || !mapaModal) return;

    const toggleMapa = () => {
        const isActive = mapaModal.classList.contains('active');
        if (isActive) {
            mapaModal.classList.remove('active');
            mapaOverlay.style.display = 'none';
            document.body.style.overflow = '';
        } else {
            mapaModal.classList.add('active');
            mapaOverlay.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
    };

    document.querySelectorAll('.trigger-mapa-envios').forEach(btn => {
        btn.addEventListener('click', toggleMapa);
    });
    
    if (mapaClose) mapaClose.addEventListener('click', toggleMapa);
    mapaOverlay.addEventListener('click', toggleMapa);
}

document.addEventListener('DOMContentLoaded', async () => {
    
    const grid = document.getElementById('productos-grid');
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Cargando productos...</p></div>';

    // Inicializar FAQ y Mapas
    initFAQ();
    initMapaEnvios();

    try {
        const { productsCollection, categoriesCollection } = await getCatalogCollections();

        // Fetch Categorias
        onSnapshot(categoriesCollection, (snapshot) => {
            categoriasDB = [];
            snapshot.forEach((doc) => {
                categoriasDB.push({ id: doc.id, ...doc.data() });
            });
            generarGridCategorias();
            // Si los productos ya cargaron, re-renderizamos para que se vean los filtros
            if (productos.length > 0) {
                filtrarProductos(currentFilter);
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
            
            filtrarProductos(currentFilter);
        }, (error) => {
            console.error("Error obteniendo productos: ", error);
            grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: red;">Error al cargar los productos.</p>';
        });
    } catch (err) {
        console.error("Error al obtener las colecciones dinámicas:", err);
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: red;">Error de conexión con el catálogo.</p>';
    }

    // ─── LÓGICA DE BÚSQUEDA ───
    const buscadorHeader = document.getElementById('buscador-header');
    const searchButton = buscadorHeader.parentElement.querySelector('button');
    const buscadorBody = document.getElementById('buscador');

    if (buscadorHeader) {
        buscadorHeader.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                ejecutarBusqueda(e.target.value);
            }
        });
    }

    if (searchButton) {
        searchButton.addEventListener('click', () => {
            ejecutarBusqueda(buscadorHeader.value);
        });
    }

    if (buscadorBody) {
        buscadorBody.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                ejecutarBusqueda(e.target.value);
            }
        });
    }

    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');

    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderProductos(productosFiltrados);
                centrarSeccionProductos();
            }
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(productosFiltrados.length / PRODUCTOS_POR_PAGINA);
            if (currentPage < totalPages) {
                currentPage++;
                renderProductos(productosFiltrados);
                centrarSeccionProductos();
            }
        });
    }

    // Filtrar por precio
    const btnFiltrarPrecio = document.getElementById('btn-filtrar-precio');
    if (btnFiltrarPrecio) {
        btnFiltrarPrecio.addEventListener('click', () => {
            filtrarProductos(currentFilter);
        });
    }

    const precioDesdeInput = document.getElementById('precio-desde');
    const precioHastaInput = document.getElementById('precio-hasta');
    
    if (precioDesdeInput) {
        precioDesdeInput.addEventListener('keyup', (e) => {
            if(e.key === 'Enter') filtrarProductos(currentFilter);
        });
    }
    if (precioHastaInput) {
        precioHastaInput.addEventListener('keyup', (e) => {
            if(e.key === 'Enter') filtrarProductos(currentFilter);
        });
    }

    // Delegated listener for header categories
    document.querySelectorAll('.header-cat-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const cat = e.target.dataset.category;
            filtrarCategoria(cat);
        });
    });

    // Delegated listener for sidebar categories
    const sidebarCatList = document.getElementById('sidebar-categorias');
    if (sidebarCatList) {
        sidebarCatList.addEventListener('click', (e) => {
            const link = e.target.closest('.sidebar-cat-link[data-filter]');
            if (link) {
                e.preventDefault();
                categoriasExpanded = false;
                filtrarProductos(link.dataset.filter);
                return;
            }
            const toggleLink = e.target.closest('.sidebar-cat-link-toggle');
            if (toggleLink) {
                e.preventDefault();
                categoriasExpanded = !categoriasExpanded;
                filtrarProductos(currentFilter);
            }
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
            agregarAlCarrito(currentPDPId, currentPDPVariantId);
            
            // Si acabamos de agregar y hay variantes, recargamos estado del botón
            updatePDPButtonState(currentPDPId, currentPDPVariantId);
            
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
            const id = removeBtn.closest('.carrito-item').dataset.cartId;
            quitarDelCarrito(id);
        }
    });

    // Buy button
    document.querySelector('.btn-comprar-todo').addEventListener('click', comprarPorWhatsapp);
});
import { 
    db, 
    auth, 
    collection, 
    doc, 
    addDoc, 
    onSnapshot, 
    deleteDoc, 
    updateDoc, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "./firebase-config.js";
import { getCatalogCollections } from "./catalog-store.js";

// DOM Elements - Admin Panel
const form = document.getElementById('productForm');
const btnText = document.getElementById('btnText');
const spinner = document.getElementById('spinner');
const tableBody = document.getElementById('productosTableBody');
const tableLoader = document.getElementById('tableLoader');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const prevEditBtn = document.getElementById('prevEditBtn');
const nextEditBtn = document.getElementById('nextEditBtn');
const autoEditToggle = document.getElementById('autoEditToggle');
const btnAddVariant = document.getElementById('btnAddVariant');
const variantesList = document.getElementById('variantesList');

// DOM Elements - Login
const loginOverlay = document.getElementById('loginOverlay');
const mainAdminPanel = document.getElementById('mainAdminPanel');
const adminNav = document.getElementById('adminNav');
const loginForm = document.getElementById('loginForm');
const loginBtnText = document.getElementById('loginBtnText');
const loginSpinner = document.getElementById('loginSpinner');
const logoutBtn = document.getElementById('logoutBtn');

// Variables de estado
let localProductos = {};
let editMode = false;
let currentEditId = null;
let currentVariantes = [];

// ─── LÓGICA DE VARIANTES ───
function renderVariantes() {
    if (!variantesList) return;
    
    variantesList.innerHTML = '';
    
    if (currentVariantes.length === 0) {
        variantesList.innerHTML = '<div style="text-align: center; color: #a0aec0; padding: 10px;">Sin opciones. El producto se venderá con el precio base.</div>';
        return;
    }
    
    currentVariantes.forEach((v, index) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.alignItems = 'center';
        
        row.innerHTML = `
            <input type="text" class="var-nombre" placeholder="Nombre (Ej: 1 kg)" value="${v.nombre}" style="flex: 2; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;">
            <input type="number" class="var-precio" placeholder="Precio ($)" value="${v.precio}" style="flex: 1; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;" min="0">
            <button type="button" class="btn-icon delete" onclick="eliminarVariante(${index})" style="background: #fed7d7; padding: 8px 12px; border-radius: 6px; border: none; cursor: pointer;">
                <i class="fas fa-trash" style="color: #e53e3e;"></i>
            </button>
        `;
        variantesList.appendChild(row);
    });
}

if (btnAddVariant) {
    btnAddVariant.addEventListener('click', () => {
        currentVariantes.push({ id: crypto.randomUUID().slice(0, 8), nombre: '', precio: '' });
        renderVariantes();
    });
}

window.eliminarVariante = (index) => {
    currentVariantes.splice(index, 1);
    renderVariantes();
};

function getVariantesForm() {
    const nombres = document.querySelectorAll('.var-nombre');
    const precios = document.querySelectorAll('.var-precio');
    const variantes = [];
    
    for (let i = 0; i < nombres.length; i++) {
        const n = nombres[i].value.trim();
        const p = parseFloat(precios[i].value);
        if (n && !isNaN(p)) {
            variantes.push({
                id: currentVariantes[i]?.id || crypto.randomUUID().slice(0, 8),
                nombre: n,
                precio: p
            });
        }
    }
    return variantes;
}

// ─── UTILIDADES ───
function normalizarTexto(texto) {
    if (!texto) return "";
    return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Variables de Categorías
const catForm = document.getElementById('categoriaForm');
const catBtnText = document.getElementById('catBtnText');
const catSpinner = document.getElementById('catSpinner');
const catTableBody = document.getElementById('categoriasTableBody');
const catTableLoader = document.getElementById('catTableLoader');
const catCancelEditBtn = document.getElementById('catCancelEditBtn');
const searchCatInput = document.getElementById('searchCategoria');

let localCategorias = {};
let catEditMode = false;
let currentCatEditId = null;

// ─── FILTRADO DE CATEGORÍAS EN FORMULARIO ───
if (searchCatInput) {
    searchCatInput.addEventListener('input', (e) => {
        const term = normalizarTexto(e.target.value);
        const labels = document.querySelectorAll('#categoriasContainer label');
        labels.forEach(label => {
            const text = normalizarTexto(label.textContent);
            if (text.includes(term)) {
                label.style.display = 'flex';
            } else {
                label.style.display = 'none';
            }
        });
    });
}

// Paginación de Productos en Admin
let adminProductos = [];
let adminCurrentPage = 1;
const ADMIN_PRODUCTOS_POR_PAGINA = 50;
let adminSearchTerm = '';

// Toast Helper
window.showToast = function(msg, type = "success") {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}

// ─── AUTHENTICATION ───
onAuthStateChanged(auth, async (user) => {
    if (user) {
        loginOverlay.style.display = 'none';
        mainAdminPanel.style.display = 'grid';
        adminNav.style.display = 'flex';
        try {
            const collections = await getCatalogCollections();
            window.activeCollections = collections;
            cargarCategorias(collections.categoriesCollection);
            cargarProductos(collections.productsCollection);
        } catch (error) {
            console.error("Error al obtener colecciones del catálogo:", error);
            showToast("Error de conexión con el catálogo", "error");
        }
    } else {
        loginOverlay.style.display = 'flex';
        mainAdminPanel.style.display = 'none';
        adminNav.style.display = 'none';
    }
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;

    loginBtnText.textContent = "Ingresando...";
    loginSpinner.classList.remove('d-none');
    loginForm.querySelector('button').disabled = true;

    signInWithEmailAndPassword(auth, email, password)
        .then(() => {
            showToast("Login exitoso", "success");
        })
        .catch((error) => {
            showToast("Error: Correo o contraseña incorrectos", "error");
            console.error(error);
        })
        .finally(() => {
            loginBtnText.textContent = "Ingresar";
            loginSpinner.classList.add('d-none');
            loginForm.querySelector('button').disabled = false;
        });
});

logoutBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
        showToast("Sesión cerrada", "success");
    });
});

// ─── CARGAR / EDITAR PRODUCTO ───
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nombre = document.getElementById('nombre').value;
    const precio = parseFloat(document.getElementById('precio').value);
    
    // Obtener categorías seleccionadas
    const checkboxElements = document.querySelectorAll('input[name="productoCategorias"]:checked');
    const categorias = Array.from(checkboxElements).map(cb => cb.value);
    
    // Si no hay categorías, podemos asignar "Varios" o mostrar error
    // El usuario pidió "no obligatorio", así que permitimos 0 categorías (o 1, o varias).
    const categoriaPrincipal = categorias.length > 0 ? categorias[0] : "";

    const descripcion = document.getElementById('descripcion').value;
    const imagenUrl = document.getElementById('imagenUrlInput').value;
    const variantes = getVariantesForm();

    // UI Loading state
    btnText.textContent = editMode ? "Actualizando..." : "Guardando...";
    spinner.classList.remove('d-none');
    form.querySelector('button[type="submit"]').disabled = true;
    cancelEditBtn.disabled = true;

    try {
        const prodCol = window.activeCollections?.productsCollection || collection(db, "productos");
        const prodRef = window.activeCollections?.config 
            ? doc(db, window.activeCollections.config.productCollectionPath, currentEditId)
            : doc(db, "productos", currentEditId);

        if (editMode) {
            // ─── ACTUALIZAR FIRESTORE ───
            await updateDoc(prodRef, {
                nombre,
                precio,
                categoria: categoriaPrincipal, // Mantenemos para compatibilidad
                categorias: categorias, // Nuevo array de categorías
                desc: descripcion,
                imagenUrl,
                variantes
            });
            showToast("Producto actualizado", "success");
            
            // Modo Edición Continua
            if (autoEditToggle && autoEditToggle.checked) {
                const currentIndex = adminProductos.findIndex(p => p.id === currentEditId);
                if (currentIndex >= 0 && currentIndex < adminProductos.length - 1) {
                    // Cargar el siguiente producto automáticamente
                    prepararEdicion(adminProductos[currentIndex + 1].id);
                } else {
                    showToast("No hay más productos en la lista.", "info");
                    cancelEditBtn.click(); // Reset form si ya no hay más
                }
            } else {
                cancelEditBtn.click(); // Reset form normal
            }
        } else {
            // ─── CREAR EN FIRESTORE ───
            await addDoc(prodCol, {
                nombre,
                precio,
                categoria: categoriaPrincipal, // Mantenemos para compatibilidad
                categorias: categorias, // Nuevo array de categorías
                desc: descripcion,
                imagenUrl,
                variantes,
                createdAt: new Date()
            });
            showToast("Producto cargado exitosamente", "success");
            form.reset();
            currentVariantes = [];
            renderVariantes();
            // Resetear checkboxes manual
            document.querySelectorAll('input[name="productoCategorias"]').forEach(cb => cb.checked = false);
        }

    } catch (error) {
        console.error("Error guardando producto: ", error);
        showToast("Error al guardar: " + error.message, "error");
    } finally {
        // Reset UI
        btnText.textContent = editMode ? "Actualizar Producto" : "Guardar Producto";
        spinner.classList.add('d-none');
        form.querySelector('button[type="submit"]').disabled = false;
        cancelEditBtn.disabled = false;
    }
});

// ─── LÓGICA DE CANCELAR EDICIÓN ───
cancelEditBtn.addEventListener('click', () => {
    editMode = false;
    currentEditId = null;
    currentVariantes = [];
    renderVariantes();
    form.reset();
    document.querySelectorAll('input[name="productoCategorias"]').forEach(cb => cb.checked = false);
    
    document.getElementById('btnText').textContent = "Guardar Producto";
    cancelEditBtn.classList.add('d-none');
    if (prevEditBtn) prevEditBtn.classList.add('d-none');
    if (nextEditBtn) nextEditBtn.classList.add('d-none');
});

// Navegación de Edición Manual (Anterior/Siguiente)
if (prevEditBtn) {
    prevEditBtn.addEventListener('click', () => {
        if (!currentEditId) return;
        const currentIndex = adminProductos.findIndex(p => p.id === currentEditId);
        if (currentIndex > 0) {
            prepararEdicion(adminProductos[currentIndex - 1].id);
        }
    });
}

if (nextEditBtn) {
    nextEditBtn.addEventListener('click', () => {
        if (!currentEditId) return;
        const currentIndex = adminProductos.findIndex(p => p.id === currentEditId);
        if (currentIndex < adminProductos.length - 1) {
            prepararEdicion(adminProductos[currentIndex + 1].id);
        }
    });
}

// ─── LÓGICA DE SUBIDA DE IMÁGENES ───
const imageDropZone = document.getElementById('imageDropZone');
const imageFileInput = document.getElementById('imageFileInput');
const imagenUrlInput = document.getElementById('imagenUrlInput');
const uploadProgress = document.getElementById('uploadProgress');

// Usamos ImgBB que es el estándar para keys de 32 caracteres (Postimages no tiene API pública con CORS)
const IMAGE_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;
const IMAGE_API_URL = "https://api.imgbb.com/1/upload";

if (imageDropZone) {
    imageDropZone.addEventListener('click', () => {
        imageFileInput.click();
    });

    // Drag and Drop events
    imageDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        imageDropZone.style.borderColor = '#3182ce';
        imageDropZone.style.backgroundColor = '#ebf8ff';
    });

    imageDropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        imageDropZone.style.borderColor = '#cbd5e0';
        imageDropZone.style.backgroundColor = '#f8fafc';
    });

    imageDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        imageDropZone.style.borderColor = '#cbd5e0';
        imageDropZone.style.backgroundColor = '#f8fafc';
        
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            uploadImage(file);
        }
    });

    imageFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            uploadImage(file);
        }
    });
}

async function uploadImage(file) {
    if (!file.type.startsWith('image/')) {
        showToast("Por favor, seleccioná un archivo de imagen válido.", "error");
        return;
    }

    uploadProgress.classList.remove('d-none');
    imageDropZone.style.opacity = '0.5';
    imageDropZone.style.pointerEvents = 'none';

    const formData = new FormData();
    formData.append('key', IMAGE_API_KEY);
    formData.append('image', file);

    try {
        const response = await fetch(IMAGE_API_URL, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            imagenUrlInput.value = data.data.url;
            showToast("Imagen subida exitosamente", "success");
        } else {
            console.error("Error API:", data);
            showToast("Error de API. Verificá que la Key sea de ImgBB.", "error");
        }
    } catch (error) {
        console.error("Error de red:", error);
        showToast("Error de conexión al subir la imagen.", "error");
    } finally {
        uploadProgress.classList.add('d-none');
        imageDropZone.style.opacity = '1';
        imageDropZone.style.pointerEvents = 'auto';
        imageFileInput.value = '';
    }
}

// ─── PREPARAR EDICIÓN ───
window.prepararEdicion = (id) => {
    const prod = localProductos[id];
    if (!prod) return;

    editMode = true;
    currentEditId = id;

    // Poblar form
    document.getElementById('nombre').value = prod.nombre;
    document.getElementById('precio').value = prod.precio;
    
    // Checkboxes de categoría
    const catsToSelect = prod.categorias || (prod.categoria ? [prod.categoria] : []);
    document.querySelectorAll('input[name="productoCategorias"]').forEach(cb => {
        cb.checked = catsToSelect.includes(cb.value);
    });

    document.getElementById('descripcion').value = prod.desc;
    document.getElementById('imagenUrlInput').value = prod.imagenUrl;
    
    // Variantes
    currentVariantes = prod.variantes ? JSON.parse(JSON.stringify(prod.variantes)) : [];
    renderVariantes();
    
    // UI
    document.getElementById('btnText').textContent = "Actualizar Producto";
    cancelEditBtn.classList.remove('d-none');
    
    // Mostrar y configurar botones de Anterior/Siguiente
    if (prevEditBtn && nextEditBtn) {
        prevEditBtn.classList.remove('d-none');
        nextEditBtn.classList.remove('d-none');
        
        // Comprobar índice para deshabilitar si está en los extremos
        const currentIndex = adminProductos.findIndex(p => p.id === id);
        prevEditBtn.disabled = currentIndex <= 0;
        nextEditBtn.disabled = currentIndex >= adminProductos.length - 1;
        
        // Estilos para indicar botón deshabilitado
        prevEditBtn.style.opacity = prevEditBtn.disabled ? '0.5' : '1';
        prevEditBtn.style.cursor = prevEditBtn.disabled ? 'not-allowed' : 'pointer';
        
        nextEditBtn.style.opacity = nextEditBtn.disabled ? '0.5' : '1';
        nextEditBtn.style.cursor = nextEditBtn.disabled ? 'not-allowed' : 'pointer';
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ─── LEER PRODUCTOS (Tiempo Real) ───
function cargarProductos(productsCollection) {
    onSnapshot(productsCollection || collection(db, "productos"), (snapshot) => {
        tableLoader.style.display = "none";
        localProductos = {};
        adminProductos = [];

        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center">No hay productos cargados.</td></tr>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const prod = docSnap.data();
            const id = docSnap.id;
            localProductos[id] = prod;
            adminProductos.push({ id, ...prod });
        });
        
        // Actualizar Estadísticas
        const total = adminProductos.length;
        const sinImagen = adminProductos.filter(p => !p.imagenUrl || p.imagenUrl.trim() === "" || p.imagenUrl === "img/product-placeholder.svg").length;
        
        const statTotal = document.getElementById('statTotalProductos');
        const statSinImagen = document.getElementById('statSinImagen');
        
        if (statTotal) statTotal.textContent = total;
        if (statSinImagen) statSinImagen.textContent = sinImagen;
        
        // Ordenar alfabéticamente por nombre
        adminProductos.sort((a, b) => a.nombre.localeCompare(b.nombre));
        
        renderAdminProductos();
    }, (error) => {
        console.error("Error al obtener productos: ", error);
        showToast("Error al cargar la tabla", "error");
    });
}

function renderAdminProductos() {
    tableBody.innerHTML = "";
    
    let filtrados = adminProductos;
    if (adminSearchTerm) {
        const term = normalizarTexto(adminSearchTerm);
        filtrados = filtrados.filter(p => normalizarTexto(p.nombre).includes(term));
    }
    
    const totalPages = Math.ceil(filtrados.length / ADMIN_PRODUCTOS_POR_PAGINA) || 1;
    if (adminCurrentPage > totalPages) adminCurrentPage = totalPages;
    
    const start = (adminCurrentPage - 1) * ADMIN_PRODUCTOS_POR_PAGINA;
    const end = start + ADMIN_PRODUCTOS_POR_PAGINA;
    const paginados = filtrados.slice(start, end);

    if (paginados.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center">No hay productos que coincidan con la búsqueda.</td></tr>`;
    } else {
        // Usar string HTML para ser mucho más rápido en el DOM
        let html = '';
        paginados.forEach((prod) => {
            const id = prod.id;
            
            // Renderizar múltiples categorías
            let catsToRender = prod.categorias || (prod.categoria ? [prod.categoria] : []);
            let catsHtml = catsToRender.length > 0 
                ? catsToRender.map(c => `<span class="producto-categoria-tag" style="position:static; display:inline-block; margin: 2px;">${c}</span>`).join('')
                : '<span class="producto-categoria-tag" style="position:static; display:inline-block; margin: 2px;">Sin Categoría</span>';

            const finalImageUrl = (prod.imagenUrl && prod.imagenUrl !== "img/product-placeholder.svg") 
                ? prod.imagenUrl 
                : 'https://via.placeholder.com/50';

            const tieneVariantes = prod.variantes && prod.variantes.length > 0;
            const infoVariantes = tieneVariantes ? `<br><small style="color: #38a169;">${prod.variantes.length} opciones</small>` : '';

            html += `
                <tr>
                    <td><img src="${finalImageUrl}" alt="${prod.nombre}" class="prod-img-preview" loading="lazy"></td>
                    <td><strong>${prod.nombre}</strong><br><small>${prod.desc || ''}</small>${infoVariantes}</td>
                    <td>${catsHtml}</td>
                    <td>$${prod.precio.toLocaleString('es-AR')}</td>
                    <td>
                        <button class="btn-icon edit" onclick="prepararEdicion('${id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon duplicate" style="color: #3182ce;" onclick="duplicarProducto('${id}')" title="Duplicar">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="btn-icon delete" onclick="eliminarProducto('${id}')" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = html;
    }
    
    // Actualizar controles
    const pageInfo = document.getElementById('adminPageInfo');
    const prevBtn = document.getElementById('adminPrevPage');
    const nextBtn = document.getElementById('adminNextPage');
    
    if (pageInfo) pageInfo.textContent = `Pág ${adminCurrentPage} de ${totalPages} (${filtrados.length} prod.)`;
    if (prevBtn) prevBtn.disabled = adminCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = adminCurrentPage === totalPages || totalPages === 0;
}

// Eventos de Búsqueda y Paginación
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('adminSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            adminSearchTerm = e.target.value;
            adminCurrentPage = 1;
            renderAdminProductos();
        });
    }

    const prevPageBtn = document.getElementById('adminPrevPage');
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (adminCurrentPage > 1) {
                adminCurrentPage--;
                renderAdminProductos();
            }
        });
    }

    const nextPageBtn = document.getElementById('adminNextPage');
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            const filtrados = adminSearchTerm ? adminProductos.filter(p => p.nombre.toLowerCase().includes(adminSearchTerm.toLowerCase())) : adminProductos;
            const totalPages = Math.ceil(filtrados.length / ADMIN_PRODUCTOS_POR_PAGINA) || 1;
            if (adminCurrentPage < totalPages) {
                adminCurrentPage++;
                renderAdminProductos();
            }
        });
    }

    const btnVerSinImagen = document.getElementById('btnVerSinImagen');
    if (btnVerSinImagen) {
        btnVerSinImagen.addEventListener('click', () => {
            const adminSearch = document.getElementById('adminSearch');
            if (adminSearch) {
                // Filtramos por productos que no tienen URL de imagen
                adminSearchTerm = ""; // Limpiamos búsqueda de texto
                adminSearch.value = "";
                
                // Sobrescribimos temporalmente el filtrado en el render
                const sinImagen = adminProductos.filter(p => !p.imagenUrl || p.imagenUrl.trim() === "" || p.imagenUrl === "img/product-placeholder.svg");
                
                if (sinImagen.length === 0) {
                    showToast("No hay productos sin imagen", "info");
                    return;
                }

                // Usamos un pequeño truco: filtramos adminProductos para que el render use solo esos
                const originales = [...adminProductos];
                adminProductos = sinImagen;
                adminCurrentPage = 1;
                renderAdminProductos();
                
                // Restauramos la lista original después del render para que la búsqueda siga funcionando
                adminProductos = originales;
                
                showToast(`Mostrando ${sinImagen.length} productos sin imagen`, "info");
                
                // Botón para volver a ver todos
                btnVerSinImagen.textContent = "Ver todos los productos";
                btnVerSinImagen.onclick = () => {
                    adminCurrentPage = 1;
                    renderAdminProductos();
                    btnVerSinImagen.textContent = "Ver todos";
                    btnVerSinImagen.onclick = null; // Volver al listener original
                };
            }
        });
    }
});

// ─── ELIMINAR PRODUCTO ───
window.eliminarProducto = async (id) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este producto?")) {
        return;
    }

    try {
        const prodRef = window.activeCollections?.config 
            ? doc(db, window.activeCollections.config.productCollectionPath, id)
            : doc(db, "productos", id);
        await deleteDoc(prodRef);
        showToast("Producto eliminado", "success");
    } catch (error) {
        console.error("Error eliminando producto: ", error);
        showToast("Error al eliminar", "error");
    }
};

// ─── DUPLICAR PRODUCTO ───
window.duplicarProducto = (id) => {
    const prod = localProductos[id];
    if (!prod) return;

    editMode = false;
    currentEditId = null;

    // Poblar form
    document.getElementById('nombre').value = prod.nombre + " (Copia)";
    document.getElementById('precio').value = prod.precio;
    
    // Checkboxes de categoría
    const catsToSelect = prod.categorias || (prod.categoria ? [prod.categoria] : []);
    document.querySelectorAll('input[name="productoCategorias"]').forEach(cb => {
        cb.checked = catsToSelect.includes(cb.value);
    });

    document.getElementById('descripcion').value = prod.desc;
    document.getElementById('imagenUrlInput').value = prod.imagenUrl;
    
    // Variantes
    currentVariantes = prod.variantes ? JSON.parse(JSON.stringify(prod.variantes)).map(v => ({...v, id: crypto.randomUUID().slice(0, 8)})) : [];
    renderVariantes();
    
    // UI
    document.getElementById('btnText').textContent = "Guardar Producto";
    cancelEditBtn.classList.remove('d-none');
    if (prevEditBtn) prevEditBtn.classList.add('d-none');
    if (nextEditBtn) nextEditBtn.classList.add('d-none');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast("Producto copiado al formulario. Modificalo y guardá.", "success");
};

// ─── GESTIÓN DE CATEGORÍAS ───
function cargarCategorias(categoriesCollection) {
    onSnapshot(categoriesCollection || collection(db, "categorias"), (snapshot) => {
        catTableLoader.style.display = "none";
        catTableBody.innerHTML = "";
        localCategorias = {};
        
        const catContainer = document.getElementById('categoriasContainer');
        
        // Guardar valores actuales seleccionados por si está editando
        const checkedBoxes = Array.from(catContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        
        catContainer.innerHTML = '';

        if (snapshot.empty) {
            catContainer.innerHTML = '<span style="color: #e53e3e; font-size: 0.9rem;">No hay categorías creadas.</span>';
            catTableBody.innerHTML = `<tr><td colspan="3" class="text-center">No hay categorías cargadas.</td></tr>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const cat = docSnap.data();
            const id = docSnap.id;
            localCategorias[id] = cat;

            // Llenar checkboxes de productos
            const isChecked = checkedBoxes.includes(cat.nombre) ? 'checked' : '';
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '8px';
            label.style.cursor = 'pointer';
            
            // Si hay un término de búsqueda activo, aplicar el filtro inmediatamente
            const searchTerm = searchCatInput ? normalizarTexto(searchCatInput.value) : '';
            if (searchTerm && !normalizarTexto(cat.nombre).includes(searchTerm)) {
                label.style.display = 'none';
            }

            label.innerHTML = `
                <input type="checkbox" name="productoCategorias" value="${cat.nombre}" ${isChecked}>
                <span>${cat.icono} ${cat.nombre}</span>
            `;
            catContainer.appendChild(label);

            // Llenar tabla de categorías
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-size: 1.5rem;">${cat.icono}</td>
                <td><strong>${cat.nombre}</strong></td>
                <td>
                    <button class="btn-icon edit" onclick="prepararEdicionCategoria('${id}')" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon delete" onclick="eliminarCategoria('${id}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            catTableBody.appendChild(tr);
        });
    }, (error) => {
        console.error("Error al obtener categorías: ", error);
        showToast("Error al cargar categorías", "error");
    });
}

catForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nombre = document.getElementById('catNombre').value;
    const icono = document.getElementById('catIcono').value;

    catBtnText.textContent = catEditMode ? "Actualizando..." : "Guardando...";
    catSpinner.classList.remove('d-none');
    catForm.querySelector('button[type="submit"]').disabled = true;
    catCancelEditBtn.disabled = true;

    try {
        const catCol = window.activeCollections?.categoriesCollection || collection(db, "categorias");
        const catRef = window.activeCollections?.config 
            ? doc(db, window.activeCollections.config.categoryCollectionPath, currentCatEditId)
            : doc(db, "categorias", currentCatEditId);

        if (catEditMode) {
            await updateDoc(catRef, { nombre, icono });
            showToast("Categoría actualizada", "success");
            catCancelEditBtn.click();
        } else {
            await addDoc(catCol, { nombre, icono });
            showToast("Categoría creada exitosamente", "success");
            catForm.reset();
        }
    } catch (error) {
        console.error("Error guardando categoría: ", error);
        showToast("Error al guardar: " + error.message, "error");
    } finally {
        catBtnText.textContent = catEditMode ? "Actualizar Categoría" : "Guardar Categoría";
        catSpinner.classList.add('d-none');
        catForm.querySelector('button[type="submit"]').disabled = false;
        catCancelEditBtn.disabled = false;
    }
});

catCancelEditBtn.addEventListener('click', () => {
    catEditMode = false;
    currentCatEditId = null;
    catForm.reset();
    document.getElementById('catBtnText').textContent = "Guardar Categoría";
    catCancelEditBtn.classList.add('d-none');
});

window.prepararEdicionCategoria = (id) => {
    const cat = localCategorias[id];
    if (!cat) return;

    catEditMode = true;
    currentCatEditId = id;

    document.getElementById('catNombre').value = cat.nombre;
    document.getElementById('catIcono').value = cat.icono;
    
    document.getElementById('catBtnText').textContent = "Actualizar Categoría";
    catCancelEditBtn.classList.remove('d-none');
    
    // Scroll to the category form, which is just above the product list. It's the first admin-card typically or we just scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.eliminarCategoria = async (id) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta categoría? Esto no eliminará los productos de esta categoría.")) return;

    try {
        const catRef = window.activeCollections?.config 
            ? doc(db, window.activeCollections.config.categoryCollectionPath, id)
            : doc(db, "categorias", id);
        await deleteDoc(catRef);
        showToast("Categoría eliminada", "success");
    } catch (error) {
        console.error("Error eliminando categoría: ", error);
        showToast("Error al eliminar", "error");
    }
};

// ─── TOGGLE PASSWORD VISIBILITY ───
const togglePasswordBtn = document.getElementById('togglePassword');
const passwordInput = document.getElementById('adminPassword');
if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        // Toggle the eye icon
        const icon = togglePasswordBtn.querySelector('i');
        icon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
    });
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyALovDYcyU5nr5bNGalRaCPTdnejns_avg",
    authDomain: "vitamita-d.firebaseapp.com",
    projectId: "vitamita-d",
    storageBucket: "vitamita-d.firebasestorage.app",
    messagingSenderId: "1055676055964",
    appId: "1:1055676055964:web:37ed8d6c3cfac62ccd0859"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// DOM Elements - Admin Panel
const form = document.getElementById('productForm');
const btnText = document.getElementById('btnText');
const spinner = document.getElementById('spinner');
const tableBody = document.getElementById('productosTableBody');
const tableLoader = document.getElementById('tableLoader');
const cancelEditBtn = document.getElementById('cancelEditBtn');

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

// Variables de Categorías
const catForm = document.getElementById('categoriaForm');
const catBtnText = document.getElementById('catBtnText');
const catSpinner = document.getElementById('catSpinner');
const catTableBody = document.getElementById('categoriasTableBody');
const catTableLoader = document.getElementById('catTableLoader');
const catCancelEditBtn = document.getElementById('catCancelEditBtn');

let localCategorias = {};
let catEditMode = false;
let currentCatEditId = null;

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
onAuthStateChanged(auth, (user) => {
    if (user) {
        loginOverlay.style.display = 'none';
        mainAdminPanel.style.display = 'grid';
        adminNav.style.display = 'flex';
        cargarCategorias();
        cargarProductos();
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

    // UI Loading state
    btnText.textContent = editMode ? "Actualizando..." : "Guardando...";
    spinner.classList.remove('d-none');
    form.querySelector('button[type="submit"]').disabled = true;
    cancelEditBtn.disabled = true;

    try {
        if (editMode) {
            // ─── ACTUALIZAR FIRESTORE ───
            await updateDoc(doc(db, "productos", currentEditId), {
                nombre,
                precio,
                categoria: categoriaPrincipal, // Mantenemos para compatibilidad
                categorias: categorias, // Nuevo array de categorías
                desc: descripcion,
                imagenUrl
            });
            showToast("Producto actualizado", "success");
            cancelEditBtn.click(); // Reset form
        } else {
            // ─── CREAR EN FIRESTORE ───
            await addDoc(collection(db, "productos"), {
                nombre,
                precio,
                categoria: categoriaPrincipal, // Mantenemos para compatibilidad
                categorias: categorias, // Nuevo array de categorías
                desc: descripcion,
                imagenUrl,
                createdAt: new Date()
            });
            showToast("Producto cargado exitosamente", "success");
            form.reset();
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
    form.reset();
    document.querySelectorAll('input[name="productoCategorias"]').forEach(cb => cb.checked = false);
    
    document.getElementById('btnText').textContent = "Guardar Producto";
    cancelEditBtn.classList.add('d-none');
});

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
    
    // UI
    document.getElementById('btnText').textContent = "Actualizar Producto";
    cancelEditBtn.classList.remove('d-none');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ─── LEER PRODUCTOS (Tiempo Real) ───
function cargarProductos() {
    onSnapshot(collection(db, "productos"), (snapshot) => {
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
        filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(adminSearchTerm.toLowerCase()));
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

            html += `
                <tr>
                    <td><img src="${prod.imagenUrl || 'https://via.placeholder.com/50'}" alt="${prod.nombre}" class="prod-img-preview" loading="lazy"></td>
                    <td><strong>${prod.nombre}</strong><br><small>${prod.desc || ''}</small></td>
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
});

// ─── ELIMINAR PRODUCTO ───
window.eliminarProducto = async (id) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este producto?")) {
        return;
    }

    try {
        await deleteDoc(doc(db, "productos", id));
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
    
    // UI
    document.getElementById('btnText').textContent = "Guardar Producto";
    cancelEditBtn.classList.remove('d-none');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast("Producto copiado al formulario. Modificalo y guardá.", "success");
};

// ─── GESTIÓN DE CATEGORÍAS ───
function cargarCategorias() {
    onSnapshot(collection(db, "categorias"), (snapshot) => {
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
        if (catEditMode) {
            await updateDoc(doc(db, "categorias", currentCatEditId), { nombre, icono });
            showToast("Categoría actualizada", "success");
            catCancelEditBtn.click();
        } else {
            await addDoc(collection(db, "categorias"), { nombre, icono });
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
        await deleteDoc(doc(db, "categorias", id));
        showToast("Categoría eliminada", "success");
    } catch (error) {
        console.error("Error eliminando categoría: ", error);
        showToast("Error al eliminar", "error");
    }
};

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
    const categoria = document.getElementById('categoria').value;
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
                categoria,
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
                categoria,
                desc: descripcion,
                imagenUrl,
                createdAt: new Date()
            });
            showToast("Producto cargado exitosamente", "success");
            form.reset();
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
    document.getElementById('categoria').value = prod.categoria;
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
        tableBody.innerHTML = "";
        localProductos = {};

        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center">No hay productos cargados.</td></tr>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const prod = docSnap.data();
            const id = docSnap.id;
            localProductos[id] = prod;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><img src="${prod.imagenUrl}" alt="${prod.nombre}" class="prod-img-preview"></td>
                <td><strong>${prod.nombre}</strong><br><small>${prod.desc}</small></td>
                <td><span class="producto-categoria-tag" style="position:static">${prod.categoria}</span></td>
                <td>$${prod.precio.toLocaleString('es-AR')}</td>
                <td>
                    <button class="btn-icon edit" onclick="prepararEdicion('${id}')" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon delete" onclick="eliminarProducto('${id}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }, (error) => {
        console.error("Error al obtener productos: ", error);
        showToast("Error al cargar la tabla", "error");
    });
}

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

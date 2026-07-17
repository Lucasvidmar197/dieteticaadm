import { db, doc, updateDoc } from "./firebase-config.js";
import { getCatalogCollections } from "./catalog-store.js";
import { getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const apiKeyInput = document.getElementById('apiKeyInput');
const btnScan = document.getElementById('btnScan');
const btnGenerateAll = document.getElementById('btnGenerateAll');
const btnSaveAll = document.getElementById('btnSaveAll');
const btnCancel = document.getElementById('btnCancel');
const previewSection = document.getElementById('previewSection');
const productsBody = document.getElementById('productsBody');
const countProducts = document.getElementById('countProducts');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

let productsToProcess = [];
let productsCollectionRef = null;

// Load saved API Key
const savedKey = localStorage.getItem('gemini_api_key');
if (savedKey) apiKeyInput.value = savedKey;

function showLoading(text) {
    loadingText.textContent = text;
    loadingOverlay.style.display = 'flex';
}
function hideLoading() {
    loadingOverlay.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { productsCollection } = await getCatalogCollections();
        productsCollectionRef = productsCollection;
    } catch (error) {
        console.error("Error al cargar configuración:", error);
        alert("Error al conectar con la base de datos.");
    }
});

btnScan.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        alert("Por favor, ingresá tu API Key de Gemini primero.");
        return;
    }
    localStorage.setItem('gemini_api_key', apiKey);

    if (!productsCollectionRef) {
        alert("Aún no se conectó con la base de datos.");
        return;
    }

    showLoading("Buscando productos...");
    productsToProcess = [];

    try {
        const prodSnapshot = await getDocs(productsCollectionRef);
        const allProducts = prodSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Filtrar productos sin imagen real Y sin descripción
        productsToProcess = allProducts.filter(p => {
            const hasNoImage = !p.imagenUrl || p.imagenUrl.trim() === '' || p.imagenUrl.includes('product-placeholder.svg');
            const hasNoDesc = !p.desc || p.desc.trim() === '';
            return hasNoImage && hasNoDesc;
        });

        renderTable();
        hideLoading();
        
        if (productsToProcess.length > 0) {
            previewSection.style.display = 'block';
            btnGenerateAll.disabled = false;
            btnSaveAll.disabled = true;
        } else {
            previewSection.style.display = 'none';
            alert("¡Excelente! No se encontraron productos que requieran descripción (que no tengan ni imagen ni descripción).");
        }
        
    } catch (error) {
        console.error("Error al escanear:", error);
        hideLoading();
        alert("Hubo un error al escanear los productos.");
    }
});

function renderTable() {
    countProducts.textContent = productsToProcess.length;
    productsBody.innerHTML = '';
    
    productsToProcess.forEach((prod, index) => {
        prod.tempIndex = index; // Para ubicarlo fácil
        const tr = document.createElement('tr');
        tr.id = `row-${index}`;
        
        tr.innerHTML = `
            <td><strong>${prod.nombre || 'Sin Nombre'}</strong></td>
            <td><span class="status-badge status-waiting" id="status-${index}">Esperando...</span></td>
            <td>
                <textarea class="desc-input" id="desc-${index}" placeholder="La descripción generada aparecerá aquí..."></textarea>
            </td>
        `;
        productsBody.appendChild(tr);
        
        // Listen to edits
        document.getElementById(`desc-${index}`).addEventListener('input', (e) => {
            prod.generatedDesc = e.target.value;
        });
    });
}

btnCancel.addEventListener('click', () => {
    previewSection.style.display = 'none';
    productsToProcess = [];
});

async function callGemini(productName, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
    
    const prompt = `Actuá como un redactor técnico de catálogo para una tienda de dietética. Tu tarea es escribir una descripción para el siguiente producto: "${productName}".

Reglas de estilo estrictas (Replicar formato enciclopédico):
- Estructura inicial: Empezá la descripción nombrando el producto, seguido de "es un/una..." o "son unos/unas..." (Ejemplo: "El Alfajor Proteico es un snack...").
- Tono: Informativo, objetivo y profesional. Redactá en tercera persona. Prohibido usar un tono excesivamente publicitario o dirigirte al lector (no usar "vos" ni "tú").
- Contenido:
  - La primera oración debe definir exactamente qué es el producto y su característica principal o beneficio funcional.
  - La segunda oración debe explicar su uso práctico, con qué ingredientes cuenta o para qué perfil de persona/dieta está optimizado.
- Longitud: 2 oraciones breves.
- IMPORTANTE: Debés completar las oraciones con sentido y siempre terminar el texto con un punto final (.).
- Formato de salida: Devolvé ÚNICAMENTE el texto final de la descripción en texto plano. Prohibido usar Markdown, prohibido usar asteriscos (**) y prohibido usar negritas. No agregues introducciones, confirmaciones, saludos ni comillas.`;

    const requestBody = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1000,
            topP: 0.95
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Detalles del error de Gemini API:", errorText);
        throw new Error(`Error HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (data.candidates && data.candidates[0].content.parts[0].text) {
        return data.candidates[0].content.parts[0].text.trim();
    }
    throw new Error("Respuesta inválida de la API");
}

btnGenerateAll.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    btnGenerateAll.disabled = true;
    
    for (let i = 0; i < productsToProcess.length; i++) {
        const prod = productsToProcess[i];
        const statusBadge = document.getElementById(`status-${i}`);
        const textarea = document.getElementById(`desc-${i}`);
        
        statusBadge.className = 'status-badge status-generating';
        statusBadge.textContent = 'Generando...';
        
        try {
            const desc = await callGemini(prod.nombre, apiKey);
            textarea.value = desc;
            prod.generatedDesc = desc; // Guardamos en memoria
            
            statusBadge.className = 'status-badge status-done';
            statusBadge.textContent = '¡Listo!';
            
            // Un delay de 10 segundos para no saturar la API
            await new Promise(r => setTimeout(r, 10000));
            
        } catch (error) {
            console.error("Error con Gemini:", error);
            statusBadge.className = 'status-badge status-error';
            statusBadge.textContent = 'Error';
            textarea.value = "Hubo un error al generar. Podés escribirla manualmente.";
            prod.generatedDesc = "";
        }
    }
    
    btnSaveAll.disabled = false;
    alert("¡Generación finalizada! Revisá las descripciones, modificalas si querés y luego tocale Guardar.");
});

btnSaveAll.addEventListener('click', async () => {
    if (!confirm(`¿Estás seguro de guardar estas descripciones en Firebase?`)) return;

    showLoading("Guardando en Firebase...");
    let successCount = 0;
    let errorCount = 0;

    try {
        for (const prod of productsToProcess) {
            // Solo guardamos si tiene algo escrito
            if (prod.generatedDesc && prod.generatedDesc.trim() !== '') {
                try {
                    const docRef = doc(db, productsCollectionRef.path, prod.id);
                    await updateDoc(docRef, { desc: prod.generatedDesc });
                    successCount++;
                } catch (err) {
                    console.error("Error actualizando producto:", prod.id, err);
                    errorCount++;
                }
            }
        }
        
        hideLoading();
        alert(`¡Guardado exitoso!\nProductos actualizados: ${successCount}\nErrores: ${errorCount}`);
        
        // Reset view
        previewSection.style.display = 'none';
        productsToProcess = [];
        
    } catch (error) {
        console.error("Error general guardando", error);
        hideLoading();
        alert("Ocurrió un error general durante el guardado.");
    }
});

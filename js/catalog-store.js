import { collection, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

const FALLBACK_CONFIG = {
    source: "legacy-root",
    productCollectionPath: "productos",
    categoryCollectionPath: "categorias"
};

export async function getActiveCatalogConfig() {
    try {
        const snapshot = await getDoc(doc(db, "catalog_meta", "current"));
        if (!snapshot.exists()) {
            return FALLBACK_CONFIG;
        }

        const data = snapshot.data();
        if (!data.productCollectionPath || !data.categoryCollectionPath) {
            return FALLBACK_CONFIG;
        }

        return {
            source: data.activeCatalogKind || "snapshot",
            productCollectionPath: data.productCollectionPath,
            categoryCollectionPath: data.categoryCollectionPath,
            backupId: data.currentBackupId || null,
            activeCatalogId: data.activeCatalogId || null
        };
    } catch (error) {
        console.warn("No se pudo resolver el catálogo activo. Se usa el catálogo legacy.", error);
        return FALLBACK_CONFIG;
    }
}

export async function getCatalogCollections() {
    const config = await getActiveCatalogConfig();

    return {
        config,
        productsCollection: collection(db, config.productCollectionPath),
        categoriesCollection: collection(db, config.categoryCollectionPath)
    };
}

export function buildProductDocRef(productId, config) {
    return doc(db, config.productCollectionPath, productId);
}

export function buildCategoryDocRef(categoryId, config) {
    return doc(db, config.categoryCollectionPath, categoryId);
}

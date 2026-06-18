const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const XLSX = require("xlsx");
const admin = require("firebase-admin");
const { initializeApp, cert, getApps, getApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
require("dotenv").config();

const FALLBACK_ACTIVE_CONFIG = {
    activeCatalogKind: "legacy-root",
    activeCatalogId: "legacy-root",
    productCollectionPath: "productos",
    categoryCollectionPath: "categorias"
};

const SOURCE_MANAGED_FIELDS = [
    "activo",
    "alimentaciones",
    "articulo",
    "categoria",
    "categoriaPrincipal",
    "categoriaSlugs",
    "categorias",
    "codigo",
    "desc",
    "ean",
    "imagenUrl",
    "marca",
    "nombre",
    "precio",
    "precioAntes",
    "promo",
    "slug"
];

function parseCliArgs(argv = process.argv.slice(2)) {
    const args = {};

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (!token.startsWith("--")) {
            continue;
        }

        const key = token.slice(2);
        const next = argv[index + 1];

        if (!next || next.startsWith("--")) {
            args[key] = true;
            continue;
        }

        args[key] = next;
        index += 1;
    }

    return args;
}

function initializeFirebaseAdmin() {
    const apps = getApps();
    if (apps.length > 0) {
        return getFirestore(apps[0]);
    }

    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    let app;
    if (serviceAccountPath) {
        const resolvedPath = path.resolve(serviceAccountPath);
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const serviceAccount = require(resolvedPath);
        app = initializeApp({
            credential: cert(serviceAccount)
        });
    } else if (projectId && clientEmail && privateKey) {
        app = initializeApp({
            credential: cert({
                projectId,
                clientEmail,
                privateKey: privateKey.replace(/\\n/g, "\n")
            })
        });
    } else {
        app = initializeApp();
    }

    return getFirestore(app);
}

function normalizeString(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/_/g, " ")
        .replace(/[^\w\s-]/g, " ")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function slugify(value) {
    return normalizeString(value).replace(/\s+/g, "-");
}

function chunkArray(items, size) {
    const chunks = [];

    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }

    return chunks;
}

function ensureDirectory(directoryPath) {
    fs.mkdirSync(directoryPath, { recursive: true });
}

function writeJsonFile(filePath, payload) {
    ensureDirectory(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function toNumber(value) {
    if (typeof value === "number") {
        return value;
    }

    const normalized = String(value || "")
        .replace(/\$/g, "")
        .replace(/\./g, "")
        .replace(/,/g, ".")
        .trim();

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
        throw new Error(`No se pudo interpretar el precio: ${value}`);
    }

    return parsed;
}

function findHeaderRow(rows) {
    return rows.findIndex((row) => {
        const normalizedCells = row.map((cell) => normalizeString(cell));
        return normalizedCells.includes("codigo")
            && normalizedCells.includes("articulo")
            && normalizedCells.includes("precio de venta");
    });
}

function getColumnIndexes(headerRow) {
    const normalizedHeader = headerRow.map((cell) => normalizeString(cell));

    const columnIndex = {
        ean: 0,
        order: normalizedHeader.findIndex((cell) => cell === ""),
        code: normalizedHeader.findIndex((cell) => cell === "codigo"),
        article: normalizedHeader.findIndex((cell) => cell === "articulo"),
        price: normalizedHeader.findIndex((cell) => cell === "precio de venta"),
        primaryCategory: normalizedHeader.findIndex((cell) => cell === "categoria principal"),
        alimentation: normalizedHeader
            .map((cell, index) => (cell === "alimentaciones" ? index : -1))
            .filter((index) => index >= 0)
    };

    if (columnIndex.code < 0 || columnIndex.article < 0 || columnIndex.price < 0 || columnIndex.primaryCategory < 0) {
        throw new Error("No se encontraron las columnas obligatorias en el Excel maestro.");
    }

    return columnIndex;
}

function sanitizeCode(value) {
    return String(value || "").trim();
}

function isPlaceholderCode(code) {
    const normalized = normalizeString(code);
    return normalized === "" || normalized === "nuevo producto" || normalized === "discontinuado";
}

function buildDisplayName(rawArticle) {
    const text = String(rawArticle || "").trim();
    if (!text) {
        return "";
    }

    return text
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function splitArticlePrefix(rawValue) {
    const text = String(rawValue || "").trim();
    const separatorIndex = text.indexOf("_");

    if (separatorIndex < 0) {
        return {
            prefix: "",
            body: text
        };
    }

    return {
        prefix: text.slice(0, separatorIndex).trim(),
        body: text.slice(separatorIndex + 1).trim()
    };
}

function stripSuspiciousLeadingToken(rawValue) {
    const text = String(rawValue || "").trim();
    if (!text) {
        return "";
    }

    const match = text.match(/^([A-Z]{1,3}|[A-Z]{1,3}[-_][A-Z]{1,3})(?:\s+|_)(.+)$/);
    if (!match) {
        return text;
    }

    return match[2].trim();
}

function buildTokenSignature(value) {
    const tokens = normalizeString(value)
        .split(" ")
        .filter(Boolean)
        .sort();

    return tokens.join(" ");
}

function buildNameVariants(rawValue) {
    const baseText = String(rawValue || "").trim();
    if (!baseText) {
        return [];
    }

    const displayName = buildDisplayName(baseText);
    const { prefix, body } = splitArticlePrefix(baseText);
    const strippedLeadingToken = buildDisplayName(stripSuspiciousLeadingToken(baseText));

    return dedupeList([
        baseText,
        displayName,
        strippedLeadingToken,
        body,
        buildDisplayName(body),
        prefix && body ? `${prefix} ${body}` : "",
        prefix && body ? `${body} ${prefix}` : ""
    ]);
}

function inferBrand(rawArticle, fallbackBrand = "") {
    if (fallbackBrand) {
        return String(fallbackBrand).trim();
    }

    const text = String(rawArticle || "").trim();
    if (!text.includes("_")) {
        return "";
    }

    return text.split("_")[0].trim();
}

function dedupeList(values) {
    const seen = new Set();
    const result = [];

    values.forEach((value) => {
        const label = String(value || "").trim();
        if (!label) {
            return;
        }

        const normalized = normalizeString(label);
        if (seen.has(normalized)) {
            return;
        }

        seen.add(normalized);
        result.push(label);
    });

    return result;
}

function pickCategoryIcon(name) {
    const normalized = normalizeString(name);

    const iconMap = [
        ["aceite", "🫒"],
        ["vinagre", "🫒"],
        ["alfajor", "🍫"],
        ["chocolate", "🍫"],
        ["bebida", "🥤"],
        ["cereal", "🥣"],
        ["comida", "🍽️"],
        ["keto", "🥑"],
        ["cosmet", "🧴"],
        ["endulz", "🍯"],
        ["especia", "🌶️"],
        ["sal", "🧂"],
        ["pimienta", "🧂"],
        ["fideo", "🍝"],
        ["arroz", "🍚"],
        ["fruto seco", "🥜"],
        ["pasa", "🍇"],
        ["gallet", "🍪"],
        ["granola", "🥣"],
        ["harina", "🌾"],
        ["reboz", "🌾"],
        ["premezcla", "🌾"],
        ["herbor", "🌿"],
        ["legumbre", "🫘"],
        ["panific", "🍞"],
        ["reposter", "🧁"],
        ["prote", "💪"],
        ["semilla", "🌻"],
        ["snack", "🍿"],
        ["sopa", "🥣"],
        ["caldo", "🥣"],
        ["suplement", "💊"],
        ["vitamina", "💊"],
        ["mantequilla", "🥄"],
        ["mermelada", "🍓"],
        ["miel", "🍯"],
        ["yerba", "🧉"],
        ["infusion", "🍵"],
        ["yogurt", "🥛"],
        ["sin tacc", "🌾"],
        ["sin azucar", "🍃"],
        ["sin sal", "🧂"],
        ["sin lactosa", "🥛"],
        ["sin huevo", "🥚"],
        ["vegetal", "🌱"],
        ["integral", "🌾"],
        ["congelado", "❄️"],
        ["heladera", "🧊"],
        ["infantil", "🧒"]
    ];

    const match = iconMap.find(([token]) => normalized.includes(token));
    return match ? match[1] : "🏷️";
}

function buildDescription(product, existingProduct) {
    if (existingProduct && existingProduct.desc) {
        return existingProduct.desc;
    }

    const parts = [];

    if (product.categoriaPrincipal) {
        parts.push(product.categoriaPrincipal);
    }

    if (product.alimentaciones.length > 0) {
        parts.push(product.alimentaciones.slice(0, 2).join(" · "));
    }

    return parts.join(" | ") || "Producto sincronizado desde el catalogo maestro";
}

function buildDocumentId(prefix, uniqueKey) {
    const hash = crypto.createHash("sha1").update(uniqueKey).digest("hex").slice(0, 12);
    const readable = slugify(uniqueKey).slice(0, 48) || prefix;
    return `${prefix}-${readable}-${hash}`;
}

function pickIdentifier(rawCode, article, duplicateCodeMap) {
    const code = sanitizeCode(rawCode);
    const normalizedCode = normalizeString(code);

    if (!isPlaceholderCode(code) && (duplicateCodeMap.get(normalizedCode) || 0) === 1) {
        return {
            type: "codigo",
            value: code,
            key: `codigo:${normalizedCode}`
        };
    }

    const normalizedArticle = normalizeString(article);
    return {
        type: "articulo",
        value: article,
        key: `articulo:${normalizedArticle}`
    };
}

function extractVariantInfo(displayName) {
    const match = displayName.match(/(.*?)\s+(?:x|-)\s+(.*)/i);
    if (match) {
        return {
            baseName: match[1].trim(),
            variantName: match[2].trim()
        };
    }
    const match2 = displayName.match(/(.*?)\s+(\d+(?:,\d+|\.\d+)?\s*(?:kg|g|gr|grs|ml|l|cc|lt|lts|u|un|unidades))$/i);
    if (match2) {
         return {
            baseName: match2[1].trim(),
            variantName: match2[2].trim()
        };
    }
    return null;
}

function parseSourceWorkbook(sourceFilePath) {
    const workbook = XLSX.readFile(sourceFilePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    const headerRowIndex = findHeaderRow(rows);

    if (headerRowIndex < 0) {
        throw new Error("No se encontro la fila de encabezados del Excel maestro.");
    }

    const columnIndexes = getColumnIndexes(rows[headerRowIndex]);
    const rawRows = rows
        .slice(headerRowIndex + 1)
        .map((row, rowIndex) => ({
            ean: row[columnIndexes.ean],
            code: row[columnIndexes.code],
            article: String(row[columnIndexes.article] || "").trim(),
            price: row[columnIndexes.price],
            primaryCategory: String(row[columnIndexes.primaryCategory] || "").trim(),
            alimentation: columnIndexes.alimentation
                .map((columnIndex) => String(row[columnIndex] || "").trim())
                .filter(Boolean),
            rowNumber: headerRowIndex + rowIndex + 2
        }))
        .filter((row) => row.article);

    const duplicateCodeMap = rawRows.reduce((accumulator, row) => {
        const code = normalizeString(sanitizeCode(row.code));
        if (!code || isPlaceholderCode(code)) {
            return accumulator;
        }

        accumulator.set(code, (accumulator.get(code) || 0) + 1);
        return accumulator;
    }, new Map());

    const rawProducts = rawRows.map((row) => {
        const identifier = pickIdentifier(row.code, row.article, duplicateCodeMap);
        const categoriaPrincipal = row.primaryCategory;
        const alimentaciones = dedupeList(row.alimentation);
        const categorias = dedupeList([categoriaPrincipal, ...alimentaciones]);
        const brand = inferBrand(row.article);
        const isDiscontinued = normalizeString(categoriaPrincipal).includes("discontinuado")
            || normalizeString(row.code).includes("discontinuado");
        const rawNombre = buildDisplayName(row.article);
        
        const variantInfo = extractVariantInfo(rawNombre);
        const baseName = variantInfo ? variantInfo.baseName : rawNombre;
        const variantName = variantInfo ? variantInfo.variantName : "Único";
        const slug = slugify(baseName || row.article);

        return {
            uniqueKey: identifier.key,
            sourceIdentifierType: identifier.type,
            sourceIdentifierValue: identifier.value,
            rawCode: sanitizeCode(row.code),
            codigo: isPlaceholderCode(row.code) ? "" : sanitizeCode(row.code),
            ean: row.ean ? String(row.ean).trim() : "",
            articulo: row.article,
            nombre: baseName,
            originalNombre: rawNombre,
            variantName,
            marca: brand,
            precio: toNumber(row.price),
            categoria: categoriaPrincipal,
            categoriaPrincipal,
            categorias,
            categoriaSlugs: categorias.map((category) => slugify(category)),
            alimentaciones,
            slug,
            promo: false,
            precioAntes: null,
            activo: !isDiscontinued,
            sourceRowNumber: row.rowNumber
        };
    });

    const groupedProductsMap = new Map();

    rawProducts.forEach((prod) => {
        const key = normalizeString(prod.nombre);
        if (!key) return;

        if (!groupedProductsMap.has(key)) {
            groupedProductsMap.set(key, {
                ...prod,
                variantes: []
            });
        }

        const group = groupedProductsMap.get(key);

        // Agregamos la variante si no está repetida exactamente
        const varianteExistente = group.variantes.find(v => v.nombre === prod.variantName);
        if (!varianteExistente) {
            group.variantes.push({
                id: prod.codigo || crypto.randomUUID().slice(0, 8),
                nombre: prod.variantName,
                precio: prod.precio,
                codigo: prod.codigo,
                originalNombre: prod.originalNombre
            });
        }

        // El precio base del grupo será el menor precio de las variantes
        if (prod.precio < group.precio) {
            group.precio = prod.precio;
        }
        
        // Si hay una variante que está activa, el grupo está activo
        if (prod.activo) {
            group.activo = true;
        }
    });

    const products = Array.from(groupedProductsMap.values());

    return {
        workbookName: path.basename(sourceFilePath),
        worksheetName: workbook.SheetNames[0],
        headerRowNumber: headerRowIndex + 1,
        totalRows: products.length,
        inactiveRows: products.filter((product) => !product.activo).length,
        products
    };
}

function parseLegacyWorkbook(legacyFilePath) {
    if (!legacyFilePath || !fs.existsSync(legacyFilePath)) {
        return null;
    }

    const workbook = XLSX.readFile(legacyFilePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    return {
        workbookName: path.basename(legacyFilePath),
        worksheetName: workbook.SheetNames[0],
        totalRows: rows.length
    };
}

function buildCurrentIndexes(currentProducts) {
    const byCode = new Map();
    const byName = new Map();
    const byArticle = new Map();
    const byTokenSignature = new Map();

    currentProducts.forEach((product) => {
        const code = normalizeString(product.codigo || product.code);
        if (code && !isPlaceholderCode(code)) {
            if (!byCode.has(code)) {
                byCode.set(code, []);
            }
            byCode.get(code).push(product);
        }

        const nameCandidates = dedupeList([
            product.nombre,
            product.articulo,
            buildDisplayName(product.articulo),
            String(product.nombre || "").replace(/\s*-\s*/g, " ")
        ]).flatMap((candidate) => buildNameVariants(candidate));

        nameCandidates.forEach((candidate) => {
            const normalized = normalizeString(candidate);
            if (!normalized) {
                return;
            }

            if (!byName.has(normalized)) {
                byName.set(normalized, []);
            }

            byName.get(normalized).push(product);

            const signature = buildTokenSignature(candidate);
            if (signature) {
                if (!byTokenSignature.has(signature)) {
                    byTokenSignature.set(signature, []);
                }

                byTokenSignature.get(signature).push(product);
            }
        });

        const articleNormalized = normalizeString(product.articulo);
        if (articleNormalized) {
            if (!byArticle.has(articleNormalized)) {
                byArticle.set(articleNormalized, []);
            }
            byArticle.get(articleNormalized).push(product);
        }
    });

    return {
        byCode,
        byName,
        byArticle,
        byTokenSignature
    };
}

function pickSingleMatch(matches) {
    return matches && matches.length === 1 ? matches[0] : null;
}

function resolveExistingProduct(sourceProduct, indexes) {
    const normalizedCode = normalizeString(sourceProduct.codigo);
    const nameCandidates = dedupeList([
        sourceProduct.articulo,
        sourceProduct.nombre,
        String(sourceProduct.articulo || "").replace(/_/g, " "),
        String(sourceProduct.nombre || "").replace(/\s*-\s*/g, " ")
    ]).flatMap((value) => buildNameVariants(value));

    if (normalizedCode && indexes.byCode.has(normalizedCode)) {
        const byCodeMatch = pickSingleMatch(indexes.byCode.get(normalizedCode));
        if (byCodeMatch) {
            return byCodeMatch;
        }
    }

    for (const candidate of nameCandidates) {
        const normalizedCandidate = normalizeString(candidate);

        if (!normalizedCandidate) {
            continue;
        }

        if (indexes.byArticle.has(normalizedCandidate)) {
            const byArticleMatch = pickSingleMatch(indexes.byArticle.get(normalizedCandidate));
            if (byArticleMatch) {
                return byArticleMatch;
            }
        }

        if (indexes.byName.has(normalizedCandidate)) {
            const byNameMatch = pickSingleMatch(indexes.byName.get(normalizedCandidate));
            if (byNameMatch) {
                return byNameMatch;
            }
        }

        const tokenSignature = buildTokenSignature(candidate);
        if (tokenSignature && indexes.byTokenSignature.has(tokenSignature)) {
            const bySignatureMatch = pickSingleMatch(indexes.byTokenSignature.get(tokenSignature));
            if (bySignatureMatch) {
                return bySignatureMatch;
            }
        }
    }

    return null;
}

function buildMergedProduct(sourceProduct, existingProduct) {
    const merged = {
        codigo: sourceProduct.codigo || existingProduct?.codigo || "",
        ean: sourceProduct.ean || existingProduct?.ean || "",
        articulo: sourceProduct.articulo,
        nombre: sourceProduct.nombre || existingProduct?.nombre || sourceProduct.articulo,
        marca: sourceProduct.marca || existingProduct?.marca || "",
        precio: sourceProduct.precio,
        categoria: sourceProduct.categoriaPrincipal,
        categoriaPrincipal: sourceProduct.categoriaPrincipal,
        categorias: sourceProduct.categorias,
        categoriaSlugs: sourceProduct.categoriaSlugs,
        alimentaciones: sourceProduct.alimentaciones,
        slug: sourceProduct.slug,
        promo: false,
        precioAntes: null,
        activo: sourceProduct.activo,
        desc: buildDescription(sourceProduct, existingProduct),
        imagenUrl: existingProduct?.imagenUrl && existingProduct.imagenUrl !== "img/product-placeholder.svg" ? existingProduct.imagenUrl : "",
        variantes: sourceProduct.variantes || existingProduct?.variantes || []
    };

    return merged;
}

function pickComparableShape(product) {
    const comparable = {};
    SOURCE_MANAGED_FIELDS.forEach((field) => {
        comparable[field] = field in product ? product[field] : null;
    });
    return comparable;
}

function deepEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function buildCategoryDocuments(products) {
    const categoryMap = new Map();

    products
        .filter((product) => product.activo !== false)
        .forEach((product) => {
            const primarySlug = slugify(product.categoriaPrincipal);

            product.categorias.forEach((categoryName) => {
                const slug = slugify(categoryName);
                const existing = categoryMap.get(slug) || {
                    id: buildDocumentId("cat", slug),
                    slug,
                    nombre: categoryName,
                    icono: pickCategoryIcon(categoryName),
                    tipo: new Set(),
                    productCount: 0
                };

                existing.productCount += 1;
                existing.tipo.add(slug === primarySlug ? "principal" : "alimentacion");
                categoryMap.set(slug, existing);
            });
        });

    return Array.from(categoryMap.values())
        .sort((left, right) => left.nombre.localeCompare(right.nombre, "es"))
        .map((category) => ({
            id: category.id,
            data: {
                nombre: category.nombre,
                slug: category.slug,
                icono: category.icono,
                tipo: Array.from(category.tipo).sort(),
                productCount: category.productCount,
                activa: true
            }
        }));
}

async function getActiveCatalogConfig(db) {
    const metaRef = db.collection("catalog_meta").doc("current");
    const snapshot = await metaRef.get();

    if (!snapshot.exists) {
        return FALLBACK_ACTIVE_CONFIG;
    }

    const data = snapshot.data();
    if (!data.productCollectionPath || !data.categoryCollectionPath) {
        return FALLBACK_ACTIVE_CONFIG;
    }

    return {
        activeCatalogKind: data.activeCatalogKind || "snapshot",
        activeCatalogId: data.activeCatalogId || "desconocido",
        productCollectionPath: data.productCollectionPath,
        categoryCollectionPath: data.categoryCollectionPath
    };
}

async function readCollectionDocuments(db, collectionPath) {
    const snapshot = await db.collection(collectionPath).get();
    return snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data()
    }));
}

async function writeDocuments(db, collectionPath, documents) {
    const chunks = chunkArray(documents, 400);

    for (const chunk of chunks) {
        const batch = db.batch();
        chunk.forEach((document) => {
            batch.set(db.collection(collectionPath).doc(document.id), document.data, { merge: false });
        });
        await batch.commit();
    }
}

function buildBackupDocuments(documents) {
    return documents.map((document) => ({
        id: document.id,
        data: {
            ...document,
            backupCapturedAt: new Date().toISOString()
        }
    }));
}

function buildSnapshotDocuments(finalProducts) {
    return finalProducts.map((product) => ({
        id: buildDocumentId("prod", product.uniqueKey),
        data: {
            ...product.finalData,
            sourceIdentifierType: product.sourceIdentifierType,
            sourceIdentifierValue: product.sourceIdentifierValue,
            sourceUniqueKey: product.uniqueKey,
            sourceRowNumber: product.sourceRowNumber,
            synchronizedAt: new Date().toISOString()
        }
    }));
}

function buildSyncPlan(sourceCatalog, currentProducts) {
    const indexes = buildCurrentIndexes(currentProducts);
    const matchedCurrentIds = new Set();
    const finalProducts = [];

    let insertCount = 0;
    let updateCount = 0;
    let unchangedCount = 0;

    sourceCatalog.products.forEach((sourceProduct) => {
        const existingProduct = resolveExistingProduct(sourceProduct, indexes);
        const finalData = buildMergedProduct(sourceProduct, existingProduct);

        if (existingProduct) {
            matchedCurrentIds.add(existingProduct.id);
            const currentComparable = pickComparableShape(existingProduct);
            const nextComparable = pickComparableShape(finalData);

            if (deepEqual(currentComparable, nextComparable)) {
                unchangedCount += 1;
            } else {
                updateCount += 1;
            }
        } else {
            insertCount += 1;
        }

        finalProducts.push({
            ...sourceProduct,
            existingProductId: existingProduct ? existingProduct.id : null,
            finalData
        });
    });

    const removedProducts = currentProducts.filter((product) => !matchedCurrentIds.has(product.id));

    return {
        finalProducts,
        insertCount,
        updateCount,
        unchangedCount,
        removedCount: removedProducts.length,
        removedProductIds: removedProducts.map((product) => product.id)
    };
}

async function createBackup(db, activeConfig, currentProducts, currentCategories, backupId, runMetadata) {
    const backupRootPath = `catalog_backups/${backupId}`;
    const backupProductsPath = `${backupRootPath}/productos`;
    const backupCategoriesPath = `${backupRootPath}/categorias`;

    await writeDocuments(db, backupProductsPath, buildBackupDocuments(currentProducts));
    await writeDocuments(db, backupCategoriesPath, buildBackupDocuments(currentCategories));

    await db.collection("catalog_backups").doc(backupId).set({
        backupId,
        createdAt: FieldValue.serverTimestamp(),
        createdAtIso: new Date().toISOString(),
        originCatalogKind: activeConfig.activeCatalogKind,
        originCatalogId: activeConfig.activeCatalogId,
        originProductCollectionPath: activeConfig.productCollectionPath,
        originCategoryCollectionPath: activeConfig.categoryCollectionPath,
        backupProductCollectionPath: backupProductsPath,
        backupCategoryCollectionPath: backupCategoriesPath,
        productCount: currentProducts.length,
        categoryCount: currentCategories.length,
        runMetadata
    }, { merge: true });

    return {
        backupId,
        backupProductsPath,
        backupCategoriesPath
    };
}

async function createCatalogSnapshot(db, snapshotId, snapshotDocuments, categoryDocuments, runMetadata) {
    const snapshotRootPath = `catalog_snapshots/${snapshotId}`;
    const snapshotProductsPath = `${snapshotRootPath}/productos`;
    const snapshotCategoriesPath = `${snapshotRootPath}/categorias`;

    await writeDocuments(db, snapshotProductsPath, snapshotDocuments);
    await writeDocuments(db, snapshotCategoriesPath, categoryDocuments);

    await db.collection("catalog_snapshots").doc(snapshotId).set({
        snapshotId,
        createdAt: FieldValue.serverTimestamp(),
        createdAtIso: new Date().toISOString(),
        productCollectionPath: snapshotProductsPath,
        categoryCollectionPath: snapshotCategoriesPath,
        productCount: snapshotDocuments.length,
        activeProductCount: snapshotDocuments.filter((document) => document.data.activo !== false).length,
        categoryCount: categoryDocuments.length,
        runMetadata
    }, { merge: true });

    return {
        snapshotId,
        snapshotProductsPath,
        snapshotCategoriesPath
    };
}

async function flipActiveCatalog(db, nextConfig) {
    const metaRef = db.collection("catalog_meta").doc("current");

    await db.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(metaRef);
        const currentData = currentSnapshot.exists ? currentSnapshot.data() : FALLBACK_ACTIVE_CONFIG;

        transaction.set(metaRef, {
            activeCatalogKind: nextConfig.activeCatalogKind,
            activeCatalogId: nextConfig.activeCatalogId,
            productCollectionPath: nextConfig.productCollectionPath,
            categoryCollectionPath: nextConfig.categoryCollectionPath,
            currentBackupId: nextConfig.currentBackupId || currentData.currentBackupId || null,
            previousCatalogKind: currentData.activeCatalogKind || FALLBACK_ACTIVE_CONFIG.activeCatalogKind,
            previousCatalogId: currentData.activeCatalogId || FALLBACK_ACTIVE_CONFIG.activeCatalogId,
            previousProductCollectionPath: currentData.productCollectionPath || FALLBACK_ACTIVE_CONFIG.productCollectionPath,
            previousCategoryCollectionPath: currentData.categoryCollectionPath || FALLBACK_ACTIVE_CONFIG.categoryCollectionPath,
            sourceWorkbookName: nextConfig.sourceWorkbookName || currentData.sourceWorkbookName || null,
            lastOperation: nextConfig.lastOperation,
            updatedAt: FieldValue.serverTimestamp(),
            updatedAtIso: new Date().toISOString(),
            totalProducts: nextConfig.totalProducts,
            totalCategories: nextConfig.totalCategories
        }, { merge: true });
    });
}

function buildRunMetadata(sourceCatalog, legacyCatalog, syncPlan, options) {
    return {
        sourceWorkbookName: sourceCatalog.workbookName,
        sourceWorksheetName: sourceCatalog.worksheetName,
        headerRowNumber: sourceCatalog.headerRowNumber,
        sourceRowCount: sourceCatalog.totalRows,
        sourceInactiveRows: sourceCatalog.inactiveRows,
        legacyWorkbookName: legacyCatalog?.workbookName || null,
        legacyRowCount: legacyCatalog?.totalRows || null,
        plannedInserts: syncPlan.insertCount,
        plannedUpdates: syncPlan.updateCount,
        plannedUnchanged: syncPlan.unchangedCount,
        plannedRemoved: syncPlan.removedCount,
        dryRun: Boolean(options.dryRun)
    };
}

async function runCatalogSync(options = {}) {
    const db = initializeFirebaseAdmin();
    const sourceFilePath = path.resolve(options.sourceFile || process.env.CATALOG_SOURCE_FILE || "Artículos Actualizado_Juampi.xlsx");
    const legacyFilePath = path.resolve(options.legacyFile || process.env.CATALOG_LEGACY_FILE || "Página Web (1).xlsx");

    if (!fs.existsSync(sourceFilePath)) {
        throw new Error(`No se encontro el archivo maestro: ${sourceFilePath}`);
    }

    const sourceCatalog = parseSourceWorkbook(sourceFilePath);
    const legacyCatalog = parseLegacyWorkbook(legacyFilePath);
    const activeConfig = await getActiveCatalogConfig(db);
    const currentProducts = await readCollectionDocuments(db, activeConfig.productCollectionPath);
    const currentCategories = await readCollectionDocuments(db, activeConfig.categoryCollectionPath);
    const syncPlan = buildSyncPlan(sourceCatalog, currentProducts);
    const categoryDocuments = buildCategoryDocuments(syncPlan.finalProducts.map((product) => product.finalData));
    const snapshotDocuments = buildSnapshotDocuments(syncPlan.finalProducts);
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const backupId = options.backupId || `backup-${timestamp}`;
    const snapshotId = options.snapshotId || `catalog-${timestamp}`;
    const runMetadata = buildRunMetadata(sourceCatalog, legacyCatalog, syncPlan, options);
    const report = {
        executedAt: now.toISOString(),
        sourceFilePath,
        legacyFilePath,
        activeConfig,
        counts: {
            currentProducts: currentProducts.length,
            currentCategories: currentCategories.length,
            sourceRows: sourceCatalog.totalRows,
            sourceInactiveRows: sourceCatalog.inactiveRows,
            inserts: syncPlan.insertCount,
            updates: syncPlan.updateCount,
            unchanged: syncPlan.unchangedCount,
            removedFromLiveCatalog: syncPlan.removedCount,
            nextProducts: snapshotDocuments.length,
            nextActiveProducts: snapshotDocuments.filter((document) => document.data.activo !== false).length,
            nextCategories: categoryDocuments.length
        },
        backupId,
        snapshotId,
        dryRun: Boolean(options.dryRun)
    };

    const reportFilePath = path.join(process.cwd(), "backups", `${timestamp}-catalog-sync-report.json`);
    writeJsonFile(reportFilePath, report);

    if (options.dryRun) {
        return {
            ...report,
            reportFilePath,
            syncPlan // Incluimos el plan para inspección
        };
    }

    const backup = await createBackup(db, activeConfig, currentProducts, currentCategories, backupId, runMetadata);
    const snapshot = await createCatalogSnapshot(db, snapshotId, snapshotDocuments, categoryDocuments, runMetadata);

    await flipActiveCatalog(db, {
        activeCatalogKind: "snapshot",
        activeCatalogId: snapshot.snapshotId,
        productCollectionPath: snapshot.snapshotProductsPath,
        categoryCollectionPath: snapshot.snapshotCategoriesPath,
        currentBackupId: backup.backupId,
        sourceWorkbookName: sourceCatalog.workbookName,
        totalProducts: snapshotDocuments.length,
        totalCategories: categoryDocuments.length,
        lastOperation: {
            type: "sync",
            backupId: backup.backupId,
            snapshotId: snapshot.snapshotId,
            executedAt: now.toISOString()
        }
    });

    const finalReport = {
        ...report,
        reportFilePath,
        backupProductsPath: backup.backupProductsPath,
        backupCategoriesPath: backup.backupCategoriesPath,
        snapshotProductsPath: snapshot.snapshotProductsPath,
        snapshotCategoriesPath: snapshot.snapshotCategoriesPath
    };

    writeJsonFile(reportFilePath, finalReport);
    return finalReport;
}

async function runCatalogRollback(options = {}) {
    const db = initializeFirebaseAdmin();
    const backupId = options.backupId;

    if (!backupId) {
        throw new Error("Debes indicar --backup <backupId>.");
    }

    const backupRef = db.collection("catalog_backups").doc(backupId);
    const backupSnapshot = await backupRef.get();

    if (!backupSnapshot.exists) {
        throw new Error(`No existe el backup ${backupId}.`);
    }

    const backupData = backupSnapshot.data();
    const rollbackTime = new Date().toISOString();

    await flipActiveCatalog(db, {
        activeCatalogKind: "backup",
        activeCatalogId: backupId,
        productCollectionPath: backupData.backupProductCollectionPath,
        categoryCollectionPath: backupData.backupCategoryCollectionPath,
        currentBackupId: backupId,
        sourceWorkbookName: backupData.runMetadata?.sourceWorkbookName || null,
        totalProducts: backupData.productCount,
        totalCategories: backupData.categoryCount,
        lastOperation: {
            type: "rollback",
            backupId,
            executedAt: rollbackTime
        }
    });

    const report = {
        executedAt: rollbackTime,
        backupId,
        restoredProductCollectionPath: backupData.backupProductCollectionPath,
        restoredCategoryCollectionPath: backupData.backupCategoryCollectionPath,
        counts: {
            restoredProducts: backupData.productCount,
            restoredCategories: backupData.categoryCount
        }
    };

    const reportFilePath = path.join(process.cwd(), "backups", `${backupId}-rollback-report.json`);
    writeJsonFile(reportFilePath, report);
    return {
        ...report,
        reportFilePath
    };
}

module.exports = {
    parseCliArgs,
    runCatalogSync,
    runCatalogRollback
};

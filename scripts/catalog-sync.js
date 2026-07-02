const { parseCliArgs, runCatalogSync } = require("./lib/catalog-sync");

async function main() {
    const args = parseCliArgs();

    const result = await runCatalogSync({
        sourceFile: args.source,
        legacyFile: args.legacy,
        dryRun: Boolean(args["dry-run"])
    });

    console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
    console.error("Error ejecutando la sincronizacion del catalogo.");
    console.error(error);
    process.exit(1);
});

const { parseCliArgs, runCatalogRollback } = require("./lib/catalog-sync");

async function main() {
    const args = parseCliArgs();
    const backupId = args.backup || args["backup-id"];

    const result = await runCatalogRollback({ backupId });
    console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
    console.error("Error ejecutando el rollback del catalogo.");
    console.error(error);
    process.exit(1);
});

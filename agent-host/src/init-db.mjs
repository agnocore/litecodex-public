import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..", "..");
const ledgerDir = path.join(repoRoot, "run-ledger");
const dbPath = path.join(ledgerDir, "ledger.sqlite");
const schemaPath = path.join(ledgerDir, "init.sql");

fs.mkdirSync(ledgerDir, { recursive: true });
const schemaSql = fs.readFileSync(schemaPath, "utf8");
const db = new DatabaseSync(dbPath);
db.exec(schemaSql);
db.close();

console.log(`SQLite initialized: ${dbPath}`);
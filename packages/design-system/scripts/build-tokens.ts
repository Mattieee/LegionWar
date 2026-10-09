import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateTokensCss } from "../src/resolve";

const target = fileURLToPath(new URL("../src/css/tokens.css", import.meta.url));
writeFileSync(target, generateTokensCss());
console.log(`Tokens générés → ${target}`);

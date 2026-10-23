#!/usr/bin/env node
/**
 * Genera `wrangler.generated.jsonc` a partir de `wrangler.jsonc` y de `.env`.
 *
 * Wrangler no interpola variables de entorno dentro de wrangler.jsonc, así que
 * el `database_id` (dato privado) se inyecta en un archivo generado que está
 * ignorado por git.
 *
 * Uso:
 *   node scripts/generate-wrangler-config.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const templatePath = resolve(root, 'wrangler.jsonc');
const outputPath = resolve(root, 'wrangler.generated.jsonc');

function loadEnv(path) {
    if (!existsSync(path)) {
        return {};
    }

    const env = {};

    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);

        if (!match) {
            continue;
        }

        let value = match[2].trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        env[match[1]] = value;
    }

    return env;
}

/** Parsea JSONC (comentarios y comas finales) sin dependencias externas. */
function parseJsonc(text) {
    let withoutComments = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (inString) {
            withoutComments += char;

            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }

            continue;
        }

        if (char === '"') {
            inString = true;
            withoutComments += char;
            continue;
        }

        if (char === '/' && next === '/') {
            while (i < text.length && text[i] !== '\n') {
                i++;
            }
            withoutComments += '\n';
            continue;
        }

        if (char === '/' && next === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
                i++;
            }
            i++;
            continue;
        }

        withoutComments += char;
    }

    let cleaned = '';
    inString = false;
    escaped = false;

    for (let i = 0; i < withoutComments.length; i++) {
        const char = withoutComments[i];

        if (inString) {
            cleaned += char;

            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }

            continue;
        }

        if (char === '"') {
            inString = true;
            cleaned += char;
            continue;
        }

        if (char === ',') {
            let j = i + 1;
            while (j < withoutComments.length && /\s/.test(withoutComments[j])) {
                j++;
            }

            if (withoutComments[j] === '}' || withoutComments[j] === ']') {
                continue;
            }
        }

        cleaned += char;
    }

    return JSON.parse(cleaned);
}

const env = { ...loadEnv(envPath), ...process.env };
const databaseId = env.D1_DATABASE_ID?.trim();
const databaseName = env.D1_DATABASE_NAME?.trim();

if (!databaseId) {
    console.error(
        '[cf:config] Falta D1_DATABASE_ID. Copia .env.example a .env y completa el valor.'
    );
    process.exit(1);
}

const config = parseJsonc(readFileSync(templatePath, 'utf8'));
const database = config.d1_databases?.[0];

if (!database) {
    console.error('[cf:config] No se encontró el binding de D1 en wrangler.jsonc.');
    process.exit(1);
}

database.database_id = databaseId;

if (databaseName) {
    database.database_name = databaseName;
}

writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);

console.log(
    `[cf:config] Configuración generada en ${relative(root, outputPath)} (database_id desde .env).`
);

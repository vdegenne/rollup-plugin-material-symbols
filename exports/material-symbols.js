import { cp, readFile, writeFile } from 'fs/promises';
import { parse, join } from 'path';
import { globbySync } from 'globby';
import { env } from 'process';

const variants = [
    'Outlined',
    'Rounded',
    'Sharp'
];
const baseStylingOptions = {
    opsz: 48,
    wght: 400,
    FILL: 0,
    GRAD: 0
};
const baseOptions = {
    variant: 'Outlined',
    includeHTML: undefined,
    copyHTML: undefined,
    customTheme: undefined,
    styling: baseStylingOptions
};
const GH_BASE_URL = 'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/';
const FONTS_BASE_URL = 'https://fonts.googleapis.com/css2?family=Material+Symbols+';

const replaceSymbolsLinkTag = (content, includedSymbols = {}, variant, styling) => {
    const { opsz, wght, FILL, GRAD } = { ...baseStylingOptions, ...styling };
    const symbols = Object.values(includedSymbols)
        .map((value) => `${encodeURIComponent(String.fromCharCode(parseInt(value, 16)))}`);
    const href = `${FONTS_BASE_URL}${variant}:opsz,wght,FILL,GRAD@${opsz},${wght},${FILL},${GRAD}&display=swap&text=${symbols.join(',')}`;
    const link = `<link rel="stylesheet" href="${href}">`;
    return content.replace(/\/\/ @material-symbols-link/g, link);
};
const replaceSymbolsTag = (content, includedSymbols) => {
    const symbols = Object.values(includedSymbols)
        .map((value) => `${encodeURIComponent(String.fromCharCode(parseInt(value, 16)))}`);
    return content.replace(/\/\/ @material-symbols/g, `globalThis.symbols = '${symbols.join(',')}'`);
};
const injectSymbols$1 = (content, codepoints, symbols) => {
    return content.replaceAll(/(?:\@symbol\-)([aA-zZ]+)/g, (_, $1) => {
        !symbols.includes($1) && symbols.push($1);
        return `&#x${codepoints[$1]}`;
    });
};

let _codepoints;
let _fetchedVariant;
const materialSymbolsFont = async (options) => {
    options = { ...baseOptions, ...options };
    const includedSymbols = {};
    const symbols = [];
    const codepoints = {};
    const variant = options.variant;
    const shouldCopy = Boolean(options.copyHTML);
    const shouldInclude = Boolean(options.includeHTML);
    const hasCustomTheme = Boolean(options.customTheme);
    const url = `${GH_BASE_URL}MaterialSymbols${variant}[FILL,GRAD,opsz,wght].codepoints`;
    if (!_codepoints || _fetchedVariant !== variant) {
        _fetchedVariant = variant;
        _codepoints = (await (await fetch(url)).text()).split('\n');
        for (const line of _codepoints) {
            const parts = line.split(' ');
            codepoints[parts[0]] = parts[1];
        }
    }
    let inputDir;
    return {
        name: 'materialSymbols',
        buildStart: (options) => {
            const input = Array.isArray(options.input) ? options.input[0] : options.input;
            if (shouldCopy)
                inputDir = parse(input).dir;
        },
        transform: async (code, id) => {
            // replaces @symbol-home with the codepoint for home
            return injectSymbols$1(code, codepoints, symbols);
        },
        writeBundle: async (bundleOptions, bundle) => {
            for (const symbol of symbols) {
                includedSymbols[symbol] = codepoints[symbol];
            }
            if (shouldCopy) {
                const copyHTML = options.copyHTML === true ? `${inputDir}/**/*.html` : options.copyHTML;
                const glob = globbySync(copyHTML);
                await Promise.all(glob.map(path => cp(path, join(bundleOptions.dir, path.replace(inputDir, '')))));
                if (shouldInclude) {
                    const promises = await Promise.all(glob.map(async (path) => {
                        let code = (await readFile(path.replace(inputDir, bundleOptions.dir))).toString();
                        return { code: injectSymbols$1(code, codepoints, symbols), path };
                    }));
                    for (const symbol of symbols) {
                        includedSymbols[symbol] = codepoints[symbol];
                    }
                    await Promise.all(promises.map(({ code, path }) => {
                        code = replaceSymbolsLinkTag(code, includedSymbols, variant, options.styling);
                        code = replaceSymbolsTag(code, includedSymbols);
                        return writeFile(path.replace(inputDir, bundleOptions.dir), code);
                    }));
                }
            }
            // also run trough html when not copying
            if (!shouldCopy && shouldInclude) {
                const includeHTML = options.includeHTML === true ? `${bundleOptions.dir}/**/*.html` : options.includeHTML;
                const glob = globbySync(includeHTML);
                const promises = await Promise.all(glob.map(async (path) => {
                    let code = (await readFile(path)).toString();
                    code = injectSymbols$1(code, codepoints, symbols);
                    return { path, code };
                }));
                for (const symbol of symbols) {
                    includedSymbols[symbol] = codepoints[symbol];
                }
                await Promise.all(promises.map(({ code, path }) => {
                    code = replaceSymbolsLinkTag(code, includedSymbols, variant, options.styling);
                    code = replaceSymbolsTag(code, includedSymbols);
                    return writeFile(path.replace(inputDir, bundleOptions.dir), code);
                }));
            }
            if (hasCustomTheme) {
                const customTheme = options.customTheme === true ? `${bundleOptions.dir}/theme.js` : options.customTheme;
                let code = (await readFile(customTheme)).toString();
                code = replaceSymbolsLinkTag(code, includedSymbols, variant, options.styling);
                code = replaceSymbolsTag(code, includedSymbols);
                await writeFile(customTheme, code);
            }
        }
    };
};

const injectSymbols = (content, symbols) => content.replaceAll(/(?:\@symbol\-)([aA-zZ]+)/g, (_, $1) => symbols[$1]);
const getSymbols = (content) => {
    const matches = content.match(/(?:\@symbol\-)([aA-zZ]+)/g);
    return matches?.map(match => match.replace('@symbol-', '')) || [];
};

const includedSymbols = {};
const symbols = [];
const materialSymbolsSvg = async (options) => {
    options = { ...baseOptions, ...options };
    const variant = options.variant.toLowerCase();
    const shouldCopy = Boolean(options.copyHTML);
    const shouldInclude = Boolean(options.includeHTML);
    const root = `${env.npm_config_local_prefix}/node_modules/@material-symbols/svg-400/${variant}`;
    const createPath = (root, symbol, fill) => {
        return join(root, `${fill === 1 ? `${symbol}-fill` : symbol}.svg`);
    };
    let inputDir;
    const transform = async (code) => {
        for (const symbol of getSymbols(code)) {
            if (!symbols.includes(symbol)) {
                symbols.push(symbol);
                includedSymbols[symbol] = await readFile(createPath(root, symbol, options.styling.FILL));
            }
        }
        return injectSymbols(code, includedSymbols);
    };
    return {
        name: 'materialSymbolsSvg',
        buildStart: (options) => {
            const input = Array.isArray(options.input) ? options.input[0] : options.input;
            if (shouldCopy)
                inputDir = parse(input).dir;
        },
        transform,
        writeBundle: async (bundleOptions, bundle) => {
            if (shouldCopy) {
                const copyHTML = options.copyHTML === true ? `${inputDir}/**/*.html` : options.copyHTML;
                const glob = globbySync(copyHTML);
                await Promise.all(glob.map(path => cp(path, join(bundleOptions.dir, path.replace(inputDir, '')))));
                if (shouldInclude) {
                    await Promise.all(glob.map(async (path) => {
                        let code = (await readFile(path.replace(inputDir, bundleOptions.dir))).toString();
                        code = await transform(code);
                        writeFile(path.replace(inputDir, bundleOptions.dir), code);
                    }));
                }
            }
            // also run trough html when not copying
            if (!shouldCopy && shouldInclude) {
                const includeHTML = options.includeHTML === true ? `${bundleOptions.dir}/**/*.html` : options.includeHTML;
                const glob = globbySync(includeHTML);
                await Promise.all(glob.map(async (path) => {
                    let code = (await readFile(path.replace(inputDir, bundleOptions.dir))).toString();
                    code = await transform(code);
                    writeFile(path.replace(inputDir, bundleOptions.dir), code);
                }));
            }
        }
    };
};

export { materialSymbolsSvg, materialSymbolsFont as materialSymbolsfont, variants };

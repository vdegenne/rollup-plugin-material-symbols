import {constants, readFile} from 'fs/promises';
import {join} from 'path';
import type {MaterialSymbolsOptions} from './types.js';
import {baseOptions} from './defaults.js';
import {env} from 'process';
import {accessSync} from 'fs';
import {createFilter} from '@rollup/pluginutils';
import type {Plugin} from 'rollup';

const createTagNameRegex = (tagName: string) =>
  new RegExp(`(?:\\@${tagName}\\-)([aA-zZ]+)`, 'g');

const injectSymbols = (
  content: string,
  symbols,
  options: MaterialSymbolsOptions,
) => {
  if (options.placeholderPrefix) {
    const regex = createTagNameRegex(options.placeholderPrefix);
    content = content.replaceAll(regex, (_, $1) => symbols[$1]);
  }

  if (options.elements) {
    for (const element of options.elements) {
      const regex = new RegExp(
        `(?!\\<${element}\\>)([aA-zZ]+)(?=\\<\\/${element}\\>)`,
        'g',
      );
      content = content.replaceAll(regex, (_, $1) => symbols[$1]);
    }
  }
  return content;
};

const getSymbols = (content: string, options: MaterialSymbolsOptions) => {
  let matches = [];
  if (options.placeholderPrefix) {
    const regex = new RegExp(
      `(?:\\@${options.placeholderPrefix}\\-)([aA-zZ]+)`,
      'g',
    );
    const _matches =
      content
        .match(regex)
        ?.map((match) => match.replace(`@${options.placeholderPrefix}-`, '')) ||
      [];
    if (_matches?.length > 0) matches = _matches;
  }
  if (options.elements) {
    for (const element of options.elements) {
      const regex = new RegExp(
        `(?!\\<${element}\\>)([aA-zZ]+)(?=\\<\\/${element}\\>)`,
        'g',
      );
      const _matches = content.match(regex);
      if (_matches?.length > 0) matches = [..._matches, ...matches];
    }
  }
  return matches;
};

const includedSymbols = {};
const symbols = [];

const materialSymbolsSvg = (options: MaterialSymbolsOptions): Plugin => {
  options = {...baseOptions, ...options};

  const filter = createFilter(options.include, options.exclude);

  const variant = options.styling.variant.toLowerCase();

  const root = `${env.npm_config_local_prefix}/node_modules/@material-symbols/svg-${options.styling.weight}`;

  const createPath = (root, symbol, fill) => {
    return join(
      join(root, variant),
      `${fill === 1 ? `${symbol}-fill` : symbol}.svg`,
    );
  };

  try {
    accessSync(root, constants.R_OK);
  } catch {
    throw new Error(`nothing found for @material-symbols/svg-${options.styling.weight}.
    note: you need to manually import`);
  }

  return {
    name: 'materialSymbols',
    transform: async (code: string, id: string) => {
      if (!filter(id)) return;
      for (const symbol of getSymbols(code, options)) {
        if (!symbols.includes(symbol)) {
          includedSymbols[symbol] = await readFile(
            createPath(root, symbol, options.styling.fill),
          );
          symbols.push(symbol);
        }
      }
      return injectSymbols(code, includedSymbols, options);
    },
  };
};

export {materialSymbolsSvg};

export default materialSymbolsSvg;

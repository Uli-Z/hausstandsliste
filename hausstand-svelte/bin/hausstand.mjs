#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { requireProjectFile } from '../src/lib/domain.js';
import { projectAt } from '../src/lib/projector.js';
import { ledgerAt } from '../src/lib/ledger.js';
import { newestFirst } from '../src/lib/eventHistory.js';
import { getVersionEntries } from '../src/lib/versionHistory.js';
import { todayISO } from '../src/lib/util.js';
import { validISODate } from '../src/lib/claimSettlement.js';

const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const commands = {
  'project validate': 'Check the supported project file structure (not a full archive or financial audit).',
  'project show': 'Return the stored project, including its embedded version history.',
  'people list': 'List people visible at the selected date.',
  'people show': 'Show a person and holdings by stable ID.',
  'items list': 'List items visible at the selected date, including archived items.',
  'items show': 'Show an item, its value and share distribution by stable ID.',
  'balances show': 'Show derived balances, claims and proposed settlement routes in integer cents.',
  'events list': 'List stored events newest first, including future events.',
  'versions list': 'List stored archive metadata, without compressed snapshot data.'
};
const help = key => [
  'Hausstandsliste CLI ' + version,
  key ? key + ': ' + commands[key] : 'Read-only local project access (first implementation stage).',
  'Usage: node bin/hausstand.mjs ' + (key || '<command>') + ' --input <file|-> [--json]',
  '', ...(key ? [] : Object.entries(commands).map(([k,v]) => '  ' + k.padEnd(18) + v)),
  '', 'Options:',
  '  --input <file|->    Read project JSON from a file or stdin.',
  '  --as-of YYYY-MM-DD  Projection date; default: today, local calendar.',
  '  --id <id>           Required for people show / items show.',
  '  --offset <n>        List offset (default 0).',
  '  --limit <n>         List page size (default 100, maximum 1000).',
  '  --json              Versioned JSON on stdout (also the default).',
  '  --help              Show command help.  --version prints the CLI version.',
  '', 'Example: node bin/hausstand.mjs balances show --input project.json --as-of 2026-11-24 --json',
  'Errors are JSON on stderr; exit 2 usage, 3 input, 4 project, 5 missing ID, 1 unexpected.',
  'No commands write files. Encrypted input is not supported yet.'
].join('\n') + '\n';
class CliError extends Error {
  constructor(code, message, status = 2) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new CliError(code, message, status); };
const listCommands = new Set(['people list','items list','events list','versions list']);
const projected = new Set(['people list','people show','items list','items show','balances show']);
const compareId = (a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
function options(args, key) {
  const result = {};
  const allowed = new Set(['--input','--json', ...(projected.has(key) ? ['--as-of'] : []),
    ...(listCommands.has(key) ? ['--offset','--limit'] : []),
    ...(['people show','items show'].includes(key) ? ['--id'] : [])]);
  while (args.length) {
    const flag = args.shift();
    if (!allowed.has(flag) || Object.hasOwn(result, flag)) fail('USAGE', 'Unknown, duplicate or inapplicable option: ' + flag);
    if (flag === '--json') { result[flag] = true; continue; }
    const value = args.shift();
    if (!value || value.startsWith('--')) fail('USAGE', 'Missing value for ' + flag);
    result[flag] = value;
  }
  if (!result['--input']) fail('USAGE','Provide --input <file|->.');
  if (result['--as-of'] && !validISODate(result['--as-of'])) fail('INVALID_DATE','Use a real date in YYYY-MM-DD format.');
  if (['people show','items show'].includes(key) && !result['--id']) fail('USAGE','Provide --id <stable-id>.');
  for (const flag of ['--offset','--limit']) {
    if (!Object.hasOwn(result,flag)) continue;
    const value = Number(result[flag]);
    if (!/^\d+$/.test(result[flag]) || !Number.isSafeInteger(value) || value < (flag === '--limit' ? 1 : 0) ||
        (flag === '--limit' && value > 1000)) fail('USAGE','Invalid ' + flag + '; use a nonnegative integer (limit 1–1000).');
    result[flag] = value;
  }
  return result;
}
async function load(path) {
  let raw;
  try {
    if (path === '-') {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      raw = Buffer.concat(chunks).toString('utf8');
    } else raw = await readFile(path,'utf8');
  } catch { fail('INPUT_READ_FAILED','Cannot read input. Check the path or stdin.',3); }
  let value;
  try { value = JSON.parse(raw); } catch { fail('INVALID_JSON','Input must contain valid JSON.',3); }
  if (typeof value?.format === 'string' && value.format.startsWith('hausstand-aesgcm'))
    fail('ENCRYPTED_UNSUPPORTED','Encrypted projects are not supported by this CLI stage. No file was changed.',4);
  try { return requireProjectFile(value); }
  catch { fail('UNSUPPORTED_PROJECT','Use a current schemaVersion 1 EUR project with portable-v1 history.',4); }
}
const page = (rows, opts) => {
  const offset = opts['--offset'] ?? 0, limit = opts['--limit'] ?? 100;
  return { total: rows.length, offset, limit, rows: rows.slice(offset, offset + limit) };
};
const cents = value => Math.round(value * 100);
const itemRow = ({id,name,status,value,shares}) => ({id,name,status,valueCents:cents(value),shares});
const personRow = ({id,name,active,totalValue}) => ({id,name,active,totalValueCents:cents(totalValue)});
function find(rows,id) {
  const row = rows.find(r => r.id === id);
  if (!row) fail('NOT_FOUND','No matching ID at the selected date.',5);
  return row;
}
async function main(args) {
  if (!args.length || (args.length === 1 && args[0] === '--help')) { process.stdout.write(help()); return; }
  if (args.length === 1 && args[0] === '--version') { process.stdout.write(version+'\n'); return; }
  const key = args.splice(0,2).join(' ');
  if (!Object.hasOwn(commands,key)) fail('USAGE','Unknown command. Run --help for available commands.');
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(help(key)); return; }
  const opts = options(args,key);
  const p = await load(opts['--input']);
  const date = opts['--as-of'] || todayISO();
  let data;
  const view = projected.has(key) && key !== 'balances show' ? projectAt(p,date) : null;
  switch (key) {
    case 'project validate': data = { valid:true, scope:'file-structure', schemaVersion:p.schemaVersion }; break;
    case 'project show': data = p; break;
    case 'people list': data = page(view.people.map(personRow).sort(compareId),opts); break;
    case 'people show': {
      const person = find(view.people,opts['--id']);
      data = {...personRow(person),holdings:person.holdings.map(h => ({
        itemId:h.item.id, units:h.units, fraction:h.fraction, valueCents:cents(h.value)
      })).sort((a,b)=>a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0)}; break;
    }
    case 'items list': data = page(view.items.map(itemRow).sort(compareId),opts); break;
    case 'items show': {
      const item = find(view.items,opts['--id']);
      data = {...itemRow(item),valuation:item.runtime.valuation,acquiredOn:item.runtime.date,
        initialValueCents:cents(item.runtime.initialValue)}; break;
    }
    case 'balances show': {
      const ledger = ledgerAt(p,date);
      const ids = [...new Set([...p.people.map(p=>p.id),...ledger.balances.keys()])].sort();
      data = {balances:ids.map(personId=>({personId,balanceCents:ledger.balances.get(personId)||0})),
        claims:ledger.claims,counterclaims:ledger.counterclaims,warnings:ledger.warnings,
        proposals:ledger.simplified, proposalsRequireAgreement:true}; break;
    }
    case 'events list': data = page(newestFirst(p.events),opts); break;
    case 'versions list': data = page(getVersionEntries(p).map(({id,savedAt,encoding,sha256})=>({id,savedAt,encoding,sha256})),opts); break;
  }
  process.stdout.write(JSON.stringify({responseVersion:1,command:key,source:projected.has(key)?'projection':'stored',
    ...(projected.has(key)?{asOfDate:date}:{}),data})+'\n');
}
try { await main(process.argv.slice(2)); }
catch (error) {
  const known = error instanceof CliError;
  process.stderr.write(JSON.stringify({responseVersion:1,error:{code:known?error.code:'UNEXPECTED',
    message:known?error.message:'Unexpected processing error. Check the project and CLI version.'}})+'\n');
  process.exitCode = known ? error.status : 1;
}

#!/usr/bin/env node
import { readFile, mkdtemp, open, link, rm } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { requireProjectFile } from '../src/lib/domain.js';
import { projectAt } from '../src/lib/projector.js';
import { ledgerAt } from '../src/lib/ledger.js';
import { newestFirst } from '../src/lib/eventHistory.js';
import { getVersionEntries, createPortableSave, readPortableVersion } from '../src/lib/versionHistory.js';
import { todayISO } from '../src/lib/util.js';
import { validISODate, createClaimSettlementEvent } from '../src/lib/claimSettlement.js';
import { projectMutationProblem } from '../src/lib/mutationValidation.js';
import { exportProject } from '../src/lib/persistence.js';
import { addPerson, renamePerson, changePersonStatus } from '../src/lib/personMutations.js';
import { deleteUnusedPerson } from '../src/lib/personDeletion.js';
import { message } from '../src/lib/i18n.js';

const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const commands = {
  'project validate': 'Check the supported project file structure (not a full archive or financial audit).',
  'project show': 'Return the stored project, including its embedded version history.',
  'people list': 'List people visible at the selected date.',
  'people add': 'Add a person with an explicit move-in date.',
  'people rename': 'Change a person’s name without rewriting historical events.',
  'people deactivate': 'Record a dated move-out; ownership and balances are unchanged.',
  'people reactivate': 'Record a dated return of a former member.',
  'people delete': 'Remove an unused person only; saving requires --confirm.',
  'people show': 'Show a person and holdings by stable ID.',
  'items list': 'List items visible at the selected date, including archived items.',
  'items show': 'Show an item, its value and share distribution by stable ID.',
  'balances show': 'Show derived balances, claims and proposed settlement routes in integer cents.',
  'events list': 'List stored events newest first, including future events.',
  'versions list': 'List stored archive metadata, without compressed snapshot data.',
  'payments record': 'Preview or explicitly save an actual payment or noncash adjustment.',
  'versions restore': 'Preview an archived project or explicitly save it as a new file.'
};
const help = key => [
  'Hausstandsliste CLI ' + version,
  key ? key + ': ' + commands[key] : 'Local project inspection and explicit, non-overwriting saves.',
  'Usage: node bin/hausstand.mjs ' + (key || '<command>') + ' --input <file|-> [--json]',
  '', ...(key ? [] : Object.entries(commands).map(([k,v]) => '  ' + k.padEnd(18) + v)),
  '', 'Options:',
  '  --input <file|->    Read project JSON from a file or stdin.',
  '  --as-of YYYY-MM-DD  Projection date; default: today, local calendar.',
  '  --id <id>           Required for people show / items show.',
  '  --offset <n>        List offset (default 0).',
  '  --limit <n>         List page size (default 100, maximum 1000).',
  '  --json              Versioned JSON on stdout (also the default).',
  '  --payload <file|->  Payment JSON: date, amountCents, debtorPersonId (payer),',
  '                     creditorPersonId (recipient), settlementKind (paid/external/waived), optional note.',
  '  --payload <file|->  Person JSON: name and date (people add), or personId and name (people rename).',
  '                     For deactivate/reactivate: personId, date, optional reason; delete: personId.',
  '  --id <id>           Archive ID for versions restore.',
  '  --dry-run           Preview without changing files (write commands).',
  '  --output <file>     Save a NEW project file; never overwrite an existing path.',
  '  --confirm           Confirm a real payment/noncash adjustment or unused-person deletion when saving.',
  '  --help              Show command help.  --version prints the CLI version.',
  '', 'Example: node bin/hausstand.mjs balances show --input project.json --as-of 2026-11-24 --json',
  'Errors are JSON on stderr; exit 2 usage, 3 input, 4 project, 5 missing ID, 1 unexpected.',
  'Example: node bin/hausstand.mjs payments record --input project.json --payload payment.json --dry-run',
  'Example: node bin/hausstand.mjs payments record --input project.json --payload payment.json --output next.json --confirm',
  'Example: node bin/hausstand.mjs versions restore --input project.json --id VERSION --dry-run',
  'Write failures exit 6. Encrypted input is not supported yet. Existing files are never overwritten.'
].join('\n') + '\n';
class CliError extends Error {
  constructor(code, message, status = 2) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new CliError(code, message, status); };
const listCommands = new Set(['people list','items list','events list','versions list']);
const statusWrites = new Set(['people deactivate','people reactivate']);
const personWrites = new Set(['people add','people rename','people delete',...statusWrites]);
const writeCommands = new Set(['payments record','versions restore',...personWrites]);
const projected = new Set(['people list','people show','items list','items show','balances show']);
const compareId = (a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
function options(args, key) {
  const result = {};
  const allowed = new Set(['--input','--json', ...(projected.has(key) ? ['--as-of'] : []),
    ...(listCommands.has(key) ? ['--offset','--limit'] : []),
    ...(['people show','items show','versions restore'].includes(key) ? ['--id'] : []),
    ...(writeCommands.has(key) ? ['--dry-run','--output'] : []),
    ...(key === 'payments record' ? ['--payload','--confirm'] : personWrites.has(key) ? ['--payload',...(key === 'people delete' ? ['--confirm'] : [])] : [])]);
  while (args.length) {
    const flag = args.shift();
    if (!allowed.has(flag) || Object.hasOwn(result, flag)) fail('USAGE', 'Unknown, duplicate or inapplicable option: ' + flag);
    if (['--json','--dry-run','--confirm'].includes(flag)) { result[flag] = true; continue; }
    const value = args.shift();
    if (!value || value.startsWith('--')) fail('USAGE', 'Missing value for ' + flag);
    result[flag] = value;
  }
  if (!result['--input']) fail('USAGE','Provide --input <file|->.');
  if (result['--as-of'] && !validISODate(result['--as-of'])) fail('INVALID_DATE','Use a real date in YYYY-MM-DD format.');
  if (['people show','items show','versions restore'].includes(key) && !result['--id']) fail('USAGE','Provide --id <stable-id>.');
  if (writeCommands.has(key)) {
    if (Boolean(result['--dry-run']) === Boolean(result['--output'])) fail('USAGE','Choose exactly one: --dry-run or --output <new-file>.');
    if (result['--output'] === '-') fail('USAGE','Use --dry-run for a stdout preview, or specify a new output file.');
  }
  if (key === 'payments record' || personWrites.has(key)) {
    if (!result['--payload']) fail('USAGE','Provide --payload <file|->.');
    if (result['--input'] === '-' && result['--payload'] === '-') fail('USAGE','Project and payload cannot both use stdin.');
  }
  if (key === 'payments record') {
    if (result['--output'] && !result['--confirm']) fail('CONFIRM_REQUIRED','Confirm that the payment or noncash adjustment actually occurred with --confirm.');
    if (result['--dry-run'] && result['--confirm']) fail('USAGE','Do not confirm a dry run.');
  }
  if (key === 'people delete') {
    if (result['--output'] && !result['--confirm']) fail('CONFIRM_REQUIRED','Confirm deletion of the unused person with --confirm.');
    if (result['--dry-run'] && result['--confirm']) fail('USAGE','Do not confirm a dry run.');
  }
  for (const flag of ['--offset','--limit']) {
    if (!Object.hasOwn(result,flag)) continue;
    const value = Number(result[flag]);
    if (!/^\d+$/.test(result[flag]) || !Number.isSafeInteger(value) || value < (flag === '--limit' ? 1 : 0) ||
        (flag === '--limit' && value > 1000)) fail('USAGE','Invalid ' + flag + '; use a nonnegative integer (limit 1–1000).');
    result[flag] = value;
  }
  return result;
}
async function readJSON(path) {
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
  return value;
}
async function load(path) {
  const value = await readJSON(path);
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
// The Node adapter owns file I/O only; hard-link publication is atomic and
// refuses existing targets, including symlinks and the input project itself.
async function publishNewFile(path, data) {
  const target = resolve(path);
  let temporary;
  try {
    temporary = await mkdtemp(join(dirname(target), '.hausstand-'));
    const staged = join(temporary, 'project.json');
    const handle = await open(staged, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(data, null, 2) + '\n', 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await link(staged, target);
  } catch (error) {
    if (error.code === 'EEXIST') fail('OUTPUT_EXISTS','Output already exists. Choose a new file; no overwrite is allowed.',6);
    fail('OUTPUT_FAILED','Cannot publish the new file. Check the directory, permissions and hard-link support.',6);
  } finally {
    if (temporary) await rm(temporary,{recursive:true,force:true}).catch(()=>{});
  }
}
function validateChange(before, after) {
  const problem = projectMutationProblem(before,after);
  if (problem) fail('MUTATION_REJECTED', message(problem.key,'en',problem.params || {}) + ' [' + problem.key + ']',4);
}
async function writeCommand(key, p, opts) {
  let working, event, person, deleted = false;
  if (key === 'payments record') {
    const payload = await readJSON(opts['--payload']);
    const allowed = ['date','amountCents','debtorPersonId','creditorPersonId','settlementKind','note'];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        Object.keys(payload).some(k=>!allowed.includes(k)) || !Object.hasOwn(payload,'settlementKind'))
      fail('INVALID_PAYLOAD','Use the documented payment fields and explicitly specify settlementKind.',4);
    try { event = createClaimSettlementEvent(p,payload); }
    catch { fail('INVALID_PAYMENT','Check payment date, positive integer cents, distinct person IDs, note and settlement kind.',4); }
    working = { ...p, events: [...p.events,event] };
  } else if (personWrites.has(key)) {
    const payload = await readJSON(opts['--payload']);
    const fields = key === 'people add' ? ['name','date'] : key === 'people rename' ? ['personId','name']
      : statusWrites.has(key) ? ['personId','date'] : ['personId'];
    const optional = statusWrites.has(key) ? ['reason'] : [];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        Object.keys(payload).some(k => ![...fields,...optional].includes(k) || typeof payload[k] !== 'string') ||
        !fields.every(k => Object.hasOwn(payload,k) && typeof payload[k] === 'string'))
      fail('INVALID_PAYLOAD','Provide the documented person fields as strings.',4);
    working = structuredClone(p);
    if (key === 'people delete') {
      person = working.people.find(p => p.id === payload.personId);
      if (!person) fail('NOT_FOUND','No matching person ID.',5);
      const result = deleteUnusedPerson(working,payload.personId);
      if (!result.allowed) fail('PERSON_IN_USE','This person has historical or other project references. Record a move-out instead.',4);
      deleted = true;
    } else {
      try {
        ({person,event} = key === 'people add' ? addPerson(working,payload)
          : key === 'people rename' ? renamePerson(working,payload)
          : changePersonStatus(working,{...payload,kind:key === 'people deactivate' ? 'deactivate' : 'reactivate'}));
      } catch (error) {
        if (error.message === 'PERSON_NOT_FOUND') fail('NOT_FOUND','No matching person ID.',5);
        if (statusWrites.has(key)) fail('INVALID_PERSON_STATUS','Choose a real date on or after move-in and a valid membership transition.',4);
        fail('INVALID_PERSON','Use a unique nonempty name and, for add, a real YYYY-MM-DD date.',4);
      }
    }
  } else {
    if (!getVersionEntries(p).some(v=>v.id===opts['--id'])) fail('NOT_FOUND','Archive version ID was not found.',5);
    try { working = requireProjectFile(await readPortableVersion(p,opts['--id'])); }
    catch { fail('INVALID_ARCHIVE','Cannot restore this archive entry. Verify its format and checksum.',4); }
  }
  validateChange(p,working);
  // Use the existing archive reader to verify all retained snapshots before
  // writing. No parallel compression/checksum implementation in this adapter.
  if (opts['--dry-run']) return {source:'working',data:{saved:false, ...(person ? {person,...(event ? {event} : {}),...(deleted ? {deleted:true} : {})} : event ? {event} : {project:working})}};
  try {
    const ids = new Set();
    for (const entry of getVersionEntries(p)) {
      if (typeof entry?.id !== 'string' || !entry.id || ids.has(entry.id)) throw Error('Invalid archive ID');
      ids.add(entry.id);
      requireProjectFile(await readPortableVersion(p,entry.id));
    }
  } catch { fail('INVALID_ARCHIVE','Existing archive cannot be verified. No file was saved.',4); }
  let saved;
  try { saved = exportProject(await createPortableSave(working,p), todayISO()); }
  catch { fail('SAVE_FAILED','Could not prepare portable project history. No file was saved.',6); }
  await publishNewFile(opts['--output'],saved);
  return {source:'saved',data:{saved:true,output:opts['--output'],lastSavedAt:saved.lastSavedAt,
    versionCount:getVersionEntries(saved).length,...(person ? {person,...(event ? {event} : {}),...(deleted ? {deleted:true} : {})} : event ? {event} : {restoredVersionId:opts['--id']})}};
}
async function main(args) {
  if (!args.length || (args.length === 1 && args[0] === '--help')) { process.stdout.write(help()); return; }
  if (args.length === 1 && args[0] === '--version') { process.stdout.write(version+'\n'); return; }
  const key = args.splice(0,2).join(' ');
  if (!Object.hasOwn(commands,key)) fail('USAGE','Unknown command. Run --help for available commands.');
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(help(key)); return; }
  const opts = options(args,key);
  const p = await load(opts['--input']);
  if (writeCommands.has(key)) {
    const result = await writeCommand(key,p,opts);
    process.stdout.write(JSON.stringify({responseVersion:1,command:key,...result})+'\n');
    return;
  }
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

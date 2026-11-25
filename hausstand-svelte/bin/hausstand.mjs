#!/usr/bin/env node
import { readFile, mkdtemp, open, link, rm, rename } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { isEncryptedEnvelope, decryptProject, encryptProject } from '../src/lib/crypto.js';
import { requireProjectFile, emptyProject } from '../src/lib/domain.js';
import { projectAt } from '../src/lib/projector.js';
import { ledgerAt } from '../src/lib/ledger.js';
import { newestFirst } from '../src/lib/eventHistory.js';
import { getVersionEntries, createPortableSave, readPortableVersion } from '../src/lib/versionHistory.js';
import { todayISO } from '../src/lib/util.js';
import { validISODate, createClaimSettlementEvent } from '../src/lib/claimSettlement.js';
import { projectMutationProblem } from '../src/lib/mutationValidation.js';
import { storedProjectProblem } from '../src/lib/projectValidation.js';
import { exportProject } from '../src/lib/persistence.js';
import { addPerson, renamePerson, changePersonStatus } from '../src/lib/personMutations.js';
import { deleteUnusedPerson } from '../src/lib/personDeletion.js';
import { addItem, updateItemMetadata, continueItem, endItem, setItemShares, executeRedistribution } from '../src/lib/itemMutations.js';
import { createItemDraft, createRedistribution, upsertDraft, removeDraft, executeDraft } from '../src/lib/draftMutations.js';
import { editEvent, removeEvent } from '../src/lib/eventMutations.js';
import { message } from '../src/lib/i18n.js';

const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const commands = {
  'project validate': 'Validate project file structure, business data and every embedded archive snapshot.',
  'project create': 'Create an empty project with a community name.',
  'project show': 'Return the stored project, including its embedded version history.',
  'people list': 'List people visible at the selected date.',
  'people add': 'Add a person without a membership start date.',
  'people rename': 'Change a person’s name without rewriting historical events.',
  'people deactivate': 'Archive a person at a date, only after all shares and the communal balance are cleared.',
  'people reactivate': 'Reactivate an archived person at a date.',
  'people delete': 'Remove an unused person only; saving requires --confirm.',
  'people show': 'Show a person and holdings by stable ID.',
  'items list': 'List items visible at the selected date, including archived items.',
  'items add': 'Add a dated item with explicit valuation, ownership and actual purchase contributions.',
  'items update': 'Update item name, tags and note.',
  'items continue': 'End an item and create its successor in one transaction.',
  'items end': 'Archive an active item at an explicit date.',
  'shares set': 'Replace an item’s share allocation at an explicit date.',
  'redistribution execute': 'Apply several share changes in one dated transaction.',
  'items show': 'Show an item, its value and share distribution by stable ID.',
  'balances show': 'Show derived balances, claims and proposed settlement routes in integer cents.',
  'events show': 'Show a stored event by its stable ID.',
  'events edit': 'Correct supported fields of a historical event; saving requires --confirm.',
  'events delete': 'Remove a stored event; saving requires --confirm.',
  'events list': 'List stored events newest first, including future events.',
  'drafts list': 'List stored drafts, including incomplete plans.',
  'drafts show': 'Read one draft by ID.',
  'drafts put': 'Create or replace an item or redistribution draft.',
  'drafts execute': 'Execute a draft with full shared validation; saving requires --confirm.',
  'drafts delete': 'Discard a draft; saving requires --confirm.',
  'versions list': 'List stored archive metadata, without compressed snapshot data.',
  'payments record': 'Preview or explicitly save an actual payment or noncash adjustment.',
  'versions restore': 'Preview an archived project or explicitly save it as a new file.',
  'skill show': 'Print the bundled agent SKILL.md verbatim.',
  'skill export': 'Export the bundled agent SKILL.md to any path.'
};
const help = key => [
  'Hausstandsliste CLI ' + version,
  key ? key + ': ' + commands[key] : 'Local project inspection and explicit, non-overwriting saves.',
  'Usage: hausstand ' + (key || '<command>') + ' [options]',
  'Agent skill: hausstand skill show | hausstand skill export --output /path/SKILL.md',
  'Skill export supports --output - (stdout) and explicit --force for replacement.',
  '', ...(key ? [] : Object.entries(commands).map(([k,v]) => '  ' + k.padEnd(18) + v)),
  '', 'Options:',
  '  --input <file|->    Read project JSON from a file or stdin.',
  '  --as-of YYYY-MM-DD  Projection date; default: today, local calendar.',
  '  --id <id>           Required for people show / items show.',
  '  --offset <n>        List offset (default 0).',
  '  --limit <n>         List page size (default 100, maximum 1000).',
  '  --search <text>     Case-insensitive list filter, applied before pagination.',
  '  --json              Versioned JSON on stdout (also the default).',
  '  --payload <file|->  Payment JSON: date, amountCents, debtorPersonId (payer),',
  '                     creditorPersonId (recipient), settlementKind (paid/external/waived), optional note.',
  '  --payload <file|->  Person JSON: name (people add), or personId and name (people rename).',
  '                     For deactivate/reactivate: personId, date, optional reason; delete: personId.',
  '  --payload <file|->  Item add/continue: name,date,initialValueCents,valuation,shares; optional tags,note.',
  '                     valuation: type (fixed/linear/degressive), minimumValueCents, durationYears or annualRate.',
  '                     add: purchaseContributionsCents (person ID → integer cents), optional settledPaymentDate; continue: itemId, optional reason.',
  '                     update: itemId,name, optional tags,note; end: itemId,date, optional reason,statusAfter.',
  '                     shares set: itemId,date,shares,financialMode (derived/none), optional note.',
  '                     redistribution execute: effectiveDate,changes [{itemId,shares}],financialMode, optional title.',
  '  --id <id>           Archive ID for versions restore, or event ID for events show/edit/delete.',
  '  events edit payload: only supported mutable fields; use integer initialValueCents and valuation.minimumValueCents.',
  '  events edit/delete require --confirm when saving. Run skill show for fields.',
  '  drafts put payload: type (item/redistribution), title, optional existing id; see skill show for fields.',
  '  drafts show/execute/delete: --id DRAFT_ID. Execute/delete require --confirm when saving.',
  '  --dry-run           Preview without changing files (write commands).',
  '  --output <file>     Save a NEW project file or a read-only JSON report; never overwrite.',
  '                     Read-only --output - uses stdout; encrypted input reports use stdout only.',
  '  --confirm           Confirm a real payment/noncash adjustment or unused-person deletion when saving.',
  '  --help              Show command help.  --version prints the CLI version.',
  '', 'Example: node bin/hausstand.mjs balances show --input project.json --as-of 2026-11-24 --json',
  'Errors are JSON on stderr; exit 2 usage, 3 input, 4 project, 5 missing ID, 1 unexpected.',
  'Example: node bin/hausstand.mjs payments record --input project.json --payload payment.json --dry-run',
  'Example: node bin/hausstand.mjs payments record --input project.json --payload payment.json --output next.json --confirm',
  'Example: node bin/hausstand.mjs versions restore --input project.json --id VERSION --dry-run',
  'Project create: --payload with {"name":"Community"}, then --dry-run or --output NEW_FILE.',
  'Encrypted files: set HAUSSTAND_PASSWORD securely in the process environment; never pass a password as an argument.',
  'Encrypted inputs stay encrypted on every save; --encrypt also protects a new/plain project output.',
  'Write failures exit 6. Existing project files are never overwritten.'
].join('\n') + '\n';
class CliError extends Error {
  constructor(code, message, status = 2) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new CliError(code, message, status); };
const listCommands = new Set(['people list','items list','events list','versions list','drafts list']);
const draftWrites = new Set(['drafts put','drafts execute','drafts delete']);
const statusWrites = new Set(['people deactivate','people reactivate']);
const personWrites = new Set(['people add','people rename','people delete',...statusWrites]);
const itemWrites = new Map([
  ['items add',addItem],['items update',updateItemMetadata],['items continue',continueItem],
  ['items end',endItem],['shares set',setItemShares],['redistribution execute',executeRedistribution]
]);
const writeCommands = new Set(['project create','payments record','versions restore','events edit','events delete',...personWrites,...itemWrites.keys(),...draftWrites]);
const projected = new Set(['people list','people show','items list','items show','balances show']);
const compareId = (a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
function options(args, key) {
  const result = {};
  const allowed = new Set(['--input','--json', ...(projected.has(key) ? ['--as-of'] : []),
    ...(listCommands.has(key) ? ['--offset','--limit','--search'] : []),
    ...(['people show','items show','versions restore','events show','events edit','events delete','drafts show','drafts execute','drafts delete'].includes(key) ? ['--id'] : []),
    ...(writeCommands.has(key) ? ['--dry-run','--output','--encrypt'] : ['--output']),
    ...(['payments record','events edit'].includes(key) ? ['--payload','--confirm'] : ['events delete','drafts execute','drafts delete'].includes(key) ? ['--confirm'] : (personWrites.has(key) || itemWrites.has(key) || key === 'project create' || key === 'drafts put') ? ['--payload',...(key === 'people delete' ? ['--confirm'] : [])] : [])]);
  while (args.length) {
    const flag = args.shift();
    if (!allowed.has(flag) || Object.hasOwn(result, flag)) fail('USAGE', 'Unknown, duplicate or inapplicable option: ' + flag);
    if (['--json','--dry-run','--confirm','--encrypt'].includes(flag)) { result[flag] = true; continue; }
    const value = args.shift();
    if (!value || value.startsWith('--')) fail('USAGE', 'Missing value for ' + flag);
    result[flag] = value;
  }
  if (key === 'project create' && result['--input']) fail('USAGE','project create does not take --input.');
  if (key !== 'project create' && !result['--input']) fail('USAGE','Provide --input <file|->.');
  if (result['--as-of'] && !validISODate(result['--as-of'])) fail('INVALID_DATE','Use a real date in YYYY-MM-DD format.');
  if (['people show','items show','versions restore','events show','events edit','events delete','drafts show','drafts execute','drafts delete'].includes(key) && !result['--id']) fail('USAGE','Provide --id <stable-id>.');
  if (writeCommands.has(key)) {
    if (Boolean(result['--dry-run']) === Boolean(result['--output'])) fail('USAGE','Choose exactly one: --dry-run or --output <new-file>.');
    if (result['--output'] === '-') fail('USAGE','Use --dry-run for a stdout preview, or specify a new output file.');
  }
  if (result['--encrypt'] && !result['--output']) fail('USAGE','--encrypt requires an explicit output file.');
  if (key === 'payments record' || key === 'events edit' || personWrites.has(key) || itemWrites.has(key) || key === 'project create' || key === 'drafts put') {
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
  if (['events edit','events delete','drafts execute','drafts delete'].includes(key)) {
    if (result['--output'] && !result['--confirm']) fail('CONFIRM_REQUIRED','Confirm the historical correction or draft execution/deletion with --confirm.');
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
function password() {
  const secret = process.env.HAUSSTAND_PASSWORD;
  if (!secret || secret.length<8) fail('PASSWORD_REQUIRED','Set HAUSSTAND_PASSWORD securely (at least 8 characters).',4);
  return secret;
}
async function load(path) {
  let value = await readJSON(path), protection = null;
  if (typeof value?.format === 'string' && value.format.startsWith('hausstand-aesgcm')) {
    if (!isEncryptedEnvelope(value)) fail('INVALID_ENVELOPE','Unsupported or invalid encrypted project format.',4);
    const secret=password();
    try {
      const result=await decryptProject(value,secret);
      protection={secret,editToken:result.editToken};
      value=result.project;
    } catch { fail('DECRYPT_FAILED','Incorrect password or damaged encrypted project.',4); }
  }
  try { return {project:requireProjectFile(value),protection}; }
  catch { fail('UNSUPPORTED_PROJECT','Use a current schemaVersion 1 EUR project with portable-v1 history.',4); }
}
async function verifyArchive(project, auditBusiness = false) {
  try {
    const ids=new Set();
    for (const entry of getVersionEntries(project)) {
      if (typeof entry?.id !== 'string' || !entry.id || ids.has(entry.id)) throw Error('Invalid archive ID');
      ids.add(entry.id);
      const snapshot = requireProjectFile(await readPortableVersion(project,entry.id));
      if (auditBusiness && storedProjectProblem(snapshot)) throw Error('Invalid archived business data');
    }
  } catch { fail('INVALID_ARCHIVE','Embedded archive cannot be verified. No file was changed.',4); }
}
async function protectedOutput(project,opts,protection) {
  if (!protection && !opts['--encrypt']) return project;
  const secret=protection?.secret || password();
  try { return await encryptProject(project,secret,protection?.editToken); }
  catch { fail('ENCRYPT_FAILED','Could not encrypt output. No file was saved.',6); }
}
const page = (rows,opts) => {
  const query=opts['--search']?.trim().toLocaleLowerCase('en');
  const filtered=query?rows.filter(row=>JSON.stringify(row).toLocaleLowerCase('en').includes(query)):rows;
  const offset=opts['--offset']??0,limit=opts['--limit']??100;
  return {total:filtered.length,offset,limit,rows:filtered.slice(offset,offset+limit)};
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
async function publishNewFile(path, data, {raw=false,force=false}={}) {
  const target = resolve(path);
  let temporary;
  try {
    temporary = await mkdtemp(join(dirname(target), '.hausstand-'));
    const staged = join(temporary, 'project.json');
    const handle = await open(staged, 'wx', 0o600);
    try { await handle.writeFile(raw ? data : JSON.stringify(data, null, 2) + '\n', 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    if (force) await rename(staged,target);
    else await link(staged, target);
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
async function writeCommand(key, p, opts, protection) {
  let working, event, person, item, ended, draft, payments, deleted = false;
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
    const fields = key === 'people add' ? ['name'] : key === 'people rename' ? ['personId','name']
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
      if (!result.allowed) fail('PERSON_IN_USE','This person has historical or other project references. Archive the person instead.',4);
      deleted = true;
    } else {
      try {
        ({person,event} = key === 'people add' ? addPerson(working,payload)
          : key === 'people rename' ? renamePerson(working,payload)
          : changePersonStatus(working,{...payload,kind:key === 'people deactivate' ? 'deactivate' : 'reactivate'}));
      } catch (error) {
        if (error.message === 'PERSON_NOT_FOUND') fail('NOT_FOUND','No matching person ID.',5);
        if (statusWrites.has(key)) fail('INVALID_PERSON_STATUS','Choose a real date and a valid archive or reactivation transition.',4);
        fail('INVALID_PERSON','Use a unique nonempty name.',4);
      }
    }
  } else if (itemWrites.has(key)) {
    const payload=await readJSON(opts['--payload']);
    const required={
      'items add':['name','date','initialValueCents','valuation','shares','purchaseContributionsCents'],
      'items update':['itemId','name'],
      'items continue':['itemId','name','date','initialValueCents','valuation','shares'],
      'items end':['itemId','date'],
      'shares set':['itemId','date','shares','financialMode'],
      'redistribution execute':['effectiveDate','changes','financialMode']
    }[key];
    const optional={
      'items add':['tags','note','settledPaymentDate'], 'items update':['tags','note'],
      'items continue':['tags','note','reason'], 'items end':['reason','statusAfter'],
      'shares set':['note'], 'redistribution execute':['title']
    }[key];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        !required.every(k=>Object.hasOwn(payload,k)) || Object.keys(payload).some(k=>![...required,...optional].includes(k)))
      fail('INVALID_PAYLOAD','See command help and skill show for required fields.',4);
    if (Object.hasOwn(payload,'initialValueCents')) {
      if (!Number.isSafeInteger(payload.initialValueCents) || payload.initialValueCents<0 ||
          !payload.valuation || !Number.isSafeInteger(payload.valuation.minimumValueCents) || payload.valuation.minimumValueCents<0 ||
          Object.keys(payload.valuation).some(k=>!['type','durationYears','annualRate','minimumValueCents'].includes(k)))
        fail('INVALID_PAYLOAD','Provide nonnegative integer initialValueCents and valuation.minimumValueCents.',4);
      payload.initialValue=payload.initialValueCents/100;
      const {minimumValueCents,...rule}=payload.valuation;
      payload.valuation={...rule,minimumValue:minimumValueCents/100};
    }
    working=structuredClone(p);
    try { ({event,item,ended,payments}=itemWrites.get(key)(working,payload)); }
    catch (error) { fail('ITEM_MUTATION_REJECTED','Check item, date, valuation, financing and ownership: '+error.message,4); }
  } else if (draftWrites.has(key)) {
    working=structuredClone(p);
    try {
      if (key==='drafts delete') { draft=removeDraft(working,opts['--id']); deleted=true; }
      else if (key==='drafts execute') {
        ({item,event}=executeDraft(working,opts['--id']));
      } else {
        const payload=await readJSON(opts['--payload']);
        if (!payload || typeof payload!=='object' || Array.isArray(payload) ||
            !['item','redistribution'].includes(payload.type) || typeof payload.title!=='string' ||
            Object.keys(payload).some(k=>!(payload.type==='item'?['type','title','id','data']:['type','title','id','effectiveDate','financialMode','changes']).includes(k)))
          fail('INVALID_PAYLOAD','See skill show for draft fields.',4);
        const old=payload.id===undefined?null:working.drafts.find(d=>d.id===payload.id);
        if (payload.id!==undefined && !old) fail('NOT_FOUND','No matching draft ID; omit id for a new draft.',5);
        if (payload.type==='item') {
          const data=payload.data;
          if (!data || typeof data!=='object' || Array.isArray(data) || !validISODate(data.effectiveDate) ||
              Object.keys(data).some(k=>!['effectiveDate','name','tags','note','initialValueCents','valuation','shares','purchaseContributionsCents'].includes(k)))
            fail('INVALID_PAYLOAD','Provide item draft data with effectiveDate.',4);
          const amount=data.initialValueCents??0, v=data.valuation??{type:'fixed',minimumValueCents:0};
          if (!Number.isSafeInteger(amount)||amount<0 || !Number.isSafeInteger(v.minimumValueCents)||v.minimumValueCents<0 ||
              Object.keys(v).some(k=>!['type','minimumValueCents','durationYears','annualRate'].includes(k)))
            fail('INVALID_PAYLOAD','Draft values use nonnegative integer cents.',4);
          const {minimumValueCents,...rule}=v;
          const {initialValueCents,valuation,...rest}=data;
          draft=createItemDraft({id:old?.id,createdAt:old?.createdAt,title:payload.title,
            data:{name:'',tags:[],note:'',shares:{},...rest,initialValue:amount/100,
              valuation:{...rule,minimumValue:minimumValueCents/100}}});
        } else {
          if (!validISODate(payload.effectiveDate) || !['none','derived'].includes(payload.financialMode) || !Array.isArray(payload.changes))
            fail('INVALID_PAYLOAD','Provide effectiveDate, financialMode and changes array.',4);
          draft={...createRedistribution(payload.title,payload.effectiveDate,payload.changes),
            financialMode:payload.financialMode,...(old?{id:old.id,createdAt:old.createdAt}:{})};
        }
        upsertDraft(working,draft);
      }
    } catch(error) {
      if (error instanceof CliError) throw error;
      if (error.message==='DRAFT_NOT_FOUND') fail('NOT_FOUND','No matching draft ID.',5);
      fail('DRAFT_MUTATION_REJECTED','Draft operation rejected: '+error.message,4);
    }
  } else if (key==='events edit' || key==='events delete') {
    working=structuredClone(p);
    try {
      if (key==='events delete') { event=removeEvent(working,opts['--id']); deleted=true; }
      else {
        const changes=await readJSON(opts['--payload']);
        if (!changes || typeof changes!=='object' || Array.isArray(changes) || !Object.keys(changes).length ||
            Object.hasOwn(changes,'initialValue')) fail('INVALID_PAYLOAD','Provide editable fields; use initialValueCents.',4);
        if (Object.hasOwn(changes,'initialValueCents')) {
          if (!Number.isSafeInteger(changes.initialValueCents)||changes.initialValueCents<0) fail('INVALID_PAYLOAD','Invalid initialValueCents.',4);
          changes.initialValue=changes.initialValueCents/100; delete changes.initialValueCents;
        }
        if (Object.hasOwn(changes,'valuation')) {
          const v=changes.valuation;
          if (!v || !Number.isSafeInteger(v.minimumValueCents)||v.minimumValueCents<0 ||
              Object.keys(v).some(k=>!['type','minimumValueCents','durationYears','annualRate'].includes(k)))
            fail('INVALID_PAYLOAD','Provide the complete valuation including minimumValueCents.',4);
          const {minimumValueCents,...rule}=v;
          changes.valuation={...rule,minimumValue:minimumValueCents/100};
        }
        event=editEvent(working,opts['--id'],changes);
      }
    } catch (error) {
      if (error instanceof CliError) throw error;
      if (error.message==='EVENT_NOT_FOUND') fail('NOT_FOUND','No matching event ID.',5);
      fail('EVENT_MUTATION_REJECTED','Historical correction rejected: '+error.message,4);
    }
  } else {
    if (!getVersionEntries(p).some(v=>v.id===opts['--id'])) fail('NOT_FOUND','Archive version ID was not found.',5);
    try { working = requireProjectFile(await readPortableVersion(p,opts['--id'])); }
    catch { fail('INVALID_ARCHIVE','Cannot restore this archive entry. Verify its format and checksum.',4); }
  }
  if (key==='versions restore') {
    const problem=storedProjectProblem(working);
    if (problem) fail('MUTATION_REJECTED',problem,4);
  } else validateChange(p,working);
  // Use the existing archive reader to verify all retained snapshots before
  // writing. No parallel compression/checksum implementation in this adapter.
  if (opts['--dry-run']) return {source:'working',data:{saved:false, ...(draft ? {draft,...(deleted?{deleted:true}:{})} : item ? {item,...(event?{event}:{}),...(ended?{ended}:{}),...(payments?{payments}:{})} : person ? {person,...(event ? {event} : {}),...(deleted ? {deleted:true} : {})} : event ? {event,...(deleted?{deleted:true}:{})} : {project:working})}};
  await verifyArchive(p);
  let saved;
  try { saved = exportProject(await createPortableSave(working,p), todayISO()); }
  catch { fail('SAVE_FAILED','Could not prepare portable project history. No file was saved.',6); }
  const output=await protectedOutput(saved,opts,protection);
  await publishNewFile(opts['--output'],output);
  return {source:'saved',data:{saved:true,output:opts['--output'],lastSavedAt:saved.lastSavedAt,
    versionCount:getVersionEntries(saved).length,encrypted:!!(protection || opts['--encrypt']),...(draft ? {draft,...(deleted?{deleted:true}:{})} : item ? {item,...(event?{event}:{}),...(ended?{ended}:{}),...(payments?{payments}:{})} : person ? {person,...(event ? {event} : {}),...(deleted ? {deleted:true} : {})} : event ? {event,...(deleted?{deleted:true}:{})} : {restoredVersionId:opts['--id']})}};
}
async function skillCommand(args) {
  const usage='hausstand skill show | hausstand skill export --output <path|-> [--force]';
  if (!args.length || args[0]==='--help' || (args.length===2 && args[1]==='--help' && ['show','export'].includes(args[0]))) {
    process.stdout.write(usage+'\nPrint or export the bundled SKILL.md verbatim; existing targets are protected unless --force is explicit.\n');return;
  }
  const command=args.shift();
  let output,force=false;
  if (command==='show' && args.length===0) output='-';
  else if (command==='export') {
    while (args.length) {
      const flag=args.shift();
      if (flag==='--output' && output===undefined) {
        output=args.shift();
        if (!output || output.startsWith('--')) fail('USAGE',usage);
      } else if (flag==='--force' && !force) force=true;
      else fail('USAGE',usage);
    }
    if (!output || (output==='-' && force)) fail('USAGE',usage);
  } else fail('USAGE',usage);
  const content=await readFile(new URL('../skills/hausstandsliste-cli/SKILL.md',import.meta.url));
  if (output==='-') process.stdout.write(content);
  else await publishNewFile(output,content,{raw:true,force});
}
async function createProject(opts) {
  const payload=await readJSON(opts['--payload']);
  if (!payload || typeof payload.name!=='string' || !payload.name.trim() || Object.keys(payload).length!==1)
    fail('INVALID_PAYLOAD','Provide a nonempty community name.',4);
  const project={...emptyProject(),community:{name:payload.name}};
  if (opts['--dry-run']) return {source:'working',data:{saved:false,project}};
  const saved=exportProject(await createPortableSave(project,null),todayISO());
  await publishNewFile(opts['--output'],await protectedOutput(saved,opts,null));
  return {source:'saved',data:{saved:true,output:opts['--output'],lastSavedAt:saved.lastSavedAt,versionCount:0,encrypted:!!opts['--encrypt']}};
}
async function main(args) {
  if (args[0]==='skill') { await skillCommand(args.slice(1)); return; }
  if (!args.length || (args.length === 1 && args[0] === '--help')) { process.stdout.write(help()); return; }
  if (args.length === 1 && args[0] === '--version') { process.stdout.write(version+'\n'); return; }
  const key = args.splice(0,2).join(' ');
  if (!Object.hasOwn(commands,key)) fail('USAGE','Unknown command. Run --help for available commands.');
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(help(key)); return; }
  const opts = options(args,key);
  if (key==='project create') {
    const result=await createProject(opts);
    process.stdout.write(JSON.stringify({responseVersion:1,command:key,...result})+'\n');return;
  }
  const {project:p,protection}=await load(opts['--input']);
  if (writeCommands.has(key)) {
    const result = await writeCommand(key,p,opts,protection);
    process.stdout.write(JSON.stringify({responseVersion:1,command:key,...result})+'\n');
    return;
  }
  const date = opts['--as-of'] || todayISO();
  let data;
  const view = projected.has(key) && key !== 'balances show' ? projectAt(p,date) : null;
  switch (key) {
    case 'project validate': {
      const problem = storedProjectProblem(p);
      if (problem) fail('INVALID_BUSINESS_DATA','Stored project failed business validation: '+problem+'. No file was changed.',4);
      await verifyArchive(p,true);
      data = { valid:true, scope:'file-and-archive', businessValidated:true, schemaVersion:p.schemaVersion, encrypted:!!protection }; break;
    }
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
    case 'events show': data=find(p.events,opts['--id']); break;
    case 'events list': data = page(newestFirst(p.events),opts); break;
    case 'drafts show': data=find(p.drafts,opts['--id']); break;
    case 'drafts list': data=page([...p.drafts].sort(compareId),opts); break;
    case 'versions list': data = page(getVersionEntries(p).map(({id,savedAt,encoding,sha256})=>({id,savedAt,encoding,sha256})),opts); break;
  }
  const response={responseVersion:1,command:key,source:projected.has(key)?'projection':'stored',
    ...(projected.has(key)?{asOfDate:date}:{}),data};
  if (opts['--output'] && opts['--output']!=='-') {
    if (protection) fail('PLAINTEXT_OUTPUT_REFUSED','Encrypted input reports may only be emitted to stdout; no plaintext file was saved.',4);
    await publishNewFile(opts['--output'],response);
  }
  process.stdout.write(JSON.stringify(response)+'\n');
}
try { await main(process.argv.slice(2)); }
catch (error) {
  const known = error instanceof CliError;
  process.stderr.write(JSON.stringify({responseVersion:1,error:{code:known?error.code:'UNEXPECTED',
    message:known?error.message:'Unexpected processing error. Check the project and CLI version.'}})+'\n');
  process.exitCode = known ? error.status : 1;
}

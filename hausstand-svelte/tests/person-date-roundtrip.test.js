import test from 'node:test';
import assert from 'node:assert/strict';
import { addPerson } from '../src/lib/personMutations.js';
import { emptyProject, normalize, requireProjectFile } from '../src/lib/domain.js';
import { todayISO } from '../src/lib/util.js';
import { exportProject, saveWorkingCopy, loadWorkingCopy } from '../src/lib/persistence.js';
import { createPortableSave, readPortableVersion } from '../src/lib/versionHistory.js';
import { encryptProject, decryptProject } from '../src/lib/crypto.js';
import { projectAt } from '../src/lib/projector.js';
import { ledgerAt } from '../src/lib/ledger.js';

test('Q60: explicit creation dates survive file, cache, archive and encrypted transport', async () => {
  const p=emptyProject();
  const dates=['2001-02-03', todayISO(), '2099-12-31'];
  const created=dates.map((date,i)=>addPerson(p,{name:'Person '+i,date}));
  assert.deepEqual(p.events.map(e=>e.date),dates);
  const saved=exportProject(await createPortableSave(p,null),todayISO());
  const reopened=normalize(requireProjectFile(JSON.parse(JSON.stringify(saved))));
  assert.deepEqual(reopened.events,saved.events);
  const next=exportProject(await createPortableSave({...reopened,community:{name:'Renamed'}},saved),todayISO());
  const restored=await readPortableVersion(next,next.versionHistory.entries[0].id);
  const encrypted=await encryptProject(next,'valid-test-password');
  const decrypted=normalize(requireProjectFile((await decryptProject(encrypted,'valid-test-password')).project));
  const oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const data=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>data.get(key)??null,setItem:(key,val)=>data.set(key,val)}});
  try {
    saveWorkingCopy({project:next,savedProject:saved,dirty:false});
    const cached=loadWorkingCopy();
    for (const copy of [reopened,restored,decrypted,normalize(cached.project),normalize(cached.savedProject)]) {
      assert.deepEqual(copy.events,saved.events);
      for(const at of ['2001-02-02','2001-02-03','2099-12-31']) {
        assert.deepEqual(projectAt(copy,at).people.map(p=>[p.id,p.active,p.totalValue]),projectAt(saved,at).people.map(p=>[p.id,p.active,p.totalValue]));
        assert.deepEqual(ledgerAt(copy,at).balances,ledgerAt(saved,at).balances);
      }
    }
  } finally {
    if(oldStorage) Object.defineProperty(globalThis,'localStorage',oldStorage);
    else delete globalThis.localStorage;
  }
  // Q60: entry date controls membership visibility, not ownership.
  assert.equal(projectAt(restored,'1900-01-01').peopleById.get(created[0].person.id).active,false);
});

test('Q60: today is only a creation default; invalid dates do not mutate the project',()=>{
  const p=emptyProject();
  assert.equal(addPerson(p,{name:'Default'}).event.date,todayISO());
  const original=structuredClone(p);
  for(const date of ['',null,'2026-02-30','not-a-date']) {
    assert.throws(()=>addPerson(p,{name:'Invalid',date}),/INVALID_PERSON_DATE/);
    assert.deepEqual(p,original);
  }
});

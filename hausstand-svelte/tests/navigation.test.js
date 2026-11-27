import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { appState } from '../src/stores/projectStore.js';
import { routeHash, routeFromHash, availableRoute, connectRouteHistory } from '../src/lib/navigation.js';

const cache=new Map();
globalThis.localStorage={setItem:(k,v)=>cache.set(k,v),getItem:k=>cache.get(k)||null,removeItem:k=>cache.delete(k)};

const project={schemaVersion:1,currency:'EUR',community:{name:'Routing'},people:[{id:'a / ü',name:'Anna'}],items:[],events:[],drafts:[]};
function mockBrowser(initialHash='') {
  const listeners=new Map();
  let entries=[{hash:initialHash,state:null}], index=0;
  const browser={
    location:{get hash(){return entries[index].hash;}},
    history:{
      get state(){return entries[index].state;},
      pushState(state,_,hash){entries=entries.slice(0,index+1);entries.push({hash,state});index++;},
      replaceState(state,_,hash){entries[index]={hash,state};},
      back(){if(index>0){index--;emit('popstate');emit('hashchange');}},
      forward(){if(index+1<entries.length){index++;emit('popstate');emit('hashchange');}},
    },
    addEventListener(name,fn){listeners.set(name,fn);},
    removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);},
    get length(){return entries.length;},
    get listeners(){return listeners.size;}
  };
  function emit(name){listeners.get(name)?.();}
  return browser;
}
test('Q64: every section roundtrips; IDs are escaped; malformed routes fail safely',()=>{
  for(const section of ['overview','items','people','money','activity','save','settings']){
    const route={page:'dashboard',section};
    assert.deepEqual(routeFromHash(routeHash(route)),route);
  }
  for(const page of ['item','person']){
    const route={page,id:'a / ü #?%',section:'activity'};
    assert.deepEqual(routeFromHash(routeHash(route),'activity'),route);
  }
  assert.deepEqual(routeFromHash('#/people/%XX'),{page:'dashboard',section:'people'});
  assert.deepEqual(routeFromHash('#/nonsense'),{page:'dashboard',section:'overview'});
  assert.deepEqual(availableRoute(routeFromHash('#/items/missing'),project),{page:'dashboard',section:'items'});
});
test('Q64: browser history changes views only, preserves drafts, Undo/Redo, date and permissions',()=>{
  appState.importProject(project);
  appState.renameHousehold('Unsaved');
  appState.setAsOfDate('2025-04-03');
  appState.setReadOnly(true);
  const browser=mockBrowser();
  const disconnect=connectRouteHistory(browser,appState);
  try {
    assert.equal(browser.location.hash,'#/overview');
    const before=get(appState), log=appState.sessionLog();
    appState.setRoute({page:'dashboard',section:'people'});
    appState.setRoute({page:'person',id:'a / ü'});
    assert.equal(browser.location.hash,'#/people/a%20%2F%20%C3%BC');
    assert.equal(browser.length,3);
    appState.setRoute({page:'person',id:'a / ü'});
    assert.equal(browser.length,3);
    browser.history.back();
    assert.deepEqual(get(appState).route,{page:'dashboard',section:'people'});
    browser.history.back();
    assert.equal(get(appState).route.section,'overview');
    browser.history.forward();browser.history.forward();
    assert.equal(get(appState).route.id,'a / ü');
    for(const key of ['project','savedProject','dirty','history','asOfDate','timeTravelActive','readOnly','secure'])
      assert.deepEqual(get(appState)[key],before[key],key);
    assert.deepEqual(appState.sessionLog(),log);
  } finally {disconnect();appState.setReadOnly(false);}
  assert.equal(browser.listeners,0);
});
test('Q64: initial deep link and unavailable ID replace the initial entry, no duplicate pushes',()=>{
  appState.importProject(project);
  for(const [hash,expected,page] of [
    ['#/people/a%20%2F%20%C3%BC','#/people/a%20%2F%20%C3%BC','person'],
    ['#/items/unknown','#/items','dashboard'],
    ['#/invalid','#/overview','dashboard']
  ]){
    const browser=mockBrowser(hash);
    const disconnect=connectRouteHistory(browser,appState);
    try{
      assert.equal(browser.location.hash,expected);
      assert.equal(get(appState).route.page,page);
      assert.equal(browser.length,1);
    }finally{disconnect();}
  }
});

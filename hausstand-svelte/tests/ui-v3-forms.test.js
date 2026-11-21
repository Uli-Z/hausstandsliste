import test from 'node:test';
import assert from 'node:assert/strict';
import { isEnterForSubmit, prepareDialogNumber, finishDialogNumber, parseShareInput } from '../ui-v3/form-behavior.js';

const key = (tagName='INPUT', type='text', modifiers={}) => ({key:'Enter',target:{tagName,type},...modifiers});
test('Enter submits ordinary inputs, not multiline or special controls',()=>{
  assert.equal(isEnterForSubmit(key()),true);
  assert.equal(isEnterForSubmit(key('INPUT','number')),true);
  assert.equal(isEnterForSubmit(key('INPUT','date')),false);
  assert.equal(isEnterForSubmit(key('TEXTAREA','text')),false);
  assert.equal(isEnterForSubmit(key('INPUT','text',{isComposing:true})),false);
  assert.equal(isEnterForSubmit(key('INPUT','text',{ctrlKey:true})),false);
  assert.equal(isEnterForSubmit(key('INPUT','text',{repeat:true})),false);
});
test('zero is removed on focus and restored only if no new value was typed',()=>{
  const field={tagName:'INPUT',type:'number',value:'0',dataset:{},closest:()=>true,events:[],dispatchEvent(e){this.events.push(e.type)}};
  prepareDialogNumber({target:field});
  assert.equal(field.value,'');
  assert.deepEqual(field.events,['input']);
  finishDialogNumber({target:field});
  assert.equal(field.value,'0');
  assert.deepEqual(field.events,['input','input']);
  prepareDialogNumber({target:field});
  field.value='27.5';
  finishDialogNumber({target:field});
  assert.equal(field.value,'27.5');
});
test('share entry can stay empty while typing, without turning into zero',()=>{
  assert.equal(parseShareInput(''),null);
  assert.equal(parseShareInput('0'),0);
  assert.equal(parseShareInput('0.5'),0.5);
  assert.equal(parseShareInput('2'),2);
  assert.equal(parseShareInput('foo'),null);
});

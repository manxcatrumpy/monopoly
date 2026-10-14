const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('../game-state.js');
const { create } = require('../storage.js');

function fixture(raw) {
  const data = new Map(raw === undefined ? [] : [['save',raw]]);
  const writes = [];
  let fail = null;
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem(key,value) {
      if (key === fail) throw new Error('Quota exceeded');
      writes.push(key);
      data.set(key,value);
    },
  };
  return {data,writes,fail:key=>{fail=key;},adapter:create({storage,key:'save',model,options:()=>({now:1700000000000})})};
}

test('legacy data is backed up before a migrated state overwrites it', () => {
  const original = JSON.stringify({players:[],roundNum:3});
  const f = fixture(original);
  const loaded = f.adapter.read();
  assert.equal(loaded.status,'loaded');
  assert.equal(f.adapter.write(loaded.state).ok,true);
  assert.deepEqual(f.writes,['save-backup','save']);
  assert.equal(f.data.get('save-backup'),original);
  assert.equal(JSON.parse(f.data.get('save')).schemaVersion,2);
});

test('failed migration backup leaves the original intact and can retry', () => {
  const original = JSON.stringify({players:[]});
  const f = fixture(original);
  const loaded = f.adapter.read();
  f.fail('save-backup');
  assert.equal(f.adapter.write(loaded.state).ok,false);
  assert.equal(f.data.get('save'),original);
  f.fail(null);
  assert.equal(f.adapter.write(loaded.state).ok,true);
  assert.equal(f.data.get('save-backup'),original);
});

test('invalid or newer saves cannot be overwritten automatically', () => {
  for (const original of ['{broken',JSON.stringify({schemaVersion:99})]) {
    const f = fixture(original);
    assert.equal(f.adapter.read().status,'invalid');
    assert.equal(f.adapter.blocked,true);
    assert.equal(f.adapter.write(model.createState()).ok,false);
    assert.equal(f.data.get('save'),original);
    assert.equal(f.adapter.replaceUnreadable().ok,true);
    assert.equal(f.data.get('save-backup'),original);
    assert.equal(f.adapter.write(model.createState()).ok,true);
  }
});

test('failed save returns an error without discarding the last successful save', () => {
  const original = JSON.stringify(model.createState());
  const f = fixture(original);
  const loaded = f.adapter.read();
  loaded.state.currentGame.roundNum=2;
  f.fail('save');
  assert.equal(f.adapter.write(loaded.state).ok,false);
  assert.equal(f.data.get('save'),original);
  f.fail(null);
  assert.equal(f.adapter.write(loaded.state).ok,true);
  assert.equal(JSON.parse(f.data.get('save')).currentGame.roundNum,2);
});

test('read errors and failed recovery backups never authorize destructive replacement', () => {
  const f = fixture('{broken');
  f.adapter.read();
  f.fail('save-backup');
  assert.equal(f.adapter.replaceUnreadable().ok,false);
  assert.equal(f.adapter.blocked,true);
  assert.equal(f.data.get('save'),'{broken');
  const adapter = create({storage:{getItem(){throw new Error('Denied');}},key:'save',model,options:()=>({})});
  assert.equal(adapter.read().status,'invalid');
  assert.equal(adapter.write(model.createState()).ok,false);
});

test('legacy storage keys are copied to the new key while the original remains intact', () => {
  const original = JSON.stringify({players:[],roundNum:3});
  const data = new Map([['old',original]]);
  const storage = {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const adapter = create({storage,key:'new',legacyKey:'old',model,options:()=>({now:1700000000000})});
  const loaded = adapter.read();
  assert.equal(adapter.write(loaded.state).ok,true);
  assert.equal(data.get('old'),original);
  assert.equal(data.get('new-backup'),original);
  assert.equal(JSON.parse(data.get('new')).currentGame.roundNum,3);
});

test('new storage takes precedence and damaged new data never falls back to stale legacy data', () => {
  const data = new Map([['new','{broken'],['old',JSON.stringify({players:[]})]]);
  const storage = {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const adapter = create({storage,key:'new',legacyKey:'old',model,options:()=>({})});
  assert.equal(adapter.read().status,'invalid');
  assert.equal(adapter.blocked,true);
  data.set('new',model.serialize(model.createState()));
  assert.equal(adapter.read().status,'loaded');
  assert.equal(adapter.blocked,false);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserBackup,parseBackup,STATE_KEY,OLD_STATE_KEY} from '../app/data-backup.ts';
const state=()=>({events:[{id:'habit',name:'阅读',type:'habit',category:'学习',tags:['书'],totalMs:1000,metricRecords:[{value:50,at:'2026-10-14T08:00:00Z'}],completionRecords:['2026-10-14T08:00:00Z']}],segments:[{id:'segment',eventId:'habit',eventName:'阅读',eventType:'habit',start:'2026-10-14T07:00:00Z',end:'2026-10-14T08:00:00Z',durationMs:3600000}],activeEventId:'habit',activeStartedAt:'2026-10-14T09:00:00Z',categories:[{name:'学习',color:'#6366f1'}],tags:['书'],trendMode:'habit'});
test('export is read-only and preserves all trac keys plus exact original data',()=>{
  const values=new Map([[STATE_KEY,JSON.stringify(state())],[OLD_STATE_KEY,'old-backup'],['trac-extra','kept'],['unrelated','private']]);
  const backup=createBrowserBackup({length:values.size,key:index=>[...values.keys()][index],getItem:key=>values.get(key)??null},state(),100);
  assert.deepEqual(parseBackup(JSON.stringify(backup)).state,state());assert.equal(backup.storage['trac-extra'],'kept');assert.equal(backup.storage.unrelated,undefined);assert.equal(values.get(OLD_STATE_KEY),'old-backup');
});
test('raw v1/v2 snapshots and backup envelopes are accepted without deleting seed segments',()=>{
  assert.deepEqual(parseBackup(JSON.stringify(state())).state,state());
  const backup={format:'trac-backup',version:1,source:'browser',storage:{[OLD_STATE_KEY]:JSON.stringify(state())}};
  assert.equal(parseBackup(JSON.stringify(backup)).state.segments.length,1);
});
test('corrupt JSON, unknown versions, missing fields and duplicate IDs fail preview',()=>{
  assert.throws(()=>parseBackup('{'));assert.throws(()=>parseBackup('{}'));
  assert.throws(()=>parseBackup(JSON.stringify({format:'trac-backup',version:99})));
  assert.throws(()=>parseBackup(JSON.stringify({...state(),events:[...state().events,...state().events]})));
});
test('invalid active reference and metric timestamp cannot overwrite browser data',()=>{
  assert.throws(()=>parseBackup(JSON.stringify({...state(),activeEventId:'missing'})));
  assert.throws(()=>parseBackup(JSON.stringify({...state(),events:[{...state().events[0],metricRecords:[{value:50,at:'broken'}]}]})));
});

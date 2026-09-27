import test from 'node:test';
import assert from 'node:assert/strict';
import {decode,encode,reconcile} from '../public/protocol.mjs';
const bytes=Uint8Array.from('01 02 07 00 00 00 0c 00 00 00 3c 00 00 00 0a 00 00 00 02 00'.split(' ').map(s=>parseInt(s,16)));
const sample={session_id:7,protocol_version:1,state:'upright',sequence:12,tracked_seconds:60,slouch_seconds:10,episode_count:2};
test('published BLE fixture and uint32 boundary round trip',()=>{assert.deepEqual(decode(bytes.buffer),sample);assert.deepEqual(decode(encode({...sample,session_id:4294967295})),{...sample,session_id:4294967295});});
test('invalid lengths versions states counters',()=>{assert.throws(()=>decode(new ArrayBuffer(19)));for(const [offset,value] of [[0,2],[1,9]]){const copy=bytes.slice();copy[offset]=value;assert.throws(()=>decode(copy.buffer));}assert.throws(()=>decode(encode({...sample,slouch_seconds:61})));});
test('ordering does not inflate or regress readings',()=>{assert.equal(reconcile(sample,sample),'duplicate');assert.equal(reconcile(sample,{...sample,sequence:11}),'stale');assert.throws(()=>reconcile(sample,{...sample,slouch_seconds:11}));assert.throws(()=>reconcile(sample,{...sample,sequence:13,tracked_seconds:59}));assert.throws(()=>reconcile({...sample,state:'ended'},{...sample,sequence:13}));});

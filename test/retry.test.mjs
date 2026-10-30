import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkWithRetry} from '../src/retry.mjs';
test('retries an unknown result once with a fresh check', async () => {
  let calls=0;
  const result=await checkWithRetry(async()=>({status:++calls===1?'unknown':'unavailable'}),Date.now()+120000,async()=>{});
  assert.equal(calls,2); assert.equal(result.status,'unavailable');
});
test('does not retry definite results or exhaust the run deadline', async () => {
  for (const status of ['available','unavailable','unknown']) {
    let calls=0;
    await checkWithRetry(async()=>{calls++;return {status};},Date.now(),async()=>{});
    assert.equal(calls,1);
  }
});
test('persistent unknown remains unknown after only two attempts', async () => {
  let calls=0;
  const result=await checkWithRetry(async()=>{calls++;return {status:'unknown'};},Date.now()+120000,async()=>{});
  assert.equal(calls,2); assert.equal(result.status,'unknown');
});

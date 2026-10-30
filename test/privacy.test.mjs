import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readZipCodes, publicResults} from '../src/privacy.mjs';
test('ZIP secret requires two distinct codes and preserves leading zeros', () => {
  assert.deepEqual(readZipCodes('00001, 00002'), ['00001','00002']);
  for (const value of ['', '00001', '00001,00001', '00001,abcde', '00001,00002,00003'])
    assert.throws(()=>readZipCodes(value), /Set ZIP_CODES/);
});
test('public report drops location-bearing fields and raw errors', () => {
  const results = publicResults([
    {zip:'00001',variant:'White 256GB',status:'available',sku:'123',stores:[{name:'Private Town',address:'Secret Street'}]},
    {zip:'00002',variant:'Black 256GB',status:'unknown',error:'Search failed for 00002 at Secret Street'}
  ],['00001','00002']);
  const json = JSON.stringify(results);
  for (const sensitive of ['00001','00002','Private Town','Secret Street','stores','sku']) assert.ok(!json.includes(sensitive));
  assert.equal(results[0].location,'Location 1');
  assert.equal(results[1].location,'Location 2');
});

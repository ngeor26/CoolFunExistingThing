import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, notification } from '../src/stock.mjs';
import { push } from '../src/pushover.mjs';
test('only completed pickup results with explicit stock can trigger alerts', () => {
  const rows = [{name:'Store', address:'123 Street', status:'In Stock'}];
  assert.equal(classify({rows}).status,'unknown');
  assert.equal(classify({rows,complete:true}).status,'available');
  assert.equal(classify({rows,complete:true,text:'technical issue'}).status,'unknown');
  assert.equal(classify({rows:[{status:'Out of stock'}],complete:true}).status,'unknown');
  assert.equal(classify({rows:[{status:'Hurry, only a few left'}],complete:true}).status,'available');
});
test('empty, loading and marketing text never imply availability or unavailability', () => {
  for (const text of ['', 'Loading', 'In stock', 'Get it shipped tomorrow'])
    assert.equal(classify({text,complete:true}).status,'unknown');
  assert.equal(classify({complete:true,text:"The chosen item isn't available for pickup at stores within 20 miles"}).status,'unavailable');
});
test('notification includes ZIP, variant and store; unknown results stay quiet', () => {
  assert.equal(notification([{status:'unknown'}]),null);
  assert.match(notification([{status:'available',zip:'00001',variant:'White 256GB',stores:[{name:'Shop',address:'Main St',status:'In Stock'}]}]),/00001: White 256GB\nShop/);
});
test('Pushover errors are not reported as successful delivery', async () => {
  process.env.PUSHOVER_APP_TOKEN='test'; process.env.PUSHOVER_USER_KEY='test';
  await assert.rejects(push('test','test',async () => ({ok:true,status:200,json:async()=>({status:0})})), /rejected/);
  let sent;
  await push('test','test',async (url,opts) => {sent={url,opts};return {ok:true,status:200,json:async()=>({status:1})};});
  assert.equal(sent.opts.body.get('user'),'test');
  assert.equal(sent.url,'https://api.pushover.net/1/messages.json');
});

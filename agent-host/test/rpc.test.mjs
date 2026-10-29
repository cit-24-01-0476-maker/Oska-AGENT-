import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {Rpc} from '../rpc.mjs';
test('real subprocess transport preserves unicode and refuses native permission requests (fixture)',async()=>{
  const rpc=new Rpc(process.execPath,[fileURLToPath(new URL('./rpc-fixture.mjs',import.meta.url))]);
  try{assert.deepEqual(await rpc.request('echo',{text:'\u0dc3\u0dd2\u0d82\u0dc4\u0dbd'}),{text:'\u0dc3\u0dd2\u0d82\u0dc4\u0dbd'});const notification=once(rpc,'notification');await rpc.request('permission');assert.deepEqual((await notification)[0].params,{outcome:{outcome:'cancelled'}});}finally{rpc.close();}
});

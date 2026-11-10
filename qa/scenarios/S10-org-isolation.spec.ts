import { expect } from '../lib/fixtures.js';
import { securityTest as test } from '../lib/ext/t04.js';
import { io } from 'socket.io-client';
import { narrate } from '../lib/overlay.js';
import { TruthSocket, topic } from '../lib/socket.js';
for(const identity of ['evil','missing'] as const) test(`S10 @security ${identity} org cannot read FlytBase fleet and telemetry`,async({page,api,cockpit,appLock},info)=>{
 await cockpit.open(); await narrate(page,`S10: ${identity} org must not receive FlytBase private fleet or telemetry`);
 const fleet=await api.devices(); const drone=fleet.devices.find(d=>d.type==='drone')!;
 const telemetry=topic(drone.id,'battery'); const valid=new TruthSocket('flytbase',api.baseURL);
 // Explicit empty auth: TruthSocket(undefined) has a default parameter and would accidentally send flytbase.
 const unauthorized=io(api.baseURL,{autoConnect:false,reconnection:false,auth:identity==='missing'?{}:{'org-id':identity}});
 const received:Record<string,unknown>={}; unauthorized.onAny((event,payload)=>{received[event]=payload;});
 try {
  await valid.connect(); await valid.waitFor('devices'); await valid.waitFor(telemetry);
  const result=await new Promise<string>(resolve=>{
   const timer=setTimeout(()=>resolve('observation complete'),2500);
   unauthorized.once('connect_error',()=>{clearTimeout(timer);resolve('refused');});
   unauthorized.once('connect',()=>{unauthorized.emit('Subscribe',{topic:'devices'});unauthorized.emit('Subscribe',{topic:telemetry});unauthorized.emit('Subscribe',{topic:topic(drone.id,'battery','another-org')});});
   unauthorized.connect();
  });
  await info.attach('org-probe.json',{body:JSON.stringify({identity,result,received},null,2),contentType:'application/json'});
  const leaked=Object.keys(received).filter(t=>t==='devices'||t.startsWith('flytbase/'));
  await page.evaluate(({identity,received})=>{const proof=document.createElement('pre');proof.id='org-isolation-proof';proof.textContent=`CLIENT org-id: ${identity}\nEXPECTED: refused or no FlytBase topics\nACTUAL RECEIVED:\n${JSON.stringify(received,null,2)}`;Object.assign(proof.style,{position:'fixed',bottom:'12px',right:'12px',width:'min(600px,90vw)',maxHeight:'45vh',overflow:'auto',background:'#101827',color:'#fff',padding:'14px',zIndex:'2147483646',font:'13px monospace'});document.body.appendChild(proof);},{identity,received});
  await narrate(page,`S10 FAILED: ${identity} org received ${leaked.length} forbidden topics; expected no FlytBase fleet/telemetry`);
  expect(leaked,`Organization isolation broken: ${identity} org receives FlytBase fleet/telemetry (${leaked.join(', ')})`).toEqual([]);
 } finally {valid.close();unauthorized.disconnect();unauthorized.removeAllListeners();}
});

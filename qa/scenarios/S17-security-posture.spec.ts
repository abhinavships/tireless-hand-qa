import {expect} from '../lib/fixtures.js';
import {securityTest as test} from '../lib/ext/t04.js';
import {narrate} from '../lib/overlay.js';
test('S17 @security @advisory localhost security posture inventory',async({page,request,api,appLock},info)=>{
 const inventory=[];
 for(const url of ['http://localhost:4010/',`${api.baseURL}/dashboard`]){const response=await request.get(url);const headers=response.headers();inventory.push({url,status:response.status(),csp:headers['content-security-policy']??null,xFrameOptions:headers['x-frame-options']??null});}
 const preflight=await request.fetch(`${api.baseURL}/api/control/command`,{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:4010','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
 // Invalid body is rejected before any command; inspect actual POST CORS without changing the simulator.
 const invalidPost=await request.post(`${api.baseURL}/api/control/command`,{data:{},headers:{Origin:'http://127.0.0.1:4010'}});
 expect(invalidPost.status(),'Malformed security probe must be rejected without any drone command').toBe(400);
 await page.goto('http://localhost:4010/');await narrate(page,'S17 advisory: inspect framing protection and cross-origin POST policy; no auth by design');
 await page.evaluate(url=>{const iframe=document.createElement('iframe');iframe.id='security-frame-probe';iframe.src=url;Object.assign(iframe.style,{width:'95vw',height:'65vh',position:'fixed',bottom:'0',left:'0',zIndex:'9999'});document.body.appendChild(iframe);},`${api.baseURL}/dashboard`);
 let frameAllowed=false;try{await expect(page.frameLocator('#security-frame-probe').getByRole('heading',{name:'Cockpit Control Panel'})).toBeVisible({timeout:5000});frameAllowed=true;}catch{}
 const posture={inventory,corsPreflight:{status:preflight.status(),allowOrigin:preflight.headers()['access-control-allow-origin']??null,allowMethods:preflight.headers()['access-control-allow-methods']??null},invalidPost:{status:invalidPost.status(),allowOrigin:invalidPost.headers()['access-control-allow-origin']??null},frameAllowed,caveat:'Local simulator/control API explicitly has no authentication by design. Missing hardening is advisory, not an auth regression.'};
 await info.attach('security-posture.json',{body:JSON.stringify(posture,null,2),contentType:'application/json'});
 await narrate(page,`S17 advisory: dashboard frame ${frameAllowed?'allowed':'blocked'}; POST preflight origin ${posture.corsPreflight.allowOrigin}`);
 expect(inventory.every(item=>item.status===200),'Security inventory requires healthy pages').toBe(true);
});

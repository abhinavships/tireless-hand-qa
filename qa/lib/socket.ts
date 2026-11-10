import { io, type Socket } from 'socket.io-client';
/** Raw topic client retaining observed payloads without applying UI transformations. */
export class TruthSocket {
 readonly socket:Socket;
 readonly messages=new Map<string,unknown>();
 private topics=new Set<string>();
 constructor(orgId:string|undefined='flytbase',url=process.env.API_URL??'http://localhost:4000') {
  this.socket=io(url,{autoConnect:false,reconnection:false,auth:orgId===undefined?{}:{'org-id':orgId}});
  this.socket.onAny((topic:string,payload:unknown)=>this.messages.set(topic,payload));
  this.socket.on('connect',()=>{for(const topic of this.topics)this.socket.emit('Subscribe',{topic});});
 }
 /** Connect or reject with the server handshake error. */
 async connect(timeout=10_000) {
  if(this.socket.connected)return;
  await new Promise<void>((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);this.socket.off('connect',success);this.socket.off('connect_error',failure);};
   const success=()=>{cleanup();resolve();}; const failure=(error:Error)=>{cleanup();reject(error);};
   const timer=setTimeout(()=>{cleanup();this.socket.disconnect();reject(new Error('Ground-truth socket connection timed out'));},timeout);
   this.socket.once('connect',success);this.socket.once('connect_error',failure);this.socket.connect();
  });
 }
 /** Subscribe before or after connecting, including retained values. */
 subscribe(topic:string) {this.topics.add(topic);if(this.socket.connected)this.socket.emit('Subscribe',{topic});}
 /** Stop receiving a topic and forget its cached value. */
 unsubscribe(topic:string) {this.topics.delete(topic);this.messages.delete(topic);this.socket.emit('Unsubscribe',{topic});}
 /** Wait for an observed payload satisfying a predicate. */
 async waitFor<T>(topic:string,predicate:(payload:T)=>boolean=()=>true,timeout=10_000):Promise<T> {
  this.subscribe(topic);const deadline=Date.now()+timeout;
  do {const payload=this.messages.get(topic) as T|undefined;if(payload!==undefined&&predicate(payload))return payload;await new Promise(r=>setTimeout(r,100));}while(Date.now()<deadline);
  throw new Error(`No matching ground-truth payload for ${topic} within ${timeout}ms`);
 }
 /** Close the raw client and remove listeners. */
 close() {this.socket.disconnect();this.socket.removeAllListeners();}
}
/** Create a raw client without connecting so security tests can control the handshake. */
export function createTruthSocket(orgId:string|undefined='flytbase',url?:string) {return new TruthSocket(orgId,url);}
/** Construct a public telemetry topic. */
export function topic(deviceId:string,attribute:string,orgId='flytbase') {return `${orgId}/${deviceId}/telemetry/${attribute}`;}

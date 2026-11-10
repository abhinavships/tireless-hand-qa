import type { APIRequestContext } from '@playwright/test';
/** Fleet device identity returned by the control API. */
export interface DeviceInfo { id: string; type: 'drone'|'dock'; name: string; dockId?: string; droneId?: string }
/** Ground-truth drone state returned by the simulator. */
export interface DroneSnapshot { id: string; status: string; latitude: number; longitude: number; height: number; heading: number; battery: number }
/** Simulator snapshot keyed by drone id. */
export interface SimSnapshot { running: boolean; speed: number; tick: number; drones: Record<string, DroneSnapshot> }
/** Supported injectable fault request. */
export interface FaultRequest { kind: 'socket-kick'|'socket-refuse'|'socket-delay'|'socket-drop'|'sim-offline'|'video-freeze'|'video-stutter'|'video-degrade'|'video-flicker'; deviceId?: string; seconds?: number; value?: number }
/** Typed control API with checked HTTP responses and bounded polling. */
export class ControlApi {
 constructor(readonly request: APIRequestContext, readonly baseURL = process.env.API_URL ?? 'http://localhost:4000') {}
 private async call<T>(method: string, path: string, data?: unknown): Promise<T> {
  const response = await this.request.fetch(`${this.baseURL}/api${path}`, { method, data, timeout: 15_000 });
  if (!response.ok()) throw new Error(`Control API ${method} ${path}: HTTP ${response.status()} ${await response.text()}`);
  return await response.json() as T;
 }
 /** Read service connectivity. */
 health() { return this.call<{status:string; simulator:string; video:string; uptime:number}>('GET','/health'); }
 /** Read fleet identities. */
 devices() { return this.call<{devices:DeviceInfo[];orgId:string}>('GET','/devices'); }
 /** Wait for a fleet identity to appear or disappear without assuming list order. */
 async waitForDevice(id:string,present=true,timeout=10_000) {
  await this.waitFor(async()=> (await this.devices()).devices.some(device=>device.id===id)===present,{timeout,message:`Fleet device ${id} must be ${present?'present':'removed'}`});
 }
 /** Read current simulator truth. */
 state() { return this.call<SimSnapshot>('GET','/control/state'); }
 /** Start, stop, or reset the global simulator; caller must hold appLock. */
 sim(action:'start'|'stop'|'reset', speed?:number) { return this.call<unknown>('POST','/control/sim',{action,speed}); }
 /** Command one drone. */
 command(deviceId:string,type:'takeoff'|'land') { return this.call<{ok:boolean;error?:string}>('POST','/control/command',{deviceId,type}); }
 /** Add an isolated drone and paired dock. */
 addDrone(data:{name?:string;latitude?:number;longitude?:number} = {}) { return this.call<{drone:DeviceInfo;dock:DeviceInfo}>('POST','/control/drones',data); }
 /** Remove a drone and paired dock. */
 removeDrone(id:string) { return this.call<unknown>('DELETE',`/control/drones/${encodeURIComponent(id)}`); }
 /** Change video for one drone or globally under appLock. */
 video(action:'start'|'stop',deviceId?:string) { return this.call<unknown>('POST','/control/video',{action,deviceId}); }
 /** Inject a global fault under appLock. */
 fault(data:FaultRequest) { return this.call<unknown>('POST','/control/fault',data); }
 /** Inspect active fault windows. */
 faults() { return this.call<{faults:unknown[]}>('GET','/control/fault'); }
 /** Clear faults under appLock. */
 clearFaults() { return this.call<unknown>('DELETE','/control/fault'); }
 /** Poll a predicate with a bounded deadline and meaningful failure. */
 async waitFor(predicate:()=>Promise<boolean>, options:{timeout?:number;interval?:number;message?:string} = {}) {
  const deadline=Date.now()+(options.timeout??10_000);
  do { if(await predicate()) return; await new Promise(r=>setTimeout(r,options.interval??200)); } while(Date.now()<deadline);
  throw new Error(options.message??'Control API condition did not become true before the deadline');
 }
}
/** Compatibility alias for the shared environment controller. */
export { ControlApi as Api };

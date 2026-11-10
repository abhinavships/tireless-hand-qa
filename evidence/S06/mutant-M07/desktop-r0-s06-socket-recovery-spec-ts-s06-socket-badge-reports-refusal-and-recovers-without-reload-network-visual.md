# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S06-socket-recovery.spec.ts >> S06 socket badge reports refusal and recovers without reload @network @visual
- Location: scenarios/S06-socket-recovery.spec.ts:5:1

# Error details

```
Error: Socket is disconnected/refused but operator is falsely told connected

expect(locator).not.toHaveText(expected) failed

Locator:  getByTestId('socket-status')
Expected: not "socket connected"
Received: "socket connected"
Timeout:  5000ms

Call log:
  - Socket is disconnected/refused but operator is falsely told connected getByTestId('socket-status') with timeout 5000ms
  - waiting for getByTestId('socket-status')
    14 × locator resolved to <span title="Socket connection" data-testid="socket-status" class="badge badge-reconnecting">socket connected</span>
       - unexpected value "socket connected"

```

```yaml
- text: socket connected
```

# Test source

```ts
  1  | import { test, expect } from '../lib/fixtures.js';
  2  | import { TruthSocket, topic } from '../lib/socket.js';
  3  | import { narrate } from '../lib/overlay.js';
  4  | 
  5  | test('S06 socket badge reports refusal and recovers without reload @network @visual', async ({appLock,api,cockpit,page,isolatedDrone})=>{
  6  |  void appLock; const truth=new TruthSocket();
  7  |  try {
  8  |   await api.clearFaults();await truth.connect();await truth.waitFor(topic(isolatedDrone.id,'battery'));
  9  |   await cockpit.open();await cockpit.waitReady();await cockpit.selectDrone(isolatedDrone.id);
  10 |   const navigation=page.url();
  11 |   await narrate(page,'S06: refuse and kick browser sockets; connected badge must disappear');
  12 |   await api.fault({kind:'socket-refuse',seconds:15});
  13 |   await expect.poll(()=>truth.socket.connected,{message:'Fault must disconnect the independent truth socket'}).toBe(false);
> 14 |   await expect(cockpit.badge(),'Socket is disconnected/refused but operator is falsely told connected').not.toHaveText('socket connected',{timeout:5000});
     |                                                                                                             ^ Error: Socket is disconnected/refused but operator is falsely told connected
  15 |   await narrate(page,'S06: clear refusal; socket and fresh telemetry must recover without a reload');
  16 |   await api.clearFaults();
  17 |   await expect(cockpit.badge(),'Socket badge must recover without operator reload').toHaveText('socket connected',{timeout:15000});
  18 |   await truth.connect();
  19 |   await api.command(isolatedDrone.id,'takeoff');
  20 |   await expect.poll(async()=>(await cockpit.readTelemetry()).altRlt,{timeout:15000,message:'Recovered socket must deliver new altitude rather than retain old telemetry'}).toBeGreaterThan(3);
  21 |   const pos=await truth.waitFor<{position:{height:number}}>(topic(isolatedDrone.id,'global_position'),p=>p.position.height>3,15000);
  22 |   expect(pos.position.height).toBeGreaterThan(3);expect(page.url()).toBe(navigation);
  23 |  } finally {truth.close();await api.clearFaults();await api.command(isolatedDrone.id,'land');}
  24 | });
  25 | 
```
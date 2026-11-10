import { test, expect } from '../lib/fixtures.js';
import { narrate } from '../lib/overlay.js';
import { expectVisibleAndUsable, expectNoHorizontalScroll, expectNoOverlap } from '../lib/oracles.js';
test('S08 @responsive · fleet selection and primary content are reachable at every size',async({page,cockpit,isolatedDrone})=>{
 await cockpit.open(); await cockpit.waitReady();
 await narrate(page,'S08 · check horizontal fit, then scroll to and select the isolated drone');
 await expectNoHorizontalScroll(page);
 const row=page.getByTestId(`device-row-${isolatedDrone.id}`);
 await expectVisibleAndUsable(row);
 await cockpit.selectDrone(isolatedDrone.id);
 await expect(page.getByRole('heading',{name:/Drone Telemetry/}),'Selected drone identity must update after a reachable row click').toContainText(isolatedDrone.name);
 await expect(page.locator('.video-header'),'Video identity must follow selected drone').toContainText(isolatedDrone.name);
 await narrate(page,'S08 · telemetry, video and connection badge must be reachable without sideways scrolling');
 for(const id of ['telemetry-battery','telemetry-home-distance','video-player','video-state','socket-status']) await expectVisibleAndUsable(page.getByTestId(id));
 await expectVisibleAndUsable(page.getByRole('link',{name:/Control panel/}));
 await expectNoOverlap(page.locator('.cockpit-top'),page.locator('.cockpit-left'));
 await expectNoOverlap(page.locator('.cockpit-left'),page.locator('.cockpit-map'));
 await expectNoHorizontalScroll(page);
});

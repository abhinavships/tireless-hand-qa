import { expect, type Page } from '@playwright/test';
/** Numeric values actually shown to the operator; null denotes missing data. */
export type Telemetry = Record<'battery'|'altRlt'|'altAgl'|'altAsl'|'hspeed'|'vspeed'|'heading'|'wind'|'homeDistance',number|null>;
/** Cockpit page object using stable public UI test ids. */
export class Cockpit {
 constructor(readonly page:Page) {}
 /** Navigate to the cockpit. */
 async open() { await this.page.goto('/'); }
 /** Wait for connected fleet and a populated telemetry panel. */
 async waitReady() { await expect(this.badge()).toHaveText('socket connected'); await expect(this.page.locator('[data-testid^="device-row-drone-"]').first()).toBeVisible(); await expect(this.page.getByTestId('telemetry-battery')).toContainText(/\d/); }
 /** Wait for a specific live fleet row to appear. */
 async waitRow(id:string) { await expect(this.page.getByTestId(`device-row-${id}`),`Fleet row ${id} must appear in the cockpit`).toBeVisible(); }
 /** Select a drone through the same row an operator clicks. */
 async selectDrone(id:string) { await this.page.getByTestId(`device-row-${id}`).click(); await expect(this.page.getByTestId(`device-row-${id}`)).toHaveClass(/selected/); }
 /** Read selected drone telemetry without silently converting missing values to zero. */
 async readTelemetry():Promise<Telemetry> {
  const ids={battery:'battery',altRlt:'alt-rlt',altAgl:'alt-agl',altAsl:'alt-asl',hspeed:'hspeed',vspeed:'vspeed',heading:'heading',wind:'wind',homeDistance:'home-distance'};
  const result={} as Telemetry;
  for(const [key,suffix] of Object.entries(ids)) { const text=await this.page.getByTestId(`telemetry-${suffix}`).innerText(); const match=text.match(/-?\d+(?:\.\d+)?/); result[key as keyof Telemetry]=match?Number(match[0]):null; }
  return result;
 }
 /** Locate the list flight-status pill or the selected panel pill. */
 flightPill(id?:string) { return id?this.page.getByTestId(`device-row-${id}`).locator('.device-pills .pill').last():this.page.getByTestId('status-flight'); }
 /** Locate the displayed video state. */
 videoLabel() { return this.page.getByTestId('video-state'); }
 /** Locate the socket connectivity badge. */
 badge() { return this.page.getByTestId('socket-status'); }
}
/** Compatibility alias for the cockpit page object. */
export { Cockpit as CockpitPage };

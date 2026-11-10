import { acquireAppLock } from './fixtures.js';
/** Serialize even direct Playwright invocations; children borrow a validated parent token. */
export default async function setup() {
 return await acquireAppLock(`${process.env.AGENT_NAME??'qa'} Playwright ${process.env.RUN_ID??'default'}`);
}

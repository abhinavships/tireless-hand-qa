# Tireless Hand

Oracle-driven testing of the running FlytBase Cockpit with Playwright, API/socket ground truth, fault injection, and recorded evidence.

With the app already running on ports 4010 and 4000:

```bash
cd qa && npm ci
npx playwright install chromium
./tools/run.sh clean --grep S00 --repeat-each=3
```

See [QA guide](qa/README.md) for scenario execution, shared fixtures and evidence. [Project context](.context/README.md) describes task ownership and the shared app lock. The [submission draft](submission/writeup.md) collects proven scenarios. Product source is excluded from the code package; use the FlytBase hackathon app as the separately running system under test.

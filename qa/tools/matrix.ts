import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Run = { scenario?: string; project?: string; status: string; title?: string; message?: string; attempt?: number; repeat?: string | number; source?: string; suite?: boolean };
type Mutation = { id: string; file?: string; targets: string[]; description: string; excluded?: boolean };
const args = process.argv.slice(2);
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} needs a value`);
  return args[index + 1];
}
const root = path.resolve(option('--root') ?? fileURLToPath(new URL('../../', import.meta.url)));
const evidence = path.join(root, 'evidence');
const output = path.resolve(option('--output') ?? path.join(evidence, 'mutation-matrix.md'));
async function names(directory: string): Promise<string[]> {
  try { return await readdir(directory); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
async function readRuns(relativeDirectory: string, suite = false): Promise<Run[]> {
  const directory = path.join(evidence, relativeDirectory);
  for (const filename of ['runs.json', 'verdict.json']) {
    try {
      const parsed: unknown = JSON.parse(await readFile(path.join(directory, filename), 'utf8'));
      const runs = Array.isArray(parsed) ? parsed : [parsed];
      if (runs.some(run => !run || typeof run.status !== 'string')) throw new Error(`Invalid evidence in ${directory}/${filename}`);
      return (runs as Run[]).map(run => ({ ...run, source: `${relativeDirectory}/${filename}`, suite }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return [];
}
const mutations = new Map<string, Mutation>();
for (let index = 1; index <= 15; index++) {
  const id = `M${String(index).padStart(2, '0')}`;
  mutations.set(id, { id, targets: [], description: 'Patch missing' });
}
for (const file of (await names(path.join(root, 'qa/mutations'))).filter(file => /^M\d+[a-z]?(?:-.*)?\.patch$/.test(file)).sort()) {
  const id = file.match(/^M\d+[a-z]?(?=-|\.)/)![0];
  if (mutations.get(id)?.file) throw new Error(`Duplicate patches for ${id}`);
  const header = (await readFile(path.join(root, 'qa/mutations', file), 'utf8')).split('\n').find(line => /^#\s*M\d+[a-z]?\s*\|/.test(line));
  const fields = header?.split('|').map(field => field.trim()) ?? [];
  const targetField = fields.find(field => /^targets:/i.test(field));
  mutations.set(id, { id, file, targets: [...new Set(targetField?.match(/S\d{2}/g) ?? [])], description: fields.slice(3).join(' | ') || 'No description in patch header', excluded: /\bBASELINE_ONLY\b|\bSYNTHETIC\b/.test(header ?? '') });
}
const scenarios = new Set(Array.from({ length: 14 }, (_, index) => `S${String(index + 1).padStart(2, '0')}`));
const specScenarios = new Set<string>();
for (const name of await names(evidence)) if (/^S\d{2}$/.test(name)) scenarios.add(name);
for (const name of await names(path.join(root, 'qa/scenarios'))) {
  const id = name.match(/^S\d{2}/)?.[0];
  if (id) { scenarios.add(id); specScenarios.add(id); }
}
for (const mutation of mutations.values()) for (const scenario of mutation.targets) scenarios.add(scenario);
const fullDirectories: { id: string; project: string; scenario: string; directory: string }[] = [];
for (const id of await names(path.join(evidence, 'full-suite'))) {
  if (!/^M\d+[a-z]?$/.test(id)) continue;
  for (const project of await names(path.join(evidence, 'full-suite', id))) {
    for (const scenario of await names(path.join(evidence, 'full-suite', id, project))) {
      if (!/^S\d{2}$/.test(scenario)) continue;
      scenarios.add(scenario);
      fullDirectories.push({ id, project, scenario, directory: `full-suite/${id}/${project}/${scenario}/mutant-${id}` });
    }
  }
}
const columns = [...scenarios].sort();
const runs = new Map<string, Run[]>();
for (const scenario of columns) for (const label of await names(path.join(evidence, scenario))) {
  if (!/^(clean|mutant-M\d+[a-z]?)$/.test(label)) continue;
  runs.set(`${scenario}/${label}`, await readRuns(`${scenario}/${label}`));
  const id = label.match(/^mutant-(M\d+[a-z]?)$/)?.[1];
  if (id && !mutations.has(id)) mutations.set(id, { id, targets: [], description: 'Evidence exists; patch missing' });
}
for (const entry of fullDirectories) {
  const fullRuns = await readRuns(entry.directory, true);
  const mapKey = `${entry.scenario}/mutant-${entry.id}`;
  runs.set(mapKey, [...(runs.get(mapKey) ?? []), ...fullRuns]);
  if (fullRuns.length && !mutations.has(entry.id)) mutations.set(entry.id, { id: entry.id, targets: [], description: 'Full-suite evidence exists; patch missing' });
}
function findingId(run: Run): string | undefined {
  const scenario = run.scenario ?? run.title?.match(/\bS\d{2}\b/)?.[0];
  const title = run.title ?? '';
  if (scenario === 'S05' && /@finding\b/i.test(title)) return 'F1';
  const id = scenario === 'S10' && /\b(?:evil|missing) org cannot read FlytBase fleet and telemetry\b/i.test(title) ? 'F2'
    : scenario === 'S09' && /\bdashboard renders payload \d+ as text\b/i.test(title) ? 'F3' : undefined;
  if (!id) return undefined;
  // Confirmed finding classes still require an actual matching baseline failure.
  const clean = runs.get(`${scenario}/clean`) ?? [];
  return clean.some(candidate => candidate.title === run.title && candidate.project === run.project && candidate.status === 'failed' && !infrastructure(candidate)) ? id : undefined;
}
const finding = (run: Run): boolean => Boolean(findingId(run)) || /@finding\b|\bbaseline finding\b/i.test(run.title ?? '');
const hard = (entries: Run[]): Run[] => entries.filter(run => !finding(run));
const failure = (run: Run): boolean => ['failed', 'timedOut'].includes(run.status);
// These failures describe an unavailable test runtime rather than a UI regression.
const infrastructure = (run: Run): boolean => /browserType\.launch|Failed to launch (?:the )?browser|Executable doesn't exist|Shared app lock held beyond|Lock timeout|(?:ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH)|(?:apiRequestContext|APIRequestContext)[^.\n]*\.(?:get|post|delete|fetch):|Control API \w+ \/[^\n]*: HTTP 5\d\d|net::ERR_CONNECTION_REFUSED/i.test(run.message ?? '');
const key = (run: Run): string => `${run.project ?? ''}\u0000${run.title ?? ''}`;
function cleanProof(run: Run, clean: Run[]): boolean {
  if (!run.project || !run.title) return false;
  const matching = hard(clean).filter(candidate => key(candidate) === key(run));
  // A retry pass cannot hide an earlier failure. Three distinct repeats are required.
  const repeats = new Set(matching.map((candidate, index) => candidate.repeat ?? `entry-${index}`));
  return matching.length >= 3 && repeats.size >= 3 && matching.every(candidate => candidate.repeat !== undefined && candidate.status === 'passed' && (candidate.attempt ?? 0) === 0);
}
function baselineLabel(clean: Run[]): string {
  const checks = hard(clean);
  const skipped = checks.filter(run => run.status === 'skipped');
  const executed = checks.filter(run => run.status !== 'skipped');
  const projects = (entries: Run[]): string => [...new Set(entries.map(run => run.project ?? 'unknown'))].sort().join(', ');
  const findings = clean.filter(finding);
  const ids = [...new Set(findings.map(findingId).filter(Boolean))].join(', ');
  const findingStatus = findings.length ? `finding ${findings.some(failure) ? 'fail' : findings.every(run => run.status === 'passed') ? 'pass' : 'incomplete'}${ids ? ` (${ids})` : ''}` : '';
  const hardResult = !executed.length ? '' : executed.some(failure) ? 'fail' : executed.some(run => run.status !== 'passed') ? 'unproven' : executed.every(run => cleanProof(run, executed)) ? 'pass (3×+)' : 'pass (<3×)';
  const incompleteStatuses = [...new Set(executed.filter(run => !['passed', 'failed', 'timedOut'].includes(run.status)).map(run => run.status))];
  const hardStatus = hardResult ? `${skipped.length ? `${projects(executed)} ` : ''}${hardResult}${incompleteStatuses.length ? ` (${incompleteStatuses.join(', ')})` : ''}` : '';
  const skippedStatus = skipped.length ? `skipped ${projects(skipped)} (${skipped.length} results)` : '';
  return [hardStatus, skippedStatus, findingStatus].filter(Boolean).join('; ') || 'missing';
}
type Cell = { value: string; note?: string };
function classify(mutation: Mutation, scenario: string): Cell {
  const entries = runs.get(`${scenario}/mutant-${mutation.id}`) ?? [];
  const checks = hard(entries);
  const clean = runs.get(`${scenario}/clean`) ?? [];
  const targeted = mutation.targets.includes(scenario);
  if (mutation.id === 'M11') return { value: targeted ? 'baseline-only F2' : 'n.a.' };
  if (mutation.id === 'M15') return { value: targeted ? 'dropped (D19)' : 'n.a.' };
  if (mutation.excluded) return { value: targeted ? 'unproven' : 'n.a.', note: targeted ? 'BASELINE_ONLY or SYNTHETIC metadata: categorically excluded from mutation proof.' : undefined };
  const failures = checks.filter(failure);
  if (failures.length) {
    const proven = failures.filter(run => run.status === 'failed' && !infrastructure(run) && cleanProof(run, clean));
    if (proven.length && mutation.file) return { value: targeted ? 'caught' : 'caught*', note: proven.map(run => `${run.project}: ${run.message || run.title}`).join('; ') };
    return { value: 'unproven', note: 'Failure lacks a matching clean 3× pass, is infrastructure/test-level timeout, or patch is missing. ' + failures.map(run => `${run.project}: ${run.message || run.title}`).join('; ') };
  }
  if (!targeted) return { value: 'n.a.' };
  if (!checks.length || checks.some(run => run.status !== 'passed') || !mutation.file) return { value: 'unproven', note: 'Targeted evidence is missing, skipped, interrupted, finding-only, or patch is missing.' };
  if (!checks.every(run => cleanProof(run, clean))) return { value: 'unproven', note: 'Mutant passes but a matching clean 3× pass has not been established.' };
  const recordedKeys = new Set(checks.map(key));
  if (hard(clean).some(run => !recordedKeys.has(key(run)))) return { value: 'unproven', note: 'Mutant run omitted a hard test/project present in the clean evidence.' };
  return { value: 'missed', note: 'All recorded targeted hard checks passed on the mutant.' };
}
const escape = (value: string): string => value.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').replace(/\u001b\[[0-9;]*m/g, '');
const links = (entries: Run[]): string => [...new Set(entries.map(run => run.source).filter((source): source is string => Boolean(source)))].map(source => `[${source.startsWith('full-suite/') ? 'full suite' : 'targeted'}](${source})`).join(', ') || '—';
const runnable = [...mutations.values()].filter(mutation => mutation.file && !mutation.excluded && !['M11', 'M15'].includes(mutation.id));
const targetedProven = runnable.filter(mutation => mutation.targets.length > 0 && mutation.targets.every(scenario => classify(mutation, scenario).value === 'caught'));
const expectedTitles = new Map<string, Set<string>>();
for (const scenario of columns) {
  if (scenario === 'S14') continue;
  const titles = new Set((runs.get(`${scenario}/clean`) ?? []).filter(run => run.title && !/@finding\b/i.test(run.title)).map(run => run.title!));
  if (titles.size) expectedTitles.set(scenario, titles);
}
let config = '';
try { config = await readFile(path.join(root, 'qa/playwright.config.ts'), 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const configuredProjects = [...new Set([...config.matchAll(/\bname:\s*['"]([^'"]+)['"]/g)].map(match => match[1]))];
const expectedProjects = configuredProjects.length ? configuredProjects : [...new Set([...runs.values()].flat().map(run => run.project).filter((project): project is string => Boolean(project)))].sort();
const missingCleanScopes = [...specScenarios].filter(scenario => scenario !== 'S14' && !expectedTitles.has(scenario));
function fullCompletion(mutation: Mutation): { complete: boolean; recorded: number; expected: number; skipped: number; missing: string[]; incomplete: string[] } {
  const recorded = new Set<string>();
  const skipped = new Set<string>();
  const incomplete = new Set<string>();
  for (const scenario of columns) for (const run of runs.get(`${scenario}/mutant-${mutation.id}`) ?? []) {
    if (!run.suite || !run.title || !run.project) continue;
    const identity = `${scenario}/${run.project}/${run.title}`;
    if (['passed', 'failed', 'timedOut', 'skipped'].includes(run.status)) recorded.add(identity);
    else incomplete.add(identity);
    if (run.status === 'skipped') skipped.add(identity);
  }
  const expected = [...expectedTitles].flatMap(([scenario, titles]) => expectedProjects.flatMap(project => [...titles].map(title => `${scenario}/${project}/${title}`)));
  const missing = expected.filter(identity => !recorded.has(identity));
  const matching = expected.filter(identity => recorded.has(identity));
  return { complete: expected.length > 0 && !missing.length && !incomplete.size && !missingCleanScopes.length, recorded: matching.length, expected: expected.length, skipped: matching.filter(identity => skipped.has(identity)).length, missing, incomplete: [...incomplete] };
}
const completedSweeps = runnable.filter(mutation => fullCompletion(mutation).complete);
const lines = [
  '# Mutation matrix', '',
  `Generated from recorded evidence at ${new Date().toISOString()}. No UI execution is performed by this generator.`, '',
  `Runnable mutants: **${runnable.length}**; fully qualified targeted catches: **${targetedProven.length}/${runnable.length}**. Full-suite recordings complete against the recorded clean title sets and configured projects: **${completedSweeps.length}/${runnable.length}**. M11 is baseline-only F2; M15 is dropped for L1 under D19.`, '',
  'caught = mutant assertion failed with a matching clean title/project passing at least three distinct runs without retry failures. caught* = collateral detection outside patch targets. missed = all recorded targeted hard checks passed with that clean proof. unproven = insufficient evidence; n.a. = not a declared target and no hard failure recorded. A caught cell proves a regression, not its root cause; inspect the linked failure before submission.', '',
  'Clean hard-check results exclude @finding tests and confirmed baseline cases: S10 evil/missing-org isolation (F2) and S09 dashboard payload rendering (F3), identified by title and a recorded matching clean failure. S09 cockpit checks remain hard checks. Finding failures remain visible beside hard-check results. pass (<3×) is observed success, not completed clean qualification. BASELINE_ONLY and SYNTHETIC patches are excluded from mutation proof. Recognized browser-launch, lock, and API-connection errors, test-level timeouts, and skipped/interrupted runs do not prove detection. n.a. does not imply the full suite was executed.', '',
  'Cells combine targeted evidence and evidence/full-suite/<mutant>/<project> recordings. Coverage counts recorded results, including skips and retries; they do not imply every test executed. Clean qualification uses the canonical clean evidence only.', '',
  'The clean row qualifies executed hard checks separately from explicitly listed skipped projects/results. An all-skipped scenario is reported as skipped. Mutation cells retain conservative viewport and repeat qualification.', '',
  `| Build | ${columns.join(' | ')} |`,
  `| --- | ${columns.map(() => '---').join(' | ')} |`,
  `| clean | ${columns.map(scenario => baselineLabel(runs.get(`${scenario}/clean`) ?? [])).join(' | ')} |`,
];
const details: string[] = [];
for (const mutation of [...mutations.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))) {
  const cells = columns.map(scenario => {
    const cell = classify(mutation, scenario);
    if (cell.note) details.push(`| ${mutation.id} | ${scenario} | ${cell.value} | ${links(runs.get(`${scenario}/mutant-${mutation.id}`) ?? [])} | ${escape(cell.note)} |`);
    return cell.value;
  });
  lines.push(`| ${mutation.id} | ${cells.join(' | ')} |`);
}
lines.push('', '## Patch targets', '', '| Mutant | Targets | Patch / description |', '| --- | --- | --- |');
for (const mutation of mutations.values()) lines.push(`| ${mutation.id} | ${mutation.targets.join(', ') || 'undeclared'} | ${mutation.file ? `[${mutation.file}](../qa/mutations/${mutation.file}) — ` : ''}${escape(mutation.description)} |`);
lines.push('', '## Full-suite completion', '', `Expected projects: ${expectedProjects.join(', ') || 'unknown'}. Expected titles come from actual clean runs, excluding @finding and dropped S14. Missing clean scenario title sets: ${missingCleanScopes.join(', ') || 'none'}. Completion means every expected scenario/title/project has a terminal recorded result; skipped results are listed and do not prove execution or detection. It does not imply a passing suite.`, '', '| Runnable mutant | Recording status | Recorded expected groups | Skipped groups | Missing / incomplete groups |', '| --- | --- | --- | --- | --- |');
for (const mutation of runnable) {
  const scope = fullCompletion(mutation);
  lines.push(`| ${mutation.id} | ${scope.complete ? 'complete (recorded scope)' : 'partial / missing'} | ${scope.recorded}/${scope.expected} | ${scope.skipped} | ${scope.missing.length} missing, ${scope.incomplete.length} incomplete${missingCleanScopes.length ? `; ${missingCleanScopes.length} clean scenario scopes unknown` : ''} |`);
}
lines.push('', '## Failures and targeted outcomes', '', '| Mutant | Scenario | Outcome | Evidence | Detail |', '| --- | --- | --- | --- | --- |', ...details);
if (!details.length) lines.push('| — | — | No outcomes yet | — | No mutant proof recorded. |');
lines.push('', '## Baseline findings and failures', '', '| Scenario | Kind | Project | Status | Evidence | Detail |', '| --- | --- | --- | --- | --- | --- |');
let baselineRows = 0;
for (const scenario of columns) for (const run of runs.get(`${scenario}/clean`) ?? []) {
  if (!finding(run) && run.status === 'passed') continue;
  baselineRows++;
  lines.push(`| ${scenario} | ${finding(run) ? `baseline finding${findingId(run) ? ` ${findingId(run)}` : ''} (excluded from catches)` : 'hard check failure / incomplete'} | ${escape(run.project ?? 'unknown')} | ${run.status} | ${links([run])} | ${escape(run.message || run.title || 'No message')} |`);
}
if (!baselineRows) lines.push('| — | — | — | — | — | No recorded baseline findings or failures. |');
lines.push('', '## Recorded suite coverage', '', '| Mutant | Recorded scenarios | Missing scenario evidence |', '| --- | --- | --- |');
for (const mutation of mutations.values()) {
  const recorded = columns.filter(scenario => (runs.get(`${scenario}/mutant-${mutation.id}`) ?? []).length > 0);
  lines.push(`| ${mutation.id} | ${recorded.join(', ') || 'none'} | ${columns.filter(scenario => !recorded.includes(scenario)).join(', ') || 'none'} |`);
}
lines.push('', '## Full-suite project coverage', '', '| Mutant | Project | Recorded scenarios | Results: passed / failed / timedOut / skipped / other | Missing scenario evidence |', '| --- | --- | --- | --- | --- |');
let suiteRows = 0;
for (const mutation of mutations.values()) {
  const entries = columns.flatMap(scenario => (runs.get(`${scenario}/mutant-${mutation.id}`) ?? []).filter(run => run.suite));
  for (const project of [...new Set(entries.map(run => run.project ?? 'unknown'))].sort()) {
    suiteRows++;
    const projectRuns = entries.filter(run => (run.project ?? 'unknown') === project);
    const recorded = columns.filter(scenario => (runs.get(`${scenario}/mutant-${mutation.id}`) ?? []).some(run => run.suite && (run.project ?? 'unknown') === project));
    const counts = ['passed', 'failed', 'timedOut', 'skipped'].map(status => projectRuns.filter(run => run.status === status).length);
    counts.push(projectRuns.filter(run => !['passed', 'failed', 'timedOut', 'skipped'].includes(run.status)).length);
    lines.push(`| ${mutation.id} | ${escape(project)} | ${recorded.join(', ')} | ${counts.join(' / ')} | ${columns.filter(scenario => !recorded.includes(scenario)).join(', ') || 'none'} |`);
  }
}
if (!suiteRows) lines.push('| — | — | none | 0 / 0 / 0 / 0 / 0 | No full-suite results recorded. |');
lines.push('', '## Full-suite failure assessment', '', '| Mutant | Scenario | Project | Assessment | Evidence | Detail |', '| --- | --- | --- | --- | --- | --- |');
let assessmentRows = 0;
for (const mutation of mutations.values()) for (const scenario of columns) {
  const clean = runs.get(`${scenario}/clean`) ?? [];
  for (const run of (runs.get(`${scenario}/mutant-${mutation.id}`) ?? []).filter(run => run.suite && failure(run))) {
    assessmentRows++;
    const knownBaseline = Boolean(run.title && clean.some(candidate => key(candidate) === key(run) && failure(candidate)));
    const assessment = mutation.excluded ? 'excluded patch class' : finding(run) || knownBaseline ? `baseline finding${findingId(run) ? ` ${findingId(run)}` : ' / matching baseline failure'}; excluded from catches` : infrastructure(run) ? 'infrastructure; unproven' : run.status === 'failed' && cleanProof(run, clean) && mutation.file ? mutation.targets.includes(scenario) ? 'target regression' : 'collateral regression' : 'unproven; clean qualification absent or test timeout';
    lines.push(`| ${mutation.id} | ${scenario} | ${escape(run.project ?? 'unknown')} | ${assessment} | ${links([run])} | ${escape(run.message || run.title || 'No message')} |`);
  }
}
if (!assessmentRows) lines.push('| — | — | — | — | — | No full-suite failures recorded. |');
const markdown = lines.join('\n') + '\n';
if (args.includes('--stdout')) process.stdout.write(markdown);
else { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, markdown); console.log(`Wrote ${output}`); }

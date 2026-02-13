import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import readline from 'node:readline/promises';
import process, { stdin as input, stdout as output } from 'node:process';

const latestPath = resolve('ops/state_delta/latest.json');
const meaningPath = resolve('ops/state_delta/meaning.json');

if (!process.stdin.isTTY) {
  console.log('state:meaning skipped (non-interactive)');
  process.exit(0);
}

async function loadJson(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

async function loadMeaningOrCreate(latestDeltaId) {
  try {
    return await loadJson(meaningPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        _note: 'DO NOT CHANGE delta_id. Fill human meaning only.',
        delta_id: latestDeltaId,
        one_liner: '',
        context: [],
        decisions: [],
        not_decided: [],
        rationale: [],
        problems: [],
        risks: [],
        next_actions: [],
        definition_of_done: []
      };
    }
    throw error;
  }
}

const latest = await loadJson(latestPath);
const latestDeltaId = latest?.delta_id;

if (!latestDeltaId) {
  throw new Error('Missing delta_id in ops/state_delta/latest.json');
}

const meaning = await loadMeaningOrCreate(latestDeltaId);

if (meaning.delta_id !== latestDeltaId) {
  throw new Error(
    `delta_id mismatch: latest.json has "${latestDeltaId}", meaning.json has "${meaning.delta_id}"`
  );
}

const rl = readline.createInterface({ input, output });

try {
  const oneLiner = await rl.question(`Enter one-line meaning for delta ${latestDeltaId}:\n> `);
  const nextAction = await rl.question('Future re-check or action? (optional):\n> ');

  meaning.one_liner = oneLiner;
  meaning.next_actions = nextAction === '' ? [] : [nextAction];

  await writeFile(meaningPath, `${JSON.stringify(meaning, null, 2)}\n`, 'utf8');

  console.log(`Meaning updated for delta ${latestDeltaId}`);
} finally {
  rl.close();
}

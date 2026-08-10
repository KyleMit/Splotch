import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { ROOT } from '../lib/proc.mjs';
import { sharedNoteSource } from './mirror-skill-notes.mjs';

const FORK_ROOT = join('.ruler', 'skill-forks');
const SHARED_SKILLS_ROOT = join('.ruler', 'skills');
const SHARED_NOTES_ROOT = join('.ruler', 'skill-notes');
const TARGETS = {
  claude: {
    skills: join('.claude', 'skills'),
    notes: join('.claude', 'skill-notes'),
  },
  codex: {
    skills: join('.agents', 'skills'),
    notes: join('.agents', 'skill-notes'),
  },
};

function directoriesUnder(path) {
  if (!existsSync(path)) return [];
  const entries = readdirSync(path, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      throw new Error(`expected a directory in ruler skill forks: ${join(path, entry.name)}`);
    }
  }
  return entries.map((entry) => entry.name).sort();
}

function filesUnder(path) {
  if (!existsSync(path)) return [];
  const entries = readdirSync(path, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      throw new Error(`expected a file in ruler skill fork notes: ${join(path, entry.name)}`);
    }
  }
  return entries.map((entry) => entry.name).sort();
}

function assertWithin(parent, child) {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(child);
  if (resolvedChild !== resolvedParent && !resolvedChild.startsWith(`${resolvedParent}${sep}`)) {
    throw new Error(`ruler skill fork escaped ${resolvedParent}: ${resolvedChild}`);
  }
}

function validateSourceTree(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new Error(`ruler skill fork cannot contain a symlink: ${path}`);
  }
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) validateSourceTree(join(path, entry));
    return;
  }
  if (!stat.isFile()) throw new Error(`unsupported ruler skill fork entry: ${path}`);
  if (path.endsWith('.md')) {
    throw new Error(`Markdown in a ruler skill fork must end in .md.template: ${path}`);
  }
}

function copySourceTree(sourceRoot, targetRoot) {
  mkdirSync(targetRoot, { recursive: true });
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    const source = join(sourceRoot, entry.name);
    const outputName = entry.name.replace(/\.template$/, '');
    const target = join(targetRoot, outputName);
    if (entry.isDirectory()) {
      copySourceTree(source, target);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }
}

function validateAgentRoot(agentRoot) {
  const allowed = new Set(['skills', 'skill-notes']);
  for (const entry of readdirSync(agentRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !allowed.has(entry.name)) {
      throw new Error(`unsupported ruler skill fork directory: ${join(agentRoot, entry.name)}`);
    }
  }
}

export function applyRulerSkillForks(root = ROOT) {
  const sourceRoot = join(root, FORK_ROOT);
  if (!existsSync(sourceRoot)) return { skills: 0, notes: 0 };

  const plans = [];
  for (const agent of directoriesUnder(sourceRoot)) {
    const target = TARGETS[agent];
    if (!target) throw new Error(`unsupported ruler skill fork target: ${agent}`);

    const agentRoot = join(sourceRoot, agent);
    validateSourceTree(agentRoot);
    validateAgentRoot(agentRoot);

    const skillsSource = join(agentRoot, 'skills');
    const skillNames = directoriesUnder(skillsSource);
    const skills = [];
    for (const skillName of skillNames) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(skillName)) {
        throw new Error(`invalid ruler skill fork name: ${skillName}`);
      }

      const sharedSkill = join(root, SHARED_SKILLS_ROOT, skillName);
      if (existsSync(sharedSkill)) {
        throw new Error(
          `ruler skill fork must not also have a shared implementation: ${sharedSkill}`
        );
      }

      const source = join(skillsSource, skillName);
      if (!existsSync(join(source, 'SKILL.md.template'))) {
        throw new Error(`ruler skill fork is missing SKILL.md.template: ${source}`);
      }

      const output = join(root, target.skills, skillName);
      assertWithin(join(root, target.skills), output);
      skills.push({ source, output });
    }

    const notesSource = join(agentRoot, 'skill-notes');
    const notes = [];
    for (const noteFile of filesUnder(notesSource)) {
      if (!noteFile.endsWith('.md.template')) {
        throw new Error(`ruler skill fork note must end in .md.template: ${noteFile}`);
      }

      const skillName = basename(noteFile, '.md.template');
      if (!skillNames.includes(skillName)) {
        throw new Error(`ruler skill fork note has no matching skill: ${noteFile}`);
      }

      const sharedNote = join(root, SHARED_NOTES_ROOT, sharedNoteSource(skillName));
      if (existsSync(sharedNote)) {
        throw new Error(`ruler skill fork must not also have a shared note: ${sharedNote}`);
      }

      const source = join(notesSource, noteFile);
      const output = join(root, target.notes, `${skillName}.md`);
      assertWithin(join(root, target.notes), output);
      const sourceLabel = relative(root, source);
      notes.push({ source, sourceLabel, output });
    }

    plans.push({ agent, skillNames, skills, notes });
  }

  const forkedSkillNames = new Set(plans.flatMap((plan) => plan.skillNames));
  for (const skillName of forkedSkillNames) {
    const missingAgents = Object.keys(TARGETS).filter(
      (agent) => !plans.find((plan) => plan.agent === agent)?.skillNames.includes(skillName)
    );
    if (missingAgents.length) {
      throw new Error(
        `ruler skill fork ${skillName} is missing complete package(s) for: ${missingAgents.join(', ')}`
      );
    }
  }

  for (const plan of plans) {
    for (const skill of plan.skills) {
      rmSync(skill.output, { recursive: true, force: true });
      copySourceTree(skill.source, skill.output);
    }
    for (const note of plan.notes) {
      mkdirSync(dirname(note.output), { recursive: true });
      const body = readFileSync(note.source, 'utf8');
      writeFileSync(note.output, `<!-- Source: ${note.sourceLabel} -->\n\n${body}`);
    }
  }

  return {
    skills: plans.reduce((total, plan) => total + plan.skills.length, 0),
    notes: plans.reduce((total, plan) => total + plan.notes.length, 0),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const applied = applyRulerSkillForks();
  console.log(
    `[skill-forks] applied ${applied.skills} runner-specific skill(s) and ${applied.notes} note(s)`
  );
}

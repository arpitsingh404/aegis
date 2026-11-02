'use strict';

/**
 * Claude-style Skills: markdown files with YAML-ish frontmatter.
 * Directories scanned (first match wins per skill name):
 *   <workspace>/.aegis/skills/*.md
 *   <workspace>/skills/*.md
 *   <aegis install>/skills/*.md
 */

const fs = require('fs');
const path = require('path');

const INSTALL_SKILLS = path.join(__dirname, '..', 'skills');

function skillDirs(workspace) {
  const dirs = [];
  if (workspace) {
    dirs.push(path.join(workspace, '.aegis', 'skills'));
    dirs.push(path.join(workspace, 'skills'));
  }
  dirs.push(INSTALL_SKILLS);
  return dirs.filter((d) => {
    try {
      return fs.statSync(d).isDirectory();
    } catch (_) {
      return false;
    }
  });
}

function parseFrontmatter(raw) {
  const out = { name: '', description: '', body: raw };
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return out;
  const head = m[1];
  out.body = raw.slice(m[0].length);
  for (const line of head.split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const val = kv[2].trim().replace(/^['"]|['"]$/g, '');
    if (key === 'name') out.name = val;
    if (key === 'description') out.description = val;
  }
  return out;
}

function listSkills(workspace) {
  const found = new Map();
  for (const dir of skillDirs(workspace)) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch (_) {
      continue;
    }
    for (const file of entries) {
      if (!file.toLowerCase().endsWith('.md')) continue;
      const base = file.replace(/\.md$/i, '');
      if (found.has(base)) continue;
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
        const parsed = parseFrontmatter(raw);
        found.set(base, {
          name: parsed.name || base,
          description: parsed.description || String(raw.split(/\r?\n/).find((l) => l.trim()) || '').slice(0, 160),
          file: path.join(dir, file)
        });
      } catch (_) {}
    }
  }
  return [...found.values()];
}

function loadSkill(workspace, name) {
  const want = String(name || '').trim().toLowerCase().replace(/\.md$/, '');
  if (!want) return { ok: false, error: 'name is required.' };
  const skills = listSkills(workspace);
  const hit = skills.find((s) => s.name.toLowerCase() === want || path.basename(s.file, '.md').toLowerCase() === want);
  if (!hit) {
    return { ok: false, error: `No such skill. Available: ${skills.map((s) => s.name).join(', ') || '(none)'}` };
  }
  try {
    const raw = fs.readFileSync(hit.file, 'utf8');
    const parsed = parseFrontmatter(raw);
    return { ok: true, name: hit.name, description: hit.description, content: parsed.body.slice(0, 60000) };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

function skillsPrompt(workspace) {
  const skills = listSkills(workspace);
  if (!skills.length) return '';
  return (
    'Available skills (call load_skill with the name before using one):\n' +
    skills.map((s) => `- ${s.name}: ${s.description}`).join('\n')
  );
}

module.exports = { listSkills, loadSkill, skillsPrompt };

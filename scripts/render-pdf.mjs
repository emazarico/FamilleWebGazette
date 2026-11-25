#!/usr/bin/env node
/**
 * FamilyGazette CLI HTML & PDF Renderer for FamilyDatabase JSON backups.
 *
 * Strictly obeys the Gazette Privacy Firewall: reads ONLY curated Gazette
 * posts (and wall posts marked includeInGazette when no issue is matched)
 * and never accesses private messages or message replies.
 *
 * Usage:
 *   npm run pdf:cli -- --input family-db.json --output gazette.html --html-only
 *   node scripts/render-pdf.mjs --input family-db.json --issue latest --output gazette.pdf
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const USAGE = `FamilyGazette CLI HTML & PDF Renderer

Usage:
  node scripts/render-pdf.mjs --input <family-db.json> [options]

Options:
  --input <file>          Path to FamilyDatabase JSON snapshot (required)
  --output <file>         Output .html or .pdf file path
  --issue <id|num|latest> Issue ID, numeric issueNumber, or "latest" (default: latest)
  --theme <theme>         editorial | classic | keepsake
  --lang <fr|en>          Output language (default: fr)
  --html-only             Write printable standalone HTML without launching Playwright
  -h, --help              Show this help message
`;

const THEME_TOKENS = {
  editorial: {
    mastheadBg: '#1B5E7C',
    mastheadText: '#FFFFFF',
    accent: '#D97706',
    accentSoft: '#FEF3C7',
    surface: '#FAF8F5',
    cardBg: '#FFFFFF',
    border: '#E7E5E4',
    text: '#1C1917',
    muted: '#57534E',
    badgeBg: '#E6F4F8',
    badgeText: '#1B5E7C',
  },
  classic: {
    mastheadBg: '#292524',
    mastheadText: '#FAF7F2',
    accent: '#B45309',
    accentSoft: '#FDE68A',
    surface: '#FBF9F4',
    cardBg: '#FFFFFF',
    border: '#D6D3D1',
    text: '#1C1917',
    muted: '#57534E',
    badgeBg: '#F5F5F4',
    badgeText: '#44403C',
  },
  keepsake: {
    mastheadBg: '#881337',
    mastheadText: '#FFF1F2',
    accent: '#E11D48',
    accentSoft: '#FFE4E6',
    surface: '#FFF9FA',
    cardBg: '#FFFFFF',
    border: '#FECDD3',
    text: '#1F2937',
    muted: '#6B7280',
    badgeBg: '#FFE4E6',
    badgeText: '#9F1239',
  },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseArgs(argv) {
  const opts = {
    input: '',
    output: '',
    issue: 'latest',
    theme: '',
    lang: 'fr',
    htmlOnly: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (arg === '--html-only') {
      opts.htmlOnly = true;
    } else if (arg === '--input' && i + 1 < argv.length) {
      opts.input = argv[++i];
    } else if (arg === '--output' && i + 1 < argv.length) {
      opts.output = argv[++i];
    } else if (arg === '--issue' && i + 1 < argv.length) {
      opts.issue = argv[++i];
    } else if (arg === '--theme' && i + 1 < argv.length) {
      opts.theme = argv[++i];
    } else if (arg === '--lang' && i + 1 < argv.length) {
      opts.lang = argv[++i] === 'en' ? 'en' : 'fr';
    }
  }
  return opts;
}

function selectIssueAndPosts(db, issueSelector) {
  const activeGazettes = (db.gazettes || [])
    .filter((g) => g && !g.deletedAt)
    .sort((a, b) => (b.issueNumber || 0) - (a.issueNumber || 0));

  let selectedIssue = null;
  if (issueSelector === 'latest') {
    selectedIssue = activeGazettes[0] || null;
  } else {
    selectedIssue =
      activeGazettes.find(
        (g) => g.id === issueSelector || String(g.issueNumber) === String(issueSelector),
      ) || null;
  }

  const postsById = new Map((db.posts || []).map((p) => [p.id, p]));
  let curatedPosts = [];

  if (selectedIssue) {
    for (const postId of selectedIssue.includedPostIds || []) {
      const p = postsById.get(postId);
      if (p && !p.deletedAt) curatedPosts.push(p);
    }
  } else {
    curatedPosts = (db.posts || [])
      .filter((p) => p && !p.deletedAt && p.includeInGazette)
      .sort((a, b) => (a.memoryDate || '').localeCompare(b.memoryDate || ''));
    selectedIssue = {
      id: 'cli-preview',
      issueNumber: (db.settings?.lastCompiledIssueNumber || 0) + 1,
      title: db.settings?.gazetteTitle || 'FamilyGazette',
      editorialNote: db.settings?.gazetteSubtitle || '',
      theme: db.settings?.gazetteTheme || 'editorial',
      periodStart: curatedPosts[0]?.memoryDate || '',
      periodEnd: curatedPosts[curatedPosts.length - 1]?.memoryDate || '',
    };
  }

  return { issue: selectedIssue, posts: curatedPosts };
}

function buildPrintableHtml(db, issue, posts, opts) {
  const lang = opts.lang === 'en' ? 'en' : 'fr';
  const themeKey = THEME_TOKENS[opts.theme]
    ? opts.theme
    : THEME_TOKENS[issue.theme]
      ? issue.theme
      : 'editorial';
  const tokens = THEME_TOKENS[themeKey];
  const familyName = db.settings?.familyName || 'FamilyGazette';

  const profilesById = new Map((db.profiles || []).map((p) => [p.id, p]));
  const guestsById = new Map((db.rememberedPeople || []).map((g) => [g.id, g]));

  const cardsHtml = posts
    .map((post) => {
      const author = profilesById.get(post.authorProfileId);
      const authorLabel = author ? `${author.avatarEmoji || ''} ${author.name}`.trim() : familyName;
      const taggedNames = [
        ...(post.taggedProfileIds || []).map((pid) => profilesById.get(pid)?.name).filter(Boolean),
        ...(post.taggedGuestIds || []).map((gid) => guestsById.get(gid)?.name).filter(Boolean),
      ];
      const breakClass = post.fullPageFeature ? 'page-break' : '';
      return `
        <article class="card ${breakClass}">
          <div class="meta">${escapeHtml(authorLabel)} &bull; ${escapeHtml(post.memoryDate || '')}${
        post.fullPageFeature ? ` &bull; ★ ${lang === 'fr' ? 'Pleine page' : 'Full Page'}` : ''
      }</div>
          <p class="caption">${escapeHtml(post.caption || '')}</p>
          ${
            post.mediaIds?.length
              ? `<div class="media-count">${post.mediaIds.length} photo(s)</div>`
              : ''
          }
          ${
            taggedNames.length
              ? `<div class="tagged">${lang === 'fr' ? 'Avec :' : 'With:'} ${escapeHtml(
                  taggedNames.join(', '),
                )}</div>`
              : ''
          }
        </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(issue.title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: ${tokens.surface}; color: ${tokens.text}; }
    .sheet { max-width: 860px; margin: 0 auto; }
    .masthead { background: ${tokens.mastheadBg}; color: ${tokens.mastheadText}; border-radius: 18px; padding: 26px; text-align: center; margin-bottom: 22px; }
    .masthead h1 { font-family: Georgia, serif; font-size: 28px; margin: 8px 0; }
    .editorial { background: ${tokens.accentSoft}; border-left: 4px solid ${tokens.accent}; padding: 12px 16px; border-radius: 10px; margin-bottom: 20px; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .card { background: ${tokens.cardBg}; border: 1px solid ${tokens.border}; border-radius: 14px; padding: 14px; break-inside: avoid; page-break-inside: avoid; }
    .card.page-break { grid-column: 1 / -1; }
    .meta { font-size: 12px; font-weight: 700; color: ${tokens.badgeText}; }
    .caption { font-size: 14px; line-height: 1.5; margin: 8px 0 0 0; white-space: pre-wrap; }
    .media-count { font-size: 11px; color: ${tokens.muted}; margin-top: 6px; font-weight: 600; }
    .tagged { font-size: 12px; color: ${tokens.muted}; margin-top: 6px; }
    @media print { body { background: #fff; padding: 0; } .card.page-break { break-before: page; page-break-before: always; } }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="masthead">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;">${escapeHtml(
        familyName,
      )} &bull; N&deg; ${escapeHtml(issue.issueNumber)}</div>
      <h1>${escapeHtml(issue.title)}</h1>
      <div style="font-size:13px;opacity:0.9;">${escapeHtml(
        issue.periodStart || '',
      )} &rarr; ${escapeHtml(issue.periodEnd || '')}</div>
    </header>
    ${
      issue.editorialNote
        ? `<div class="editorial">${escapeHtml(issue.editorialNote)}</div>`
        : ''
    }
    <section class="grid">${cardsHtml}</section>
  </div>
</body>
</html>`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (!opts.input) {
    process.stderr.write('Error: --input <family-db.json> is required.\n\n' + USAGE);
    process.exit(1);
  }

  const raw = await fs.readFile(path.resolve(opts.input), 'utf8');
  const db = JSON.parse(raw);
  const { issue, posts } = selectIssueAndPosts(db, opts.issue);
  const html = buildPrintableHtml(db, issue, posts, opts);

  const defaultOut = opts.htmlOnly ? 'gazette-output.html' : 'gazette-output.pdf';
  const outPath = path.resolve(opts.output || defaultOut);
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  if (opts.htmlOnly || outPath.toLowerCase().endsWith('.html')) {
    await fs.writeFile(outPath, html, 'utf8');
    process.stdout.write(`Wrote printable Gazette HTML (${posts.length} memories) -> ${outPath}\n`);
    return;
  }

  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    const htmlFallback = `${outPath}.html`;
    await fs.writeFile(htmlFallback, html, 'utf8');
    process.stderr.write(
      `Playwright is not installed; wrote printable HTML instead -> ${htmlFallback}\n`,
    );
    return;
  }

  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
    process.stdout.write(`Wrote Gazette PDF (${posts.length} memories) -> ${outPath}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(`${err?.message || err}\n`);
  process.exit(1);
});

/**
 * Retro Blog Static Builder
 * - Reads Markdown posts from content/posts/*.md
 * - Generates posts/*.html
 * - Generates index.html from index.template.html
 * - Generates feed.xml (RSS 2.0)
 * - (Optional) Generates sitemap.xml (enabled below)
 * - Injects latest posts + archive
 *
 * Front matter format:
 * ---
 * title: Booting Up the Retro Blog Engine
 * date: 2025-10-01
 * category: Dev Log
 * description: Short optional summary.
 * slug: optional-custom-slug
 * ---
 */
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const CONTENT_DIR = path.join(__dirname, 'content', 'posts');
const POSTS_OUT_DIR = path.join(__dirname, 'posts');
const SITE_FILE = path.join(__dirname, 'site.json');
const INDEX_TEMPLATE = path.join(__dirname, 'index.template.html');
const INDEX_OUT = path.join(__dirname, 'index.html');
const POST_TEMPLATE = path.join(__dirname, 'post-template.html');
const FEED_OUT = path.join(__dirname, 'feed.xml');
const SITEMAP_OUT = path.join(__dirname, 'sitemap.xml');

const args = process.argv.slice(2);
if (args.includes('--clean')) {
  if (fs.existsSync(POSTS_OUT_DIR)) {
    fs.readdirSync(POSTS_OUT_DIR).forEach(f => fs.unlinkSync(path.join(POSTS_OUT_DIR, f)));
  }
  [INDEX_OUT, FEED_OUT, SITEMAP_OUT].forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
  console.log('Cleaned generated files.');
  process.exit(0);
}

if (!fs.existsSync(SITE_FILE)) {
  console.error("Missing site.json");
  process.exit(1);
}

const site = JSON.parse(fs.readFileSync(SITE_FILE, 'utf8'));

if (!fs.existsSync(CONTENT_DIR)) {
  console.error("Missing content/posts directory.");
  process.exit(1);
}

if (!fs.existsSync(POSTS_OUT_DIR)) fs.mkdirSync(POSTS_OUT_DIR, { recursive: true });

function parseFrontMatter(raw) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) throw new Error("Missing front matter block (--- ... ---)");
  const fmContent = fmMatch[1];
  const body = raw.slice(fmMatch[0].length);
  const data = {};
  fmContent.split('\n').forEach(line => {
    if (!line.trim()) return;
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) data[m[1].trim()] = m[2].trim();
  });
  if (!data.title || !data.date) {
    throw new Error("Front matter requires at least title and date.");
  }
  return { data, body };
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

function estimateReadingTime(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// marked configuration
marked.setOptions({
  mangle: false,
  headerIds: true
});

function renderPostHTML(post, template) {
  let html = template;
  html = html.replace(/{{TITLE}}/g, post.title);
  html = html.replace(/{{SITE_TITLE}}/g, site.title);
  html = html.replace(/{{CATEGORY}}/g, post.category || 'General');
  html = html.replace(/{{DATE}}/g, post.date);
  html = html.replace(/{{YEAR}}/g, post.year);
  html = html.replace(/{{READING_TIME}}/g, post.readingTime + ' min');
  html = html.replace(/{{CONTENT}}/g, post.htmlContent);
  html = html.replace(/{{BASE_URL}}/g, site.baseUrl);
  html = html.replace(/{{AUTHOR}}/g, site.author);
  html = html.replace(/{{DESCRIPTION}}/g, post.description || site.description);
  return html;
}

function snippetFromHTML(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.split(' ').slice(0, 40).join(' ') + '...';
}

const posts = [];

fs.readdirSync(CONTENT_DIR)
  .filter(f => f.endsWith('.md'))
  .forEach(file => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    const { data, body } = parseFrontMatter(raw);
    const md = body.trim();
    const htmlContent = marked.parse(md);
    const slug = data.slug ? data.slug : slugify(data.title);
    const readingTime = estimateReadingTime(md);
    const post = {
      title: data.title,
      date: data.date,
      year: data.date.slice(0, 4),
      category: data.category || '',
      description: data.description || '',
      slug,
      readingTime,
      htmlContent,
      snippet: snippetFromHTML(htmlContent)
    };
    posts.push(post);
  });

posts.sort((a, b) => (a.date < b.date ? 1 : -1));

if (!fs.existsSync(POST_TEMPLATE)) {
  console.error("Missing post-template.html");
  process.exit(1);
}
const postTemplate = fs.readFileSync(POST_TEMPLATE, 'utf8');

// Generate per-post pages
posts.forEach(post => {
  const outPath = path.join(POSTS_OUT_DIR, post.slug + '.html');
  const html = renderPostHTML(post, postTemplate);
  fs.writeFileSync(outPath, html, 'utf8');
  console.log('Generated post:', outPath);
});

// Generate index.html
if (!fs.existsSync(INDEX_TEMPLATE)) {
  console.error("Missing index.template.html");
  process.exit(1);
}
let indexTemplate = fs.readFileSync(INDEX_TEMPLATE, 'utf8');

function renderLatest(posts, limit) {
  return posts.slice(0, limit).map(p => `
  <article class="post">
    <div class="meta">
      <span><strong>Date:</strong> ${p.date}</span>
      <span><strong>Category:</strong> ${p.category || 'General'}</span>
      <span><strong>Reading Time:</strong> ${p.readingTime} min</span>
      <span><strong>Status:</strong> <span style="color:var(--hot)">LATEST</span></span>
    </div>
    <h3><a href="posts/${p.slug}.html">${p.title}</a></h3>
    <p>${p.snippet}</p>
    <p><a href="posts/${p.slug}.html">Read more...</a></p>
  </article>
  `).join('\n');
}

function renderArchive(posts) {
  return posts.map(p => `
    <li><a href="posts/${p.slug}.html">${p.date} - ${p.title}</a></li>
  `).join('\n');
}

indexTemplate = indexTemplate.replace('<!-- LATEST_POSTS -->', renderLatest(posts, site.postsPerIndex || 3));
indexTemplate = indexTemplate.replace('<!-- ARCHIVE_LIST -->', renderArchive(posts));

fs.writeFileSync(INDEX_OUT, indexTemplate, 'utf8');
console.log('Generated index:', INDEX_OUT);

// Generate RSS feed
function escapeXML(str) {
  return str.replace(/[<>&'"]/g, c => ({
    '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'
  }[c]));
}

const feedItems = posts.slice(0, 20).map(p => {
  const url = `${site.baseUrl}/posts/${p.slug}.html`;
  return `
    <item>
      <title>${escapeXML(p.title)}</title>
      <link>${url}</link>
      <guid>${url}</guid>
      <pubDate>${new Date(p.date + 'T00:00:00Z').toUTCString()}</pubDate>
      <description>${escapeXML(p.snippet)}</description>
    </item>`;
}).join('\n');

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeXML(site.title)}</title>
  <link>${site.baseUrl}</link>
  <description>${escapeXML(site.description)}</description>
  <language>${site.language}</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  ${feedItems}
</channel>
</rss>`;

fs.writeFileSync(FEED_OUT, feed.trim() + '\n', 'utf8');
console.log('Generated feed:', FEED_OUT);

// Generate sitemap.xml
const sitemapUrls = [
  `${site.baseUrl}/`,
  `${site.baseUrl}/about.html`,
  ...posts.map(p => `${site.baseUrl}/posts/${p.slug}.html`)
].map(u => `<url><loc>${u}</loc></url>`).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls}
</urlset>`;

fs.writeFileSync(SITEMAP_OUT, sitemap.trim() + '\n', 'utf8');
console.log('Generated sitemap:', SITEMAP_OUT);

console.log('Build complete.');

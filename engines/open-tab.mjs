// Opens a URL as a new tab in the automation browser (CDP) and leaves it open.
// Usage: node engines/open-tab.mjs "<url>"
import { chromium } from 'playwright';
const url = process.argv[2];
if (!url) { console.error('Usage: node engines/open-tab.mjs "<url>"'); process.exit(1); }
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = b.contexts()[0];
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.bringToFront();
console.log('Opened tab (stays open):', url);
await b.close(); // detach only — tab remains

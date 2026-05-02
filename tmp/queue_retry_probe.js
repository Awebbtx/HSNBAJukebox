const fs = require('fs');
const q = JSON.parse(fs.readFileSync('/opt/HSNBA/data/local-queue.json', 'utf8'));
const now = Date.now();
const rows = [];
for (const item of q) {
  if (!/^spotify:track:[A-Za-z0-9]+$/.test(item.uri || '')) continue;
  const retryAt = Number(item.metadataHydrationNextAttemptAt || 0);
  if (retryAt > now || item.metadataHydrationLastError || item.metadataHydrationTransientFailures || item.metadataHydrationFailures || item.metadataHydrationExhausted) {
    rows.push({
      name: item.name,
      retryInSec: retryAt > now ? Math.round((retryAt - now) / 1000) : 0,
      transientFailures: Number(item.metadataHydrationTransientFailures || 0),
      failures: Number(item.metadataHydrationFailures || 0),
      exhausted: Boolean(item.metadataHydrationExhausted),
      lastError: item.metadataHydrationLastError || ''
    });
  }
}
rows.sort((a, b) => b.retryInSec - a.retryInSec);
console.log(JSON.stringify({count: rows.length, sample: rows.slice(0, 12)}, null, 2));

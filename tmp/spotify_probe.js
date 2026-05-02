const fs = require('fs');
const https = require('https');

const path = '/opt/HSNBA/data/spotify-tokens.json';
const raw = fs.readFileSync(path, 'utf8');
const tokenData = JSON.parse(raw);
const token = tokenData.access_token || '';

function call(url, label) {
  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => {
        console.log(`=== ${label} ===`);
        console.log(`STATUS ${res.statusCode}`);
        console.log(`RETRY_AFTER ${res.headers['retry-after'] || ''}`);
        console.log(`BODY ${body.slice(0, 700)}`);
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log(`=== ${label} ===`);
      console.log(`ERROR ${err.message}`);
      resolve();
    });

    req.end();
  });
}

(async () => {
  const exp = Number(tokenData.expires_at || 0);
  const sec = Math.round((exp - Date.now()) / 1000);
  console.log(`tokenExpiresInSec=${sec}`);
  await call('https://api.spotify.com/v1/me', 'me');
  await call('https://api.spotify.com/v1/tracks/11dFghVXANMlKmJXsNCbNl?market=US', 'track_with_market');
  await call('https://api.spotify.com/v1/tracks/11dFghVXANMlKmJXsNCbNl', 'track_no_market');
})();

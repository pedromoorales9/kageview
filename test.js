const fs = require('fs');

async function test() {
  const data = fs.readFileSync('jkanime.html', 'utf-8');
  const regex = /<a\s+href="https:\/\/jkanime\.net\/([^/]+)\/">([^<]+)<\/a><\/h5>/g;
  let match;
  let count = 0;
  while ((match = regex.exec(data)) !== null && count < 5) {
    console.log('match:', match[1], '|', match[2].trim());
    count++;
  }
} test();

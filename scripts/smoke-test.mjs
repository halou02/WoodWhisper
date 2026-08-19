const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8126';
const publicPages = [
  '/index.html',
  '/history.html',
  '/inherit.html',
  '/ai.html',
];
const privatePaths = [
  '/references/ui-reference/AI页UI底图.png',
  '/docs/BLUEPRINT.md',
  '/server/start_server.py',
];

let failed = false;

async function checkStatus(path, expectedStatus) {
  const response = await fetch(baseUrl + path, { redirect: 'manual' });
  if (response.status !== expectedStatus) {
    console.error(path + ': expected ' + expectedStatus + ', received ' + response.status);
    failed = true;
    return '';
  }
  console.log(path + ': ' + expectedStatus);
  return response.text();
}

for (const page of publicPages) {
  await checkStatus(page, 200);
}

const inheritHtml = await checkStatus('/inherit.html', 200);
const masterHtml = await checkStatus('/master.html', 200);
if (!masterHtml.includes('url=inherit.html') || !masterHtml.includes('window.location.replace("inherit.html")')) {
  console.error('/master.html is missing its browser redirect to /inherit.html');
  failed = true;
} else {
  console.log('/master.html: browser redirect to /inherit.html present');
}

const masterEntries = (inheritHtml.match(/name: '/g) || []).length;
if (masterEntries !== 18 || !inheritHtml.includes('var MASTERS = [') || !inheritHtml.includes('portrait: false')) {
  console.error('inherit.html is missing the master data or portrait placeholder behavior.');
  failed = true;
} else {
  console.log('/inherit.html: 18 masters and portrait placeholders present');
}

for (const path of privatePaths) {
  await checkStatus(path, 404);
}

process.exitCode = failed ? 1 : 0;

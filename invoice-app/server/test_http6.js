const http = require('http');
const options = { hostname: '::1', port: 3000, path: '/api/health', method: 'GET', timeout: 5000, family: 6 };
const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => { console.log('status', res.statusCode); console.log('body', data); });
});
req.on('error', (e) => { console.error('HTTP6 error', e); });
req.end();

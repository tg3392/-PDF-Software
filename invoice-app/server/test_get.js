const axios = require('axios');
(async ()=>{
  try{
    const r = await axios.get('http://localhost:3000/api/health', { timeout: 5000 });
    console.log('GET /api/health ->', r.status, r.data);
  }catch(e){
    console.error('GET failed:', e && e.message ? e.message : e);
    if (e && e.stack) console.error(e.stack);
    if (e && e.response) console.error('response data:', e.response.data);
    process.exit(1);
  }
})();

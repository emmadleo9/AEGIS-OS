// Isolated: exactly replicate the module pattern to see whether (async()=>{})() runs
let startingPromise = null;
const log = [];

async function start() {
  if (startingPromise) return startingPromise;
  startingPromise = (async () => {
    log.push('IIFE BODY ENTERED');
    return 'body-result';
  })();
  return startingPromise;
}

start().then((v) => console.log('resolved:', v, '| bodyEntered:', log.includes('IIFE BODY ENTERED')));

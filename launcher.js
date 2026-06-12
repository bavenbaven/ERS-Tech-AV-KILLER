const { exec } = require('child_process');
const path = require('path');

const SERVER_PORT = 3001;

function main() {
  const serverPath = path.join(__dirname, 'server', 'index.js');
  
  console.log('Starting ERS Tech AV Killer...');
  console.log('Server: ' + serverPath);
  
  // Start server in background
  const child = exec(`node "${serverPath}"`, { detached: true, stdio: 'ignore' });
  child.unref();
  
  console.log('Server starting (PID: ' + child.pid + ')...');
  
  // Wait 3 seconds then open browser
  setTimeout(() => {
    const url = `http://localhost:${SERVER_PORT}`;
    console.log('Opening: ' + url);
    exec(`start "" "${url}"`);
  }, 3000);
}

main();

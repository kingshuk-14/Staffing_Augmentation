const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      replaceInDir(fullPath);
    } else if (stat.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('http://localhost:5000/api')) {
        content = content.replace(/http:\/\/localhost:5000\/api/g, '/api');
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

replaceInDir(path.join(__dirname, 'frontend', 'src'));
console.log('All API URLs have been updated to relative paths!');

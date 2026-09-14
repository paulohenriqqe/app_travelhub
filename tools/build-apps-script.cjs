const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),target=process.argv[2];
if(!target)throw new Error('Provide a destination outside the published website.');
fs.writeFileSync(target,fs.readFileSync(path.join(root,'assets/journey-model.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'apps-script/backend.js'),'utf8'));
console.log('Apps Script bundle prepared.');

import {randomBytes} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
const directory=process.argv[2];
if(!directory)throw new Error('Choose a private output directory, e.g. node agent-host/prepare.mjs /root/oska-config');
await mkdir(directory,{recursive:true,mode:0o700});
const secret=randomBytes(48).toString('hex');
await writeFile(directory+'/oska-agent.env',`OSKA_AGENT_SECRET=${secret}\nOSKA_MAX_WORKERS=5\nPORT=8790\n`,{mode:0o600,flag:'wx'});
console.log('Created a private server configuration. No credential was printed. Keep the same OSKA_AGENT_SECRET in Vercel production; do not paste it in chat.');

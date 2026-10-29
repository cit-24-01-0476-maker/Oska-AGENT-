import {mkdir,writeFile,readFile,realpath,lstat} from 'node:fs/promises';
import path from 'node:path';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {db} from './db';
import {safePath} from './security';
import {AppError} from './contracts';
export const storageRoot=path.resolve(process.cwd(),'data','tasks');
export async function workspace(taskId:string){if(!/^[a-z0-9-]+$/i.test(taskId))throw new AppError('PATH','Invalid task identifier.');const dir=safePath(storageRoot,taskId);await mkdir(dir,{recursive:true});const actual=await realpath(dir);if(actual!==dir)throw new AppError('PATH','Symlink workspaces are forbidden.');return dir;}
export async function saveArtifact(taskId:string,name:string,content:string|Uint8Array,mime:string){
  const dir=await workspace(taskId),target=safePath(dir,name);try{if((await lstat(target)).isSymbolicLink())throw new AppError('PATH','Symlinks are forbidden.');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const data=typeof content==='string'?Buffer.from(content):content;
  await writeFile(target,data,{flag:'wx'});
  return db.artifact.create({data:{taskId,name,path:path.relative(storageRoot,target).replaceAll('\\','/'),mime,size:data.length}});
}
export async function artifactBytes(relative:string){const target=safePath(storageRoot,relative);if(await realpath(target)!==target)throw new AppError('PATH','Symlink artifacts are forbidden.');return readFile(target);}
export async function reportPdf(text:string){
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);let page=pdf.addPage(),y=790;
  // Built-in PDF font supports Latin text. Markdown remains the lossless Unicode export.
  for(const source of text.replace(/[^\x20-\x7E\n]/g,'?').split('\n')){const words=source.split(' ');let line='';const lines:string[]=[];for(const word of words){if((line+word).length>90){lines.push(line);line='';}line+=word+' ';}lines.push(line);for(const row of lines){if(y<45){page=pdf.addPage();y=790;}page.drawText(row.slice(0,200),{x:40,y,size:10,font,color:rgb(.12,.14,.2)});y-=15;}}
  return pdf.save();
}

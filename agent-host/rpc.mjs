import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {StringDecoder} from 'node:string_decoder';

export class Rpc extends EventEmitter{
  constructor(command,args,options={}){
    super();this.sequence=0;this.pending=new Map();this.buffer='';this.closed=false;
    this.child=spawn(command,args,{...options,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const decoder=new StringDecoder('utf8');
    this.child.stdout.on('data',chunk=>{try{this.consume(decoder.write(chunk));}catch{this.close();}});
    this.child.stderr.setEncoding('utf8');let diagnostic='';
    this.child.stderr.on('data',chunk=>{diagnostic+=chunk;if(diagnostic.length>65536){this.close();return;}const lines=diagnostic.split('\n');diagnostic=lines.pop();for(const line of lines)this.emit('diagnostic',line.trim());});
    this.child.on('error',()=>this.fail('Provider could not start.'));
    this.child.stdin.on('error',()=>this.fail('Provider input closed.'));
    this.child.on('exit',()=>this.fail('Provider stopped.'));
  }
  send(value){if(this.closed)throw new Error('Provider stopped.');this.child.stdin.write(JSON.stringify(value)+'\n');}
  consume(chunk){
    this.buffer+=chunk;if(this.buffer.length>8*1024*1024)throw new Error('Provider output too large.');
    let end;while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);if(!line.trim())continue;let value;try{value=JSON.parse(line);}catch{throw new Error('Invalid provider protocol.');}
      if(value.method){
        if(value.id!==undefined){
          // This first server release is text-only. Native tools never receive blanket approval.
          if(value.method==='session/request_permission')this.send({jsonrpc:'2.0',id:value.id,result:{outcome:{outcome:'cancelled'}}});
          else this.send({jsonrpc:'2.0',id:value.id,error:{code:-32601,message:'Client tools are unavailable.'}});
        }else this.emit('notification',value);
      }else{const pending=this.pending.get(value.id);if(pending){clearTimeout(pending.timer);this.pending.delete(value.id);if(value.error)pending.reject(new Error('Provider rejected '+pending.method+'.'));else pending.resolve(value.result);}}
    }
  }
  request(method,params={},timeout=90000){
    return new Promise((resolve,reject)=>{const id=++this.sequence;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Provider request timed out.'));},timeout);this.pending.set(id,{resolve,reject,timer,method});try{this.send({jsonrpc:'2.0',id,method,params});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});
  }
  notify(method,params={}){this.send({jsonrpc:'2.0',method,params});}
  fail(message){this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error(message));}this.pending.clear();this.emit('stopped');}
  close(){if(!this.closed){this.child.stdin.end();this.child.kill();this.fail('Provider stopped.');}}
}

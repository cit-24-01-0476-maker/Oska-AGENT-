export async function readBody(request,limit=100000){
  const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>limit)throw new Error('Request too large.');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks).toString('utf8');
}
export function json(response,status,value){response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(value));}

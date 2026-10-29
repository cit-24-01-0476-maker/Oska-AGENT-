const response=await fetch('http://127.0.0.1:3000/api/health');
console.log(await response.json());
if(!response.ok)process.exitCode=1;

// Private Core subprocess. Owns one sandbox and watches its anonymous Main pipe.
// Package source only reaches the OS-isolated Python child, never this process.
const {spawn}=require('node:child_process'),readline=require('node:readline'),fs=require('node:fs');
let child=null,started=false,stopping=false;
const stop=()=>{stopping=true;if(child)child.kill('SIGKILL');else process.exitCode=0;};
const lines=readline.createInterface({input:process.stdin});
process.stdin.on('end',()=>{stop();lines.close();});process.stdin.on('error',stop);
process.once('SIGTERM',stop);process.once('SIGINT',stop);
process.stdout.on('error',stop);process.stderr.on('error',stop);
lines.on('line',line=>{
 if(started||stopping){stop();return;}started=true;
 try{
  const spec=JSON.parse(line);
  if(spec.protocol!=='tl-python-supervisor/v1'||typeof spec.profile!=='string'||typeof spec.pythonPath!=='string'||typeof spec.worker!=='string'||typeof spec.directory!=='string')throw new Error('Invalid Core Python launch.');
  child=spawn('/usr/bin/sandbox-exec',['-p',spec.profile,spec.pythonPath,'-I','-B','-u','-c',spec.worker],{cwd:spec.directory,env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},stdio:['pipe','pipe','pipe']});
  child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);child.stdin.on('error',stop);
  child.once('error',error=>{process.stderr.write(error.message+'\n');stop();});
  child.once('close',(code,signal)=>{lines.close();process.stdin.destroy();try{fs.rmSync(spec.directory,{recursive:true,force:true});}catch(error){process.stderr.write(error.message+'\n');}process.exitCode=stopping?0:code??(signal?1:0);});
  child.stdin.end(JSON.stringify(spec.payload)+'\n');
 }catch(error){process.stderr.write(error.message+'\n');stop();lines.close();process.stdin.destroy();process.exitCode=1;}
});

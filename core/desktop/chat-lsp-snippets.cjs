// Static LSP snippet expansion for reviewed Chat edits. No shell, environment,
// clipboard, regex transformations or live editor cursor state is evaluated.
function expandSnippet(snippet,{values={},variables={}}={}) {
  if(typeof snippet!=='string')throw new Error('Snippet text must be a string.');
  for(const [name,map] of Object.entries({values,variables}))if(!map||typeof map!=='object'||Array.isArray(map)||Object.values(map).some(value=>typeof value!=='string'))throw new Error(`Snippet ${name} must be a string map.`);
  let cursor=0;const definitions=new Map(),indices=new Set(),names=new Set();
  const indexOf=token=>{const index=Number(token);if(!Number.isSafeInteger(index))throw new Error('Invalid snippet tabstop index.');indices.add(String(index));return index;};
  const define=(index,node)=>{
    const previous=definitions.get(index);
    if(previous&&JSON.stringify(previous)!==JSON.stringify(node))throw new Error(`Conflicting snippet defaults for tabstop ${index}.`);
    definitions.set(index,node);
  };
  function sequence(nested=false) {
    const nodes=[];let text='';const flush=()=>{if(text){nodes.push({type:'text',text});text='';}};
    while(cursor<snippet.length){
      const char=snippet[cursor];
      if(char==='}'&&nested){cursor++;flush();return nodes;}
      if(char==='\\'){
        if(['$','}','\\'].includes(snippet[cursor+1])){text+=snippet[cursor+1];cursor+=2;}else{text+='\\';cursor++;}
        continue;
      }
      if(char!=='$'){text+=char;cursor++;continue;}
      const match=/^(\d+|[_a-zA-Z][_a-zA-Z0-9]*)/.exec(snippet.slice(cursor+1));
      if(match){flush();cursor+=match[0].length+1;if(/^\d/.test(match[0]))nodes.push({type:'stop',index:indexOf(match[0])});else{names.add(match[0]);nodes.push({type:'variable',name:match[0]});}continue;}
      if(snippet[cursor+1]!=='{'){text+='$';cursor++;continue;}
      flush();cursor+=2;
      const identifier=/^(\d+|[_a-zA-Z][_a-zA-Z0-9]*)/.exec(snippet.slice(cursor));
      if(!identifier)throw new Error('Malformed snippet placeholder.');
      const token=identifier[0],isStop=/^\d/.test(token),index=isStop?indexOf(token):null;cursor+=token.length;
      if(!isStop)names.add(token);
      let node=isStop?{type:'stop',index}:{type:'variable',name:token};
      const separator=snippet[cursor++];
      if(separator===':'){
        const children=sequence(true);
        if(isStop)define(index,{type:'default',children});else node.children=children;
      }else if(separator==='|'&&isStop){
        const choices=[];let choice='',closed=false;
        while(cursor<snippet.length){const next=snippet[cursor++];
          if(next==='\\'&&[',','|','\\'].includes(snippet[cursor])){choice+=snippet[cursor++];continue;}
          if(next===','){choices.push(choice);choice='';continue;}
          if(next==='|'&&snippet[cursor]==='}'){cursor++;choices.push(choice);closed=true;break;}
          choice+=next;
        }
        if(!closed)throw new Error('Unclosed snippet choice.');
        define(index,{type:'choice',choices});
      }else if(separator==='/')throw new Error('Snippet transformations require a separate adapter; no partial expansion.');
      else if(separator!=='}')throw new Error('Malformed snippet placeholder terminator.');
      nodes.push(node);
    }
    if(nested)throw new Error('Unclosed snippet placeholder.');
    flush();return nodes;
  }
  const nodes=sequence();
  for(const key of Object.keys(values))if(!indices.has(key))throw new Error(`Unknown snippet tabstop value: ${key}.`);
  for(const key of Object.keys(variables))if(!names.has(key))throw new Error(`Unknown snippet variable value: ${key}.`);
  const active=new Set(),memo=new Map();
  const plain=text=>({text,tabstops:[],variables:[]});
  function append(target,part){const offset=target.text.length;target.text+=part.text;for(const stop of part.tabstops)target.tabstops.push({...stop,start:stop.start+offset,end:stop.end+offset});for(const variable of part.variables)target.variables.push(variable);}
  function tabstop(index){
    if(memo.has(index))return memo.get(index);
    if(active.has(index))throw new Error(`Cyclic snippet tabstop ${index}.`);
    active.add(index);const definition=definitions.get(index);let part;
    if(Object.hasOwn(values,String(index))){
      if(definition?.type==='choice'&&!definition.choices.includes(values[index]))throw new Error(`Value is not an offered choice for tabstop ${index}.`);
      part=plain(values[index]);
    }else if(definition?.type==='choice')part=plain(definition.choices[0]);
    else if(definition)part=render(definition.children);
    else part=plain('');
    active.delete(index);memo.set(index,part);return part;
  }
  function render(sequence){
    const result=plain('');
    for(const node of sequence){
      if(node.type==='text'){append(result,plain(node.text));continue;}
      if(node.type==='stop'){
        const part=tabstop(node.index),definition=definitions.get(node.index);
        append(result,{...part,tabstops:[{index:node.index,start:0,end:part.text.length,value:part.text,source:Object.hasOwn(values,String(node.index))?'explicit':definition?'default':'empty',...(definition?.type==='choice'?{choices:definition.choices}:{})},...part.tabstops]});
      }else{
        const explicit=Object.hasOwn(variables,node.name);
        if(!explicit&&!node.children)throw new Error(`Explicit snippet variable value required: ${node.name}.`);
        const part=explicit?plain(variables[node.name]):render(node.children);
        append(result,{...part,variables:[{name:node.name,value:part.text,source:explicit?'explicit':'default'},...part.variables]});
      }
    }
    return result;
  }
  return {raw:snippet,...render(nodes),limitations:['Static expansion: UTF-16 tabstop offsets refer to inserted snippet text. Live Tab traversal and linked editing are not provided by Chat. No implicit environment or editor variables are resolved.']};
}
module.exports={expandSnippet};

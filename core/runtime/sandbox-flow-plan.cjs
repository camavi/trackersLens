// Narrow scheduling plan over persisted TL dependencies, not a new node runtime.
// Execution continues to use TL's installed sandbox and RuntimeContract mapping.
const portName=port=>typeof port==='string'?port:port?.name||port?.id||port?.channel;
function planSandboxChain({nodes,dependencies,connections,workspaceId,startNodeId}){
 const byId=new Map(nodes.map(node=>[node.id,node])),steps=[],seen=new Set(),pending=[startNodeId];
 if(dependencies.some(edge=>edge.targetNodeId===startNodeId))throw new Error('Select an actual root node with no incoming dependencies.');
 while(pending.length){
  const id=pending.shift();
  if(seen.has(id))throw new Error('Cyclic Flow execution is not supported.');seen.add(id);
  const node=byId.get(id);if(!node||node.workspaceId!==workspaceId)throw new Error('Flow contains a missing or foreign-workspace node.');
  const outgoing=dependencies.filter(edge=>edge.sourceNodeId===id);
  const links=[];
  for(const edge of outgoing){
   if(edge.workspaceId!==workspaceId||edge.status==='disabled')throw new Error('Inactive/foreign dependency is not executable.');
   const target=byId.get(edge.targetNodeId);if(!target||target.workspaceId!==workspaceId)throw new Error('Dependency target is missing or outside this workspace.');
   if(dependencies.filter(row=>row.targetNodeId===target.id).length!==1)throw new Error('Flow joins require a separate scheduling contract.');
   const sourcePort=edge.metadata?.sourcePort||edge.sourcePort||edge.channel,targetPort=edge.metadata?.targetPort||edge.targetPort;
   if(!(node.outputs||[]).map(portName).includes(sourcePort)||!(target.inputs||[]).map(portName).includes(targetPort))throw new Error('Dependency requires exact declared source/target ports.');
   if(edge.metadata?.linkType&&edge.metadata.linkType!=='data')throw new Error('Only data dependencies are supported for this Flow execution.');
   const connection=connections.find(row=>row.id===edge.connectionId);if(!connection||connection.workspaceId!==workspaceId)throw new Error('Dependency connection is missing or foreign.');
   links.push({targetNodeId:target.id,dependencyId:edge.id,connectionId:edge.connectionId,sourcePort,targetPort,mapping:edge.metadata||{}});pending.push(target.id);
  }
  steps.push({nodeId:id,links});
 }
 return {workspaceId,startNodeId,steps};
}
module.exports={planSandboxChain};

const { AjvJsonSchemaValidator } = require('@modelcontextprotocol/sdk/validation/ajv-provider.js');
const { planNodeEdits } = require('../desktop/node-edit-plan.cjs');
const text={type:'string',minLength:1};
const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const definitions=[
 ['tl_get_project','Read the connected TL project and actual supported MCP capabilities.',schema()],
 ['tl_list_flows','List all persisted Flow Maps in this project through the existing TL library index.',schema()],
 ['tl_inspect_workspace','Read the complete persisted workspace graph, channels and Flow Map document. Not an in-memory execution snapshot.',schema({workspaceId:text},['workspaceId'])],
 ['tl_inspect_node','Read one exact runtime node and its incident dependencies/connections in the selected workspace.',schema({workspaceId:text,nodeId:text},['workspaceId','nodeId'])],
 ['tl_read_channel','Read one complete persisted channel record/output without a data cap.',schema({workspaceId:text,channelId:text},['workspaceId','channelId'])],
 ['tl_read_runtime_events','Read all persisted runtime events and Flow logs in a workspace. These describe runtime work, not editor file changes.',schema({workspaceId:text},['workspaceId'])],
 ['tl_preview_node_edits','Validate rename/move/config edits with the existing Core planner. Returns before/after only; cannot apply or execute anything.',schema({workspaceId:text,edits:{type:'array',minItems:1,items:{type:'object',properties:{operation:{enum:['rename','move','config']},nodeId:text,field:text,value:{},position:schema({x:{type:'number'},y:{type:'number'}},['x','y'])},required:['operation','nodeId'],additionalProperties:false}}},['workspaceId','edits'])]
] .map(([name,description,inputSchema])=>({name,description,inputSchema,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}));
const linkProperties={operation:{enum:['connect','disconnect']},sourceNodeId:text,targetNodeId:text,sourcePort:text,targetPort:text};
const graphEditSchema={oneOf:[
 schema(linkProperties,['operation','sourceNodeId','targetNodeId','sourcePort','targetPort']),
 schema({operation:{const:'duplicate'},nodeId:text,value:text,position:schema({x:{type:'number'},y:{type:'number'}},['x','y'])},['operation','nodeId','value'])
]};
const mutationDefinitions=[
 {name:'tl_preview_graph_edits',description:'Prepare connect/disconnect between exact existing ports or duplicate an existing node. Core generates new IDs once and returns complete graph before/after. Does not apply or execute; local TL review is required by tl_apply_node_edits.',inputSchema:schema({workspaceId:text,edits:{type:'array',minItems:1,items:graphEditSchema}},['workspaceId','edits']),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
 {name:'tl_apply_node_edits',description:'Request local TL approval and atomic application of an exact connection-owned preview. Saves pending work and reloads the editor. Never automatically retry an uncertain result; query the durable receipt.',inputSchema:schema({planId:text},['planId']),annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'tl_get_edit_receipt',description:'Read the durable result for an MCP operationId returned by preview; scoped to the exact workspace.',inputSchema:schema({workspaceId:text,operationId:text},['workspaceId','operationId']),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];
const runtimeDefinitions=[
 ['tl_preview_run_node','Prepare a one-shot installed sandboxed Custom Node run with exact inputs and persisted config. No execution until local TL review.',schema({workspaceId:text,nodeId:text,inputs:{type:'object'}},['workspaceId','nodeId','inputs']),true],
 ['tl_start_node_run','Consume one connection-owned execution plan, ask local TL approval and start the real sandbox. Never automatically replay.',schema({planId:text},['planId']),false],
 ['tl_get_node_run','Read complete persisted result and live sandbox trace for an MCP runId, including output, diagnostics and timings.',schema({runId:text},['runId']),true],
 ['tl_stop_node_run','Cancel an execution owned by this connection and wait for sandbox termination. Does not undo produced side effects.',schema({runId:text},['runId']),false]
].map(([name,description,inputSchema,readOnlyHint])=>({name,description,inputSchema,annotations:{readOnlyHint,destructiveHint:false,idempotentHint:readOnlyHint,openWorldHint:!readOnlyHint}}));
class TlMcpTools {
 constructor({persistence,project,nodeEdits,runtimeRuns}){this.runtimeRuns=runtimeRuns;this.nodeEdits=nodeEdits;this.persistence=persistence;this.project=project;const validator=new AjvJsonSchemaValidator();this.validators=new Map([...definitions,...(nodeEdits?mutationDefinitions:[]),...(runtimeRuns?runtimeDefinitions:[])].map(tool=>[tool.name,validator.getValidator(tool.inputSchema)]));}
 list(){const tools=structuredClone([...definitions,...(this.nodeEdits?mutationDefinitions:[]),...(this.runtimeRuns?runtimeDefinitions:[])]);if(this.nodeEdits){const preview=tools.find(tool=>tool.name==='tl_preview_node_edits');preview.description='Validate and prepare a connection-owned atomic rename/move/config plan. Returns complete before/after and operationId; apply requires a separate call and local TL approval.';}return tools;}
 read(storeName,workspaceId){return this.persistence.readDevelopmentRecords({storeName,workspaceId});}
 exact(storeName,id,workspaceId){const record=this.persistence.readDevelopmentRecordById({storeName,id});if(!record||record.workspaceId!==workspaceId)throw new Error('Record not found in this workspace.');return record;}
 async call(name,args={},owner){
  const validate=this.validators.get(name);if(!validate)throw new Error('Unknown TL MCP tool.');const checked=validate(args);if(!checked.valid)throw new Error(checked.errorMessage);
  if(args.workspaceId==='all')throw new Error('An exact workspaceId is required.');
  if(name==='tl_preview_run_node')return this.runtimeRuns.preview(args,owner);
  if(name==='tl_start_node_run')return this.runtimeRuns.start(args,owner);
  if(name==='tl_get_node_run')return this.runtimeRuns.get(args);
  if(name==='tl_stop_node_run')return this.runtimeRuns.stop(args,owner);
  if(name==='tl_preview_graph_edits')return this.nodeEdits.previewGraph(args,owner);
  if(name==='tl_apply_node_edits')return this.nodeEdits.apply(args,owner);
  if(name==='tl_get_edit_receipt')return this.nodeEdits.receipt(args);
  if(name==='tl_preview_node_edits'&&this.nodeEdits)return this.nodeEdits.preview(args,owner);
  let data;
  switch(name){
   case 'tl_get_project':data={project:{id:this.project.id,name:this.project.name},capabilities:{readOnly:!this.nodeEdits,previewNodeEdits:true,applyNodeEdits:Boolean(this.nodeEdits),graphEdits:this.nodeEdits?['connect','disconnect','duplicate']:[],runtimeExecution:this.runtimeRuns?'single-custom-node-sandbox':false},limitations:['Only persisted TL state is exposed. Pending renderer/worker output may not yet be saved. This MCP server does not track external editor changes.']};break;
   case 'tl_list_flows':data={flows:this.persistence.readFlowMapLibraryIndex()};break;
   case 'tl_inspect_workspace':data={workspaceId:args.workspaceId,document:this.persistence.readDevelopmentRecordById({storeName:'tl_pages',id:args.workspaceId}),graph:Object.fromEntries(['tl_runtime_nodes','tl_runtime_dependencies','tl_connections','tl_channels','tl_flows'].map(store=>[store,this.read(store,args.workspaceId)]))};break;
   case 'tl_inspect_node':data={node:this.exact('tl_runtime_nodes',args.nodeId,args.workspaceId),dependencies:this.read('tl_runtime_dependencies',args.workspaceId).filter(row=>row.sourceNodeId===args.nodeId||row.targetNodeId===args.nodeId),connections:this.read('tl_connections',args.workspaceId).filter(row=>[row.sourceNodeId,row.targetNodeId,row.sourceRef,row.targetRef,row.fromBoxId,row.toBoxId].includes(args.nodeId))};break;
   case 'tl_read_channel':data={channel:this.exact('tl_channels',args.channelId,args.workspaceId)};break;
   case 'tl_read_runtime_events':data={workspaceId:args.workspaceId,events:this.read('tl_events',args.workspaceId),logs:this.read('tl_flow_logs',args.workspaceId)};break;
   case 'tl_preview_node_edits':data={...planNodeEdits({nodes:this.read('tl_runtime_nodes',args.workspaceId),workspaceId:args.workspaceId,edits:args.edits}),applied:false,limitations:['Read-only validation using the registered Core node-edit planner. This is not an approval token or proof that a later mutation would still be valid. No writes, snapshots or execution are performed.']};break;
  }
  return {observedAt:new Date().toISOString(),source:'tl-core-persisted-state',consistency:'Individual persisted reads; not an atomic cross-store or live renderer snapshot.',...data};
 }
}
module.exports={TlMcpTools};

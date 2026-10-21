#!/usr/bin/env node
const {Server}=require('@modelcontextprotocol/sdk/server/index.js');
const {StdioServerTransport}=require('@modelcontextprotocol/sdk/server/stdio.js');
const {ListToolsRequestSchema,CallToolRequestSchema}=require('@modelcontextprotocol/sdk/types.js');
const {LocalTlClient}=require('../core/mcp/local-client.cjs');
async function main(){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--project'||!args[1])throw new Error('Usage: node scripts/tl-mcp.cjs --project /absolute/TL-project. Open that project in TL and enable MCP first.');
 const client=await new LocalTlClient(args[1]).connect();
 const server=new Server({name:'trackers-lens',version:'0.1.0'},{capabilities:{tools:{}},instructions:'Connected to one open Trackers Lens project. Inspect persisted runtime state and validate proposed node edits. Query tl_get_project for actual capabilities. If node edits are available, use tl_preview_node_edits for config/name/position or tl_preview_graph_edits for exact links/duplicate, then apply only the returned planId; local TL approval is required. On uncertain results query the returned operationId receipt, never automatically replay. Installed sandboxed Custom Nodes can be run one at a time with tl_preview_run_node/tl_start_node_run, observed with tl_get_node_run and cancelled with tl_stop_node_run. This is not downstream Flow execution. Editor-file monitoring is not provided. Use external editor tools to edit project source files.'});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:await client.request('listTools')}));
 server.setRequestHandler(CallToolRequestSchema,async request=>{
  try{const result=await client.request('callTool',{name:request.params.name,args:request.params.arguments||{}});return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}
  catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}
 });
 let closing=false;const close=async()=>{if(closing)return;closing=true;client.close();await server.close();};
 client.onclose=()=>void close();server.onclose=()=>{client.close();};
 process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
 await server.connect(new StdioServerTransport());
}
main().catch(error=>{process.stderr.write(`TL MCP: ${error.message}\n`);process.exitCode=1;});

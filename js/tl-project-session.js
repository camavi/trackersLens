// The editor acknowledges closing only after complete graph operations and IPC writes.
(() => {
  const bridge = window.trackers?.desktop?.project;
  if (!bridge?.onPrepareClose) return;
  const mcpDialogs=new Map();
  window.trackers?.desktop?.mcpServer?.onReviewCancel(token=>{const pending=mcpDialogs.get(token);if(pending){pending.cancel();mcpDialogs.delete(token);}});
  window.trackers?.desktop?.mcpServer?.onReview(review=>{
    const isFlow=review.edits?.[0]?.operation==='run-flow-chain';
    let sent=false;
    const respond=approved=>{if(sent)return;sent=true;mcpDialogs.delete(review.token);void window.trackers.desktop.mcpServer.respond(review.token,approved).catch(console.error);};
    const dialog=_.Dialog({title:review.kind==='runtime-start'?(isFlow?'Esecuzione Flow richiesta tramite MCP':'Esecuzione richiesta tramite MCP'):'Modifica richiesta tramite MCP',size:'lg',class:'tl-mcp-edit-review',closeButton:true,onClose:()=>respond(false),content:()=>_.div(
      _.p(`Workspace: ${review.workspaceId}`),_.p(review.kind==='runtime-start'?(isFlow?'Esegue la catena lineare mostrata, propagando le emissioni tra le porte indicate. Un errore ferma i passaggi successivi e conserva i risultati.':'Esegue un singolo Custom Node sandbox con gli input e i permessi mostrati. Nessuna propagazione al Flow.'):'TL salverà il lavoro pendente e ricaricherà l’editor. I nodi attivi o modificati dopo l’anteprima bloccano l’operazione.'),
      _.details({open:true},_.summary('Modifiche'),_.pre({style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}},JSON.stringify(review.edits,null,2))),
      _.details({open:true},_.summary('Prima'),_.pre({style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}},JSON.stringify(review.before,null,2))),
      _.details({open:true},_.summary('Dopo'),_.pre({style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}},JSON.stringify(review.after,null,2)))
    ),footer:()=>[_.Button({label:'Annulla',onClick:()=>{respond(false);dialog.close();}}),_.Button({label:review.kind==='runtime-start'?(isFlow?'Avvia Flow MCP':'Avvia nodo MCP'):'Applica modifica MCP',color:'primary',onClick:()=>{respond(true);dialog.close();}})]});mcpDialogs.set(review.token,{cancel:()=>{sent=true;dialog.close();}});dialog.open();
  });
  bridge.onPrepareClose(async () => {
    document.activeElement?.blur?.();
    const root = document.getElementById('tl-desktop-shell-root');
    if (root) root.inert = true;
    const progress = _.Dialog({ title: 'Chiusura progetto', size: 'sm', persistent: true, closeButton: false,
      content: () => _.div({ role: 'status' }, _.Spinner({ size: 18 }), _.p('Salvataggio delle modifiche…')) });
    progress.open();
    try {
      await window.TrackerLensAppRouter?.prepareClose?.();
      await window.TrackerLensRuntimeGraphStore?.flush?.();
      await bridge.flushPersistence();
    } catch (error) {
      if (root) root.inert = false;
      await window.TrackerLensAppRouter?.render?.();
      throw error;
    } finally { progress.close(); }
  });
})();

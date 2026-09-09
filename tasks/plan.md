<implementation_plan issue="https://github.com/workslo/fleet/issues/28" slice="Needs Shane" base="3c343121fec2a90139b9f39ada036e0f451e72f1">
  <authorization><shane>ty - proceed with next slice</shane></authorization>
  <scope>Decision-only, action-only, and combined requests; source-linked outcomes, explicit performer delegation, Board actions, native client access. Preserve the signed agreement and original work state. No deployment or activation.</scope>
  <task id="1" size="M" dependencies="none">
    <description>Store and transition one Needs Shane record with separate decision and action facts.</description>
    <acceptance>Approval retains an unfinished action; decline never claims action completion. Only Shane decides or delegates; completion identifies the authenticated Shane or named delegate. Versions, actor-scoped replay, activity and outcome writes are atomic.</acceptance>
    <verification>Worker HTTP lifecycle, authority, stale-write, concurrent/replay and migration tests.</verification>
  </task>
  <task id="2" size="M" dependencies="1">
    <description>Expose source-linked records in project/request reads and relevant native reconciliation, including resolved outcomes.</description>
    <acceptance>Source work remains unchanged when Shane's part resolves. Routine clients retain outcomes after cursor advancement and use request-time authentication.</acceptance>
    <verification>Worker HTTP reads and routine client tests.</verification>
  </task>
  <task id="3" size="M" dependencies="1">
    <description>Make Needs Shane usable from the Board with pending and resolved views, creation, decision, delegation and completion controls.</description>
    <acceptance>Controls follow server-resolved actor; pending action remains after approval; retries retain exact payload and key after unknown outcome.</acceptance>
    <verification>Board interaction tests and local browser render.</verification>
  </task>
  <checkpoint>Update contracts, run npm run check, review exact final head, publish through codexslo[bot], verify provider actor/SHA/CI, and open a non-draft PR referencing the accepted Foundation envelope.</checkpoint>
  <boundary>Each new entry names one existing project or Work Request. Request association derives its project without requiring a new Project. Legacy decision provenance remains explicitly unknown. Delegation records permission for this action without creating an accepted obligation or executing external work.</boundary>
</implementation_plan>

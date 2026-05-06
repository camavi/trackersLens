const utility = new Utility();
const db = new DatabaseIndexedDB({
  dbName: tlConfig.DB_NAME,
  startTables: [
    { name: tlConfig.TABLES.TL_WIDGETS, columns: [{ name: 'content' }] },
    { name: tlConfig.TABLES.TL_PAGES, columns: [{ name: 'content' }] },
  ]
});

tlConfig.keyPage = cms.GET.key ?? utility.address();
const topBar = new TopBar({ db, mode: 'editWidget' });
const dashboardMenu = new DashboardMenu({ db });
const getWidgets = db.getAllData(tlConfig.TABLES.TL_WIDGETS);
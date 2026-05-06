const utility = new Utility();
const db = new DatabaseIndexedDB({
  dbName: tlConfig.DB_NAME,
  startTables: [
    { name: tlConfig.TABLES.TL_WIDGETS, columns: [{ name: 'content' }] },
    { name: tlConfig.TABLES.TL_PAGES, columns: [{ name: 'content' }] },
  ]
});

tlConfig.keyPage = _?.GET?.key ?? utility.address();
const topBar = new TopBar({ db });
const dashboardMenu = new DashboardMenu({ db });
const mapPage = new MapPage({ db });

mapPage.moveWidget({
  posRow: 1,
  posCol: 5,
});
mapPage.moveWidget({
  posRow: 6,
  posCol: 3,
});
mapPage.moveWidget({
  posRow: 9,
  posCol: 3,
});
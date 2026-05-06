class DashboardMenu {
  constructor(config) {
    this.db = config.db;
    this.mount();
  }

  mount = async () => {

    const menuLeft = _.div({ class: 'menu-left' });
    document.body.appendChild(menuLeft);

    const btnSearchWidget = _.button(_.i({ class: 'cms-icon search' }));
    menuLeft.appendChild(btnSearchWidget);
    btnSearchWidget.onclick = () => {
      this.searchWidget();
    };

    const btnCreateWidget = _.button(_.i({ class: 'cms-icon plus' }));
    menuLeft.appendChild(btnCreateWidget);
    btnCreateWidget.onclick = () => {
      this.createNewWidget();
    };
  }

  searchWidget = async () => {
    const loadWidget = new LoadWidget({ db: this.db });
    loadWidget.search();
  }
  createNewWidget = async () => {
    const ce = new CreateWidget({
      keyPage: tlConfig.keyPage,
      db: this.db
    });
    ce.open();
  }
}
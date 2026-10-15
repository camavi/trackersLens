class LoadWidget {
  constructor(config) {
    this.db = config.db;
  }
  getWidgetId(id) {
    return this.db.get(tlConfig.TABLES.TL_WIDGETS, id);
  }
  async search() {
    this.widgets = await db.getAllData(tlConfig.TABLES.TL_WIDGETS);
    this.page = db.getAllData(tlConfig.TABLES.TL_PAGES);
    this.popup = cms.popup();
    this.popup.classList.add('popup-tl');
    const content = _.div({ class: 'ce-content' });
    this.popup.content.appendChild(content);
    content.appendChild(_.div({ class: 'jss-m-b-20' }, 'Search Widgets'));
    const searchInput = cms.view.addInput({ class: 'search-input jss-w-100', placeholder: 'Search...' });
    content.appendChild(_.div({ class: 'jss-p-20' }, searchInput));

    const contentWidgets = _.div({ class: 'tl-grid' });
    content.appendChild(contentWidgets);
    this.widgets.forEach(async (widget) => {
      const boxWidget = await this.boxWidget(widget);
      contentWidgets.appendChild(boxWidget);
    });
  }
  async insertWidget(data) {

  }
  async boxWidget(data) {
    const btnInsert = _.button({ class: 'btn-insert' }, 'Insert');
    const btnRemove = _.button({ class: 'jss-f-right jss-btn-danger' }, _.i({ class: 'jss-icon trash' }));
    const btnEdit = _.button({ class: 'btn-edit jss-m-l-10 jss-m-r-10' }, 'Edit');
    const btnChecked = _.button({ class: 'btn-checked' }, 'Checked');
    const category = await utility.findKeyWidget(data.content.category ?? '');
    const master = _.div({ class: 'tl-box-widget' },
      _.div({ class: 'category' },
        _.div(_.b('Category: '), category?.category),
        _.div(_.b('Type: '), category?.name)
      ),
      _.h3(_.b("Name: "), data.content.name),
      _.h3(_.b("Author: "), data.content.author),
      _.div(_.b('Description: ')),
      _.div({ class: 'description' }, data.content.description),
      _.div({ class: 'jss-t-a-right' },
        _.b('Version: '), _.span({ class: 'version' }, data.content.version)
      ),
      _.div({ class: 'jss-m-t-10' }, btnChecked, btnEdit, btnInsert, btnRemove)
    );
    return master;
  }
}
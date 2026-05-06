class TopBar {
  DB_WIDGETS = tlConfig.TABLES.TL_WIDGETS;
  DB_PAGES = tlConfig.TABLES.TL_PAGES;

  constructor(config) {
    this.db = config.db;
    if (config.mode === 'editPage') {
      this.mountEditPage();
    } else if (config.mode === 'editWidget') {
      this.mountEditWidget();
    }

  }

  mountEditPage = () => {
    const topBar = _.div({ class: 'top-bar' });
    document.body.appendChild(topBar);

    const keyPage = tlConfig.keyPage;
    topBar.appendChild(_.div({ class: 'key' }, _.b('KEY: '), keyPage));

    const btnSettingPage = _.button({ class: 'btn-setting-page' }, _.i({ class: 'cms-icon setting-fill' }));
    topBar.appendChild(btnSettingPage);

    btnSettingPage.onclick = function () {
      this.settingPage();
    };
  }
  mountEditWidget = () => {
    const topBar = _.div({ class: 'top-bar' });
    document.body.appendChild(topBar);

    const btnSettingPage = _.button({ class: 'btn-setting-page' }, _.i({ class: 'cms-icon setting-fill' }));
    topBar.appendChild(btnSettingPage);

    btnSettingPage.onclick = () => {
      this.settingPage();
    };
  }

  settingPage() {
    const manifest = tlConfig.MANIFEST;
    const popup = cms.popup();
    popup.classList.add('popup-tl');
    const content = popup.content;
    const btnSave = _.button({ class: 'btn-save' }, 'Save');
    btnSave.startView();
    content.appendChild(btnSave);
    btnSave.onclick = async function () {
      btnSave.loader = true;
      await this.db.addData('tl_pages', {
        id: keyPage,
        content: keyPage
      });
      btnSave.loader = false;
    };
  }
}